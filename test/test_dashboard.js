/**
 * @file test_dashboard.js
 * Unit tests for gpu_check.js, web_llm_service.js multi-CDN & test bench,
 * dashboard.js lifecycle, and controller error banner notifications.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkWebGPUSupport } from '../src/llm/gpu_check.js';
import { WebLLMService, WEBLLM_CDN_URLS } from '../src/llm/web_llm_service.js';
import { LLMDashboard } from '../src/llm/dashboard.js';
import { CheckersController } from '../src/controller.js';
import { PLAYER_RED, PLAYER_BLACK } from '../src/state.js';

test('Hardware & WebGPU Detection - Environment without navigator.gpu', async (t) => {
  // In Node.js environment without navigator.gpu
  const result = await checkWebGPUSupport();
  assert.equal(result.supported, false);
  assert.match(result.reason, /not supported/i);
});

test('Hardware & WebGPU Detection - Simulated WebGPU with adapter details', async (t) => {
  const mockNav = {
    gpu: {
      requestAdapter: async (options) => ({
        isFallbackAdapter: false,
        limits: {
          maxBufferSize: 268435456,
          maxComputeWorkgroupStorageSize: 32768,
          maxStorageBufferBindingSize: 134217728
        },
        requestAdapterInfo: async () => ({
          vendor: 'Apple',
          architecture: 'Apple M3 Pro',
          device: 'Apple M3 Pro',
          description: 'Metal GPU'
        })
      })
    }
  };

  const res = await checkWebGPUSupport(mockNav);
  assert.equal(res.supported, true);
  assert.match(res.adapterName, /Apple/i);
  assert.equal(res.details.isFallbackAdapter, false);
  assert.equal(res.details.maxBufferSize, 268435456);
  assert.equal(res.details.vendor, 'Apple');
});

test('WebLLM Multi-CDN Service - Dynamic CDN import fallbacks', async (t) => {
  const service = new WebLLMService();

  const attemptedUrls = [];
  service.setCustomImportFn(async (url) => {
    attemptedUrls.push(url);
    if (url === WEBLLM_CDN_URLS[0]) {
      throw new Error('Primary CDN Timeout');
    }
    if (url === WEBLLM_CDN_URLS[1]) {
      // Secondary CDN succeeds
      return {
        CreateMLCEngine: async () => ({ mock: true })
      };
    }
    return null;
  });

  const { module: mod, cdnUrl } = await service.loadWebLLMModule();
  assert.ok(mod.CreateMLCEngine);
  assert.equal(cdnUrl, WEBLLM_CDN_URLS[1]);
  assert.deepEqual(attemptedUrls, [WEBLLM_CDN_URLS[0], WEBLLM_CDN_URLS[1]]);
});

test('WebLLM Service - Granular State & Logging Listeners', async (t) => {
  const service = new WebLLMService();

  const logs = [];
  service.onLog((entry) => logs.push(entry));

  const state1 = service.getState();
  assert.equal(state1.isReady, false);
  assert.equal(state1.isInitializing, false);

  // Set mock engine
  service.setCustomEngine({
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: 'hello' } }] })
      }
    }
  });

  const state2 = service.getState();
  assert.equal(state2.isReady, true);
  assert.equal(state2.currentModelId, 'mock-model');
});

test('WebLLM Service - Test Bench testChat() and testTacticalMove()', async (t) => {
  const service = new WebLLMService();

  const mockEngine = {
    chat: {
      completions: {
        create: async (params) => {
          if (params.stream) {
            return (async function* () {
              const toks = ['Checkers ', 'is ', 'a ', 'tactical ', 'game!'];
              for (const tok of toks) {
                yield { choices: [{ delta: { content: tok } }] };
              }
            })();
          }
          return {
            choices: [{
              message: {
                content: '```json\n{"moveIndex": 2, "tacticalReason": "Advance center square"}\n```'
              }
            }]
          };
        }
      }
    }
  };

  service.setCustomEngine(mockEngine);

  // 1. Test testChat
  const chatRes = await service.testChat('Insult me');
  assert.equal(chatRes.text, 'Checkers is a tactical game!');
  assert.equal(chatRes.tokenCount, 5);
  assert.ok(chatRes.tokensPerSec > 0);

  // 2. Test testTacticalMove
  const moveRes = await service.testTacticalMove();
  assert.ok(moveRes.rawResponse.includes('moveIndex'));
  assert.equal(moveRes.parsed.success, true);
  assert.equal(moveRes.parsed.index, 2);
  assert.equal(moveRes.verified, true);
  assert.ok(moveRes.move !== null);
});

test('LLMDashboard - UI Lifecycle and Hardware Rendering', async (t) => {
  const service = new WebLLMService();
  const dashboard = new LLMDashboard({ service });

  // Mock DOM elements
  const mockModal = {
    classList: {
      add: (cls) => mockModal.classes.add(cls),
      remove: (cls) => mockModal.classes.delete(cls)
    },
    classes: new Set(['hidden']),
    addEventListener: () => {}
  };

  const mockBadge = { className: '', textContent: '' };
  const mockAdapter = { textContent: '' };
  const mockNotes = { textContent: '' };

  dashboard.modal = mockModal;
  dashboard.gpuBadge = mockBadge;
  dashboard.gpuAdapterName = mockAdapter;
  dashboard.gpuNotes = mockNotes;

  // Render hardware status: WebGPU supported
  dashboard.renderHardwareStatus({
    supported: true,
    adapterName: 'Apple M3 Pro',
    details: { isFallbackAdapter: false, maxBufferSize: 268435456 }
  });

  assert.equal(mockBadge.textContent, 'WebGPU Supported');
  assert.match(mockBadge.className, /status-badge-success/);
  assert.equal(mockAdapter.textContent, 'Apple M3 Pro');

  // Open & Close Modal
  dashboard.open();
  assert.equal(dashboard.isOpen, true);
  assert.ok(!mockModal.classes.has('hidden'));

  dashboard.close();
  assert.equal(dashboard.isOpen, false);
  assert.ok(mockModal.classes.has('hidden'));
});

test('Controller - Error Banner and Fallback on LLM Move Failure', async (t) => {
  const mockRenderer = {
    boardElement: { addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } },
    sound: { playMove: () => {}, playCapture: () => {}, playCrown: () => {}, playWin: () => {} },
    turnMessage: { textContent: '' },
    render() {},
    setPlayerInfo() {}
  };

  const controller = new CheckersController(mockRenderer);
  controller.setGameMode('llm', false);

  // Invalidate player's service to force an error
  controller.players[PLAYER_BLACK].requestMove = async () => {
    throw new Error('WebGPU device lost');
  };

  // Simulate Red moving 21 -> 17 to trigger Black's turn
  controller.init();
  controller.handleSquareClick(21);
  controller.handleSquareClick(17);

  assert.equal(controller.state.turn, PLAYER_BLACK);

  // Wait for scheduled automated turn (300ms + buffer)
  await new Promise((resolve) => setTimeout(resolve, 380));

  // Should have caught error, set banner, and executed fallback move to Red's turn
  assert.match(controller.statusMessage, /⚠️ LLM error: WebGPU device lost. Fallback move executed./);
  assert.equal(mockRenderer.turnMessage.textContent, controller.statusMessage);
  assert.equal(controller.state.turn, PLAYER_RED);
});
