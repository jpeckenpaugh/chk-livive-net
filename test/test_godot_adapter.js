/**
 * @file test_godot_adapter.js
 * Unit tests for GodotAdapter, window.GodotCheckersBridge communication,
 * CheckersRenderer interface contract, audio triggers, and animation watchdog.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { GodotAdapter, SoundEffects } from '../src/godot_adapter.js';
import { CheckersController } from '../src/controller.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  createInitialState
} from '../src/state.js';

test('GodotAdapter - Instantiation & CheckersRenderer interface adherence', (t) => {
  const adapter = new GodotAdapter();

  // Verify Renderer methods exist
  assert.equal(typeof adapter.render, 'function');
  assert.equal(typeof adapter.animateMove, 'function');
  assert.equal(typeof adapter.setBoardFlipped, 'function');
  assert.equal(typeof adapter.setShowNotation, 'function');
  assert.equal(typeof adapter.setMuted, 'function');
  assert.equal(typeof adapter.setPlayerInfo, 'function');
  assert.equal(typeof adapter.streamBanter, 'function');
  assert.equal(typeof adapter.hideBanter, 'function');
  assert.equal(typeof adapter.addBanterToFeed, 'function');
  assert.equal(typeof adapter.updateDownloadProgress, 'function');
  assert.equal(typeof adapter.setSpectatorMode, 'function');
  assert.equal(typeof adapter.hideModalForReview, 'function');
  assert.equal(typeof adapter.showReviewRecap, 'function');

  // Verify Sound effects object exists
  assert.ok(adapter.sound);
  assert.equal(typeof adapter.sound.playMove, 'function');
  assert.equal(typeof adapter.sound.playCapture, 'function');
  assert.equal(typeof adapter.sound.playCrown, 'function');
  assert.equal(typeof adapter.sound.playWin, 'function');
  assert.equal(typeof adapter.sound.playIllegal, 'function');

  // Verify global bridge exists
  const root = typeof window !== 'undefined' ? window : globalThis;
  assert.ok(root.GodotCheckersBridge);
  assert.equal(typeof root.GodotCheckersBridge.notifyRender, 'function');
  assert.equal(typeof root.GodotCheckersBridge.notifyAnimateMove, 'function');
  assert.equal(typeof root.GodotCheckersBridge.onSquareClicked, 'function');
  assert.equal(typeof root.GodotCheckersBridge.onAnimationComplete, 'function');
});

test('GodotAdapter - render() transmits valid JSON payload to bridge', (t) => {
  const adapter = new GodotAdapter();
  const root = typeof window !== 'undefined' ? window : globalThis;

  let capturedJson = null;
  root.GodotCheckersBridge._onGodotRender = (json) => {
    capturedJson = json;
  };

  const state = createInitialState();
  adapter.render({
    state,
    legalMovesForSelected: [{ from: 20, to: 16, isJump: false }],
    selectableIndices: new Set([20, 21, 22, 23]),
    lastMove: { from: 21, to: 17 },
    mustJump: false,
    message: "Red's Turn",
    newlyCrownedIndex: 2,
    stats: { turnCount: 5, redCaptures: 1, blackCaptures: 0 },
    winReason: null,
    preyIndices: new Set([10])
  });

  assert.ok(capturedJson, 'notifyRender should transmit JSON string');
  const parsed = JSON.parse(capturedJson);

  assert.equal(parsed.turn, PLAYER_RED);
  assert.equal(parsed.board.length, 32);
  assert.deepEqual(parsed.selectableIndices, [20, 21, 22, 23]);
  assert.deepEqual(parsed.preyIndices, [10]);
  assert.equal(parsed.message, "Red's Turn");
  assert.equal(parsed.newlyCrownedIndex, 2);
  assert.equal(parsed.stats.turnCount, 5);
  assert.deepEqual(parsed.lastMove, { from: 21, to: 17 });
});

test('GodotAdapter - animateMove() resolves when onAnimationComplete is called', async (t) => {
  const adapter = new GodotAdapter();
  const root = typeof window !== 'undefined' ? window : globalThis;

  let moveRequestedJson = null;
  root.GodotCheckersBridge._onGodotAnimateMove = (json) => {
    moveRequestedJson = json;
  };

  const movePromise = adapter.animateMove({
    from: 20,
    to: 16,
    isJump: false,
    captured: null
  });

  assert.ok(moveRequestedJson, 'animateMove should transmit move JSON to Godot');
  const moveData = JSON.parse(moveRequestedJson);
  assert.equal(moveData.from, 20);
  assert.equal(moveData.to, 16);
  assert.equal(moveData.isJump, false);
  assert.equal(moveData.captured, null);

  // Simulate Godot notifying that animation finished
  root.GodotCheckersBridge.onAnimationComplete();

  // Ensure Promise resolves promptly
  await movePromise;
  assert.ok(true, 'animateMove resolved on onAnimationComplete');
});

test('GodotAdapter - animateMove() watchdog resolves after 1500ms safety timeout', async (t) => {
  const adapter = new GodotAdapter();
  const start = Date.now();

  // Call animateMove without calling onAnimationComplete
  await adapter.animateMove({
    from: 22,
    to: 15,
    isJump: true,
    captured: 18
  });

  const elapsed = Date.now() - start;
  // Should resolve around 1500ms (allow margin for timer jitter)
  assert.ok(elapsed >= 1400, `Watchdog should wait ~1500ms, elapsed: ${elapsed}ms`);
});

test('GodotAdapter - Audio triggers fire sound methods without throwing', (t) => {
  const adapter = new GodotAdapter();

  assert.doesNotThrow(() => {
    adapter.sound.playMove();
    adapter.sound.playCapture();
    adapter.sound.playCrown();
    adapter.sound.playWin();
    adapter.sound.playIllegal();
  });

  // Verify mute toggle suppresses calls
  adapter.setMuted(true);
  assert.equal(adapter.sound.muted, true);
  assert.doesNotThrow(() => {
    adapter.sound.playMove();
  });

  adapter.setMuted(false);
  assert.equal(adapter.sound.muted, false);
});

test('GodotAdapter - Bridge callbacks: player info, banter, spectator, notation, flip', (t) => {
  const adapter = new GodotAdapter();
  const root = typeof window !== 'undefined' ? window : globalThis;

  let playerInfoCaptured = null;
  root.GodotCheckersBridge._onGodotPlayerInfo = (color, json) => {
    playerInfoCaptured = { color, parsed: JSON.parse(json) };
  };

  adapter.setPlayerInfo(PLAYER_RED, { name: 'Alice', avatar: '👩' });
  assert.deepEqual(playerInfoCaptured, {
    color: PLAYER_RED,
    parsed: { name: 'Alice', avatar: '👩' }
  });

  let banterCaptured = null;
  root.GodotCheckersBridge._onGodotBanterStream = (color, text) => {
    banterCaptured = { color, text };
  };

  adapter.streamBanter(PLAYER_BLACK, 'A cunning maneuver!');
  assert.deepEqual(banterCaptured, {
    color: PLAYER_BLACK,
    text: 'A cunning maneuver!'
  });

  adapter.hideBanter(PLAYER_BLACK);
  assert.deepEqual(banterCaptured, {
    color: PLAYER_BLACK,
    text: ''
  });

  let spectatorCaptured = null;
  root.GodotCheckersBridge._onGodotSpectatorMode = (active, paused) => {
    spectatorCaptured = { active, paused };
  };
  adapter.setSpectatorMode(true, true);
  assert.deepEqual(spectatorCaptured, { active: true, paused: true });

  let flipCaptured = null;
  root.GodotCheckersBridge._onGodotBoardFlipped = (flipped) => {
    flipCaptured = flipped;
  };
  adapter.setBoardFlipped(true);
  assert.equal(flipCaptured, true);

  let notationCaptured = null;
  root.GodotCheckersBridge._onGodotShowNotation = (show) => {
    notationCaptured = show;
  };
  adapter.setShowNotation(true);
  assert.equal(notationCaptured, true);

  let progressCaptured = null;
  root.GodotCheckersBridge._onGodotDownloadProgress = (json) => {
    progressCaptured = JSON.parse(json);
  };
  adapter.updateDownloadProgress({ text: 'Loading 50%', progress: 0.5 });
  assert.deepEqual(progressCaptured, { text: 'Loading 50%', progress: 0.5 });
});

test('GodotAdapter - Controller initializes and runs with GodotAdapter without errors', (t) => {
  const adapter = new GodotAdapter();
  const controller = new CheckersController(adapter);

  assert.doesNotThrow(() => {
    controller.init();
  });

  assert.equal(controller.state.turn, PLAYER_RED);

  // Simulate Godot clicking square 20 (legal Red opening piece)
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.GodotCheckersBridge.onSquareClicked(20);

  // Piece 20 should now be selected
  assert.equal(controller.state.selectedSquare, 20);

  // Clicking square 16 executes move 20 -> 16
  root.GodotCheckersBridge.onSquareClicked(16);

  // Turn completes
  assert.equal(controller.state.board[20], 0); // vacated
  assert.equal(controller.state.board[16], 1); // occupied
  assert.equal(controller.state.turn, PLAYER_BLACK);
});

test('GodotAdapter - Dummy DOM objects absorb property writes and method calls safely', (t) => {
  const adapter = new GodotAdapter();

  assert.doesNotThrow(() => {
    adapter.turnMessage.textContent = 'Thinking...';
    adapter.turnMessage.classList.add('thinking');
    adapter.turnMessage.classList.remove('thinking');
    adapter.arenaFeedList.innerHTML = '';
    adapter.arenaFeedList.appendChild({});
    adapter.addBanterToFeed({
      color: PLAYER_RED,
      name: 'Red',
      avatar: '🔴',
      text: 'Good move!',
      moveDesc: '20-16'
    });
  });

  assert.ok(adapter.arenaFeedList.textContent.includes('Good move!'));
});
