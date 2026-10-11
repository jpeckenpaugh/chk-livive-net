/**
 * @file test_lifecycle.js
 * Unit tests verifying CheckersController lifecycle state machine (TITLE, PRELOAD, PLAYING, GAMEOVER),
 * pre-load staging gate for LLMs, instant launch for Minimax/PvP,
 * return-to-title, and Prompt & Engine Debugger telemetry history.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CheckersController, LIFECYCLE } from '../src/controller.js';
import { DebugInspector } from '../src/llm/debug_inspector.js';
import { LLMWorkerBridge } from '../src/workers/llm_bridge.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  RED_MAN,
  createInitialBoard
} from '../src/state.js';

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
      playWin: () => {},
      playIllegal: () => {}
    },
    render() {},
    setPlayerInfo() {},
    setBoardFlipped() {},
    setShowNotation() {},
    setMuted() {}
  };
}

test('Lifecycle - State Constants and Transitions', (t) => {
  assert.equal(LIFECYCLE.TITLE, 'TITLE');
  assert.equal(LIFECYCLE.PRELOAD, 'PRELOAD');
  assert.equal(LIFECYCLE.PLAYING, 'PLAYING');
  assert.equal(LIFECYCLE.GAMEOVER, 'GAMEOVER');

  const controller = new CheckersController(createMockRenderer());
  controller.setLifecycleState(LIFECYCLE.TITLE);
  assert.equal(controller.lifecycleState, LIFECYCLE.TITLE);

  controller.setLifecycleState(LIFECYCLE.PRELOAD);
  assert.equal(controller.lifecycleState, LIFECYCLE.PRELOAD);

  controller.setLifecycleState(LIFECYCLE.PLAYING);
  assert.equal(controller.lifecycleState, LIFECYCLE.PLAYING);

  controller.setLifecycleState(LIFECYCLE.GAMEOVER);
  assert.equal(controller.lifecycleState, LIFECYCLE.GAMEOVER);
});

test('Lifecycle - Exit to Title from Active Match', (t) => {
  const controller = new CheckersController(createMockRenderer());
  controller.init();
  controller.setLifecycleState(LIFECYCLE.PLAYING);

  // Exit to title
  controller.exitToTitle();
  assert.equal(controller.lifecycleState, LIFECYCLE.TITLE);
  assert.equal(controller.spectatorState, 'paused');
  assert.equal(controller.turnAbortController, null);
  assert.equal(controller.aiTimeoutId, null);
});

test('Lifecycle - Launch Match with Minimax skips Preload', async (t) => {
  const controller = new CheckersController(createMockRenderer());
  controller.init();
  controller.setLifecycleState(LIFECYCLE.TITLE);

  await controller.launchMatch({
    mode: 'minimax',
    difficulty: 'hard',
    minimaxColor: 'red'
  });

  assert.equal(controller.lifecycleState, LIFECYCLE.PLAYING);
  assert.equal(controller.gameMode, 'minimax');
  assert.equal(controller.difficulty, 'hard');
  assert.equal(controller.players[PLAYER_RED].type, 'human');
  assert.equal(controller.players[PLAYER_BLACK].type, 'minimax');
});

test('Lifecycle - Launch Match with PvP skips Preload', async (t) => {
  const controller = new CheckersController(createMockRenderer());
  controller.init();
  controller.setLifecycleState(LIFECYCLE.TITLE);

  await controller.launchMatch({
    mode: 'pvp'
  });

  assert.equal(controller.lifecycleState, LIFECYCLE.PLAYING);
  assert.equal(controller.gameMode, 'pvp');
  assert.equal(controller.players[PLAYER_RED].type, 'human');
  assert.equal(controller.players[PLAYER_BLACK].type, 'human');
});

test('Lifecycle - Launch Match with LLM passes through Preload Gate', async (t) => {
  const controller = new CheckersController(createMockRenderer());
  controller.bridge = new LLMWorkerBridge({ mockMode: true });
  controller.init();
  controller.setLifecycleState(LIFECYCLE.TITLE);

  await controller.launchMatch({
    mode: 'llm',
    llmColor: 'red',
    llmPersona: 'pirate',
    modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC'
  });

  assert.equal(controller.lifecycleState, LIFECYCLE.PLAYING);
  assert.equal(controller.gameMode, 'llm');
  assert.equal(controller.players[PLAYER_RED].type, 'human');
  assert.equal(controller.players[PLAYER_BLACK].type, 'llm');
  assert.equal(controller.players[PLAYER_BLACK].persona.id, 'pirate');
});

test('Prompt & Engine Debugger - Telemetry Recording & Log Export', (t) => {
  const mockBridge = new LLMWorkerBridge({ mockMode: true });
  const inspector = new DebugInspector({ bridge: mockBridge });

  assert.equal(inspector.turns.length, 0);

  // Record a tactical move turn
  inspector.recordTelemetry({
    type: 'tactical_move',
    turn: PLAYER_RED,
    chosenMove: { from: 21, to: 17, isJump: false },
    reasoning: 'Advances left wing',
    rawPrompt: [{ role: 'system', content: 'You are checkers AI' }, { role: 'user', content: 'Board state...' }],
    rawResponse: '{"moveIndex": 0}',
    latencyMs: 145,
    attempts: 1,
    isFallback: false,
    tokensPerSec: 12.5,
    tokenCount: 18
  });

  assert.equal(inspector.turns.length, 1);
  assert.equal(inspector.turns[0].turnNumber, 1);
  assert.equal(inspector.turns[0].tactical.latencyMs, 145);
  assert.equal(inspector.turns[0].tactical.isFallback, false);

  // Record banter for the turn
  inspector.recordTelemetry({
    type: 'banter',
    personaId: 'pirate',
    rawPrompt: [{ role: 'system', content: 'Pirate banter' }],
    fullText: 'Ahoy, fair wind on the board!',
    latencyMs: 80
  });

  assert.equal(inspector.turns[0].banter.fullText, 'Ahoy, fair wind on the board!');

  // Export logs JSON
  const exported = inspector.exportLogs();
  assert.ok(typeof exported === 'string');
  const parsed = JSON.parse(exported);
  assert.equal(parsed.turnsCount, 1);
  assert.equal(parsed.turns[0].tactical.reasoning, 'Advances left wing');

  // Clear logs
  inspector.clearLogs();
  assert.equal(inspector.turns.length, 0);
});
