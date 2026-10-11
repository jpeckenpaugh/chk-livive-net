/**
 * @file test_worker_bridge.js
 * Unit tests verifying LLMWorkerBridge request/response protocol,
 * mock fallback execution, retry recovery, streaming banter, and telemetry history.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LLMWorkerBridge } from '../src/workers/llm_bridge.js';
import { WebLLMService } from '../src/llm/web_llm_service.js';
import { getPersona } from '../src/llm/personas.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  createInitialBoard
} from '../src/state.js';
import { getLegalMoves } from '../src/rules.js';

test('LLMWorkerBridge - Configuration & Environment Detection', (t) => {
  const bridge = new LLMWorkerBridge({ mockMode: true });

  assert.equal(bridge.mockMode, true);
  assert.equal(bridge.canUseWorker(), false, 'mockMode forces worker off');
  assert.equal(bridge.telemetryHistory.length, 0);

  const mockEngine = { chat: { completions: { create: async () => ({ choices: [] }) } } };
  bridge.setCustomEngine(mockEngine);
  assert.equal(bridge._customEngine, mockEngine);
});

test('LLMWorkerBridge - Model Initialization and Progress Reporting', async (t) => {
  const bridge = new LLMWorkerBridge({ mockMode: true });

  const progressReports = [];
  const result = await bridge.initModel({
    modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    onProgress: (p) => progressReports.push(p)
  });

  assert.equal(result.success, true);
  assert.equal(result.modelId, 'Llama-3.2-1B-Instruct-q4f16_1-MLC');
  assert.ok(progressReports.length > 0);
  assert.equal(progressReports[progressReports.length - 1].progress, 1.0);
  assert.equal(bridge.isWorkerReady, true);
});

test('LLMWorkerBridge - Tactical Move Generation with Mock Engine', async (t) => {
  const mockService = new WebLLMService();
  mockService.setCustomEngine({
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              content: '```json\n{"moveIndex": 2, "tacticalReason": "Center control"}\n```'
            }
          }]
        })
      }
    }
  });

  const bridge = new LLMWorkerBridge({ service: mockService, mockMode: true });
  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_RED);

  const result = await bridge.generateMove({
    board,
    turn: PLAYER_RED,
    legalMoves,
    tacticalMode: 'wild'
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.chosenMove, legalMoves[2]);
  assert.equal(result.reasoning, 'Center control');
  assert.equal(result.isFallback, false);
  assert.ok(result.latencyMs >= 0);
  assert.ok(result.rawPrompt.length > 0);
  assert.match(result.rawResponse, /moveIndex/);
});

test('LLMWorkerBridge - Forced Single Move Bypass', async (t) => {
  const bridge = new LLMWorkerBridge({ mockMode: true });
  const board = createInitialBoard();
  const singleMove = [{ from: 21, to: 17, isJump: false, captured: null }];

  const result = await bridge.generateMove({
    board,
    turn: PLAYER_RED,
    legalMoves: singleMove
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.chosenMove, singleMove[0]);
  assert.equal(result.isFallback, false);
  assert.equal(result.attempts, 1);
});

test('LLMWorkerBridge - Retry Loop and Fallback Heuristic on Malformed Output', async (t) => {
  const mockService = new WebLLMService();
  let queryCount = 0;
  mockService.setCustomEngine({
    chat: {
      completions: {
        create: async () => {
          queryCount++;
          // Always return invalid unparseable text
          return { choices: [{ message: { content: 'I cannot decide any move index!' } }] };
        }
      }
    }
  });

  const bridge = new LLMWorkerBridge({ service: mockService, mockMode: true });
  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_RED);

  const result = await bridge.generateMove({
    board,
    turn: PLAYER_RED,
    legalMoves,
    tacticalMode: 'wild'
  });

  // Should have attempted up to max retries and fallen back
  assert.ok(queryCount > 1, 'Should have executed retry queries');
  assert.equal(result.isFallback, true);
  assert.ok(result.chosenMove);
  assert.ok(legalMoves.some((m) => m.from === result.chosenMove.from && m.to === result.chosenMove.to));
});

test('LLMWorkerBridge - Banter Streaming and Telemetry Recording', async (t) => {
  const mockService = new WebLLMService();
  mockService.setCustomEngine({
    chat: {
      completions: {
        create: async (params) => {
          if (params.stream) {
            return (async function* () {
              const tokens = ['Arrr, ', 'watch ', 'yer ', 'flank!'];
              for (const tok of tokens) {
                yield { choices: [{ delta: { content: tok } }] };
              }
            })();
          }
          return { choices: [{ message: { content: 'Shiver me timbers!' } }] };
        }
      }
    }
  });

  const bridge = new LLMWorkerBridge({ service: mockService, mockMode: true });
  const persona = getPersona('pirate');
  const board = createInitialBoard();
  const move = { from: 21, to: 17, isJump: false };

  let streamedTokens = '';
  const fullBanter = await bridge.streamBanter({
    persona,
    move,
    board,
    turn: PLAYER_RED,
    onToken: (tok) => { streamedTokens += tok; }
  });

  assert.equal(fullBanter, 'Arrr, watch yer flank!');
  assert.equal(streamedTokens, 'Arrr, watch yer flank!');

  // Check telemetry was recorded
  const history = bridge.getTelemetryHistory();
  assert.ok(history.length > 0);
  const banterEntry = history.find((h) => h.type === 'banter');
  assert.ok(banterEntry);
  assert.equal(banterEntry.fullText, 'Arrr, watch yer flank!');
});
