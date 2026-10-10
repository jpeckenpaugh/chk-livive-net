/**
 * @file test_spectator.js
 * Unit tests for Model vs Model Arena Spectator Controls:
 * Play, Pause, Step Move, and Speed pacing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CheckersController } from '../src/controller.js';
import { MinimaxPlayer } from '../src/players/minimax_player.js';
import { PLAYER_RED, PLAYER_BLACK } from '../src/state.js';

function createMockRenderer() {
  return {
    boardElement: {
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {} }
    },
    sound: {
      playMove: () => {},
      playCapture: () => {},
      playCrown: () => {},
      playWin: () => {}
    },
    render() {},
    setBoardFlipped() {},
    setShowNotation() {},
    setMuted() {},
    setPlayerInfo() {},
    setSpectatorMode(isActive, isPaused) {
      this.spectatorActive = isActive;
      this.spectatorPaused = isPaused;
    },
    hideBanter() {},
    streamBanter() {},
    addBanterToFeed() {}
  };
}

test('Spectator Arena - Auto Detection when both players are automated', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  // Default: Red is Human, Black is AI -> Not spectator mode
  assert.equal(controller.isSpectatorMode, false);

  // Set Red also to AI -> Becomes Spectator mode
  controller.setPlayer(PLAYER_RED, new MinimaxPlayer({
    id: 'red-ai',
    name: 'Red AI',
    color: PLAYER_RED,
    difficulty: 'easy'
  }));

  assert.equal(controller.isSpectatorMode, true);
});

test('Spectator Arena - Pause and Play Controls', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  controller.configureMatchup({
    redType: 'minimax',
    blackType: 'minimax'
  });

  assert.equal(controller.isSpectatorMode, true);
  assert.equal(controller.spectatorState, 'playing');

  // Pause
  controller.spectatorPause();
  assert.equal(controller.spectatorState, 'paused');
  assert.equal(mockRenderer.spectatorPaused, true);

  // Play
  controller.spectatorPlay();
  assert.equal(controller.spectatorState, 'playing');
  assert.equal(mockRenderer.spectatorPaused, false);

  // Clean up
  controller.spectatorPause();
});

test('Spectator Arena - Step Move Execution', async (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  controller.configureMatchup({
    redType: 'minimax',
    blackType: 'minimax'
  });

  // Start paused
  controller.spectatorPause();
  assert.equal(controller.state.turn, PLAYER_RED);
  assert.equal(controller.lastMove, null);

  // Step exactly 1 move
  controller.spectatorStep();

  // Wait for step turn execution (delay: 50ms in step)
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Red should have moved and turn passed to Black
  assert.ok(controller.lastMove !== null);
  assert.equal(controller.state.turn, PLAYER_BLACK);
  // Spectator mode should automatically be paused again
  assert.equal(controller.spectatorState, 'paused');

  controller.spectatorPause();
});
