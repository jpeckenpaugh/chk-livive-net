/**
 * @file llm_worker.js
 * Dedicated Web Worker for in-browser WebLLM model execution.
 * Completely isolates WebGPU shader compilation, weight caching, and inference
 * from the UI thread to guarantee 60fps animations, timer precision, and responsive interactions.
 */

import { buildTacticalPrompt, buildBanterPrompt } from '../llm/prompts.js';
import { parseMoveIndex, buildTacticalRetryPrompt } from '../llm/parser.js';
import { CheckersAI } from '../ai.js';

// Multi-CDN mirrors in fallback order
const WEBLLM_CDN_URLS = [
  'https://esm.run/@mlc-ai/web-llm',
  'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm',
  'https://esm.sh/@mlc-ai/web-llm@0.2.85'
];

// Provide worker polyfills for browser environments where WebLLM expects window/DOM
if (typeof self !== 'undefined') {
  if (typeof self.window === 'undefined') {
    self.window = self;
  }
  self.addEventListener('error', (event) => {
    console.error('[llm_worker] Worker uncaught error:', event.message || event, event.filename, event.lineno, event.error);
    try {
      self.postMessage({
        type: 'ERROR',
        id: 'global_worker_error',
        payload: { error: event.message || 'Worker uncaught error' }
      });
    } catch (_) {}
  });
  self.addEventListener('unhandledrejection', (event) => {
    console.error('[llm_worker] Worker unhandled promise rejection:', event.reason);
    try {
      self.postMessage({
        type: 'ERROR',
        id: 'global_worker_error',
        payload: { error: event.reason?.message || String(event.reason) || 'Worker unhandled rejection' }
      });
    } catch (_) {}
  });
}

let engine = null;
let currentModelId = null;
let currentAbortController = null;
const minimaxHelper = new CheckersAI('medium');
const telemetryHistory = [];

/**
 * Dynamically imports WebLLM library using CDN fallbacks.
 * @returns {Promise<Object>}
 */
async function loadWebLLMModule() {
  const errors = [];
  for (const url of WEBLLM_CDN_URLS) {
    try {
      const mod = await import(url);
      if (mod && (mod.CreateMLCEngine || mod.MLCEngine)) {
        return mod;
      }
    } catch (e) {
      errors.push(`${url}: ${e.message}`);
    }
  }
  throw new Error(`Failed to load WebLLM from any CDN mirror:\n${errors.join('\n')}`);
}

/**
 * Initializes model weights and runs shader compilation sanity check.
 * @param {string} id - Message request ID
 * @param {string} modelId
 */
async function handleInit(id, modelId) {
  if (engine && currentModelId === modelId) {
    self.postMessage({
      type: 'READY',
      id,
      payload: { modelId }
    });
    return;
  }

  try {
    self.postMessage({
      type: 'PROGRESS',
      payload: { text: `Connecting to WebGPU & importing engine for ${modelId}...`, progress: 0.05 }
    });

    const webllm = await loadWebLLMModule();

    const initProgressCallback = (report) => {
      const text = report.text || 'Loading model weights...';
      const progress = typeof report.progress === 'number' ? report.progress : 0;
      self.postMessage({
        type: 'PROGRESS',
        payload: { text, progress }
      });
    };

    engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback,
      logLevel: 'WARN'
    });

    currentModelId = modelId;

    // Run quick sanity warm-up check to compile initial shaders
    self.postMessage({
      type: 'PROGRESS',
      payload: { text: 'Compiling shaders & verifying neural pipeline...', progress: 0.95 }
    });

    try {
      await engine.chat.completions.create({
        messages: [{ role: 'user', content: 'ready' }],
        max_tokens: 2,
        temperature: 0.1
      });
    } catch (warmupErr) {
      console.warn('[LLMWorker] Warmup sanity check warning:', warmupErr);
    }

    self.postMessage({
      type: 'PROGRESS',
      payload: { text: 'Model loaded and verified ready!', progress: 1.0 }
    });

    self.postMessage({
      type: 'READY',
      id,
      payload: { modelId }
    });
  } catch (err) {
    console.error('[LLMWorker] Initialization error:', err);
    engine = null;
    currentModelId = null;
    self.postMessage({
      type: 'ERROR',
      id,
      payload: { error: err.message || 'Failed to initialize WebLLM in worker' }
    });
  }
}

/**
 * Session A: Tactical Move Selection with internal retry loop.
 * @param {string} id - Request ID
 * @param {Object} payload
 */
async function handleGenerateMove(id, payload) {
  const {
    board: rawBoard,
    turn,
    mustContinueJumpFrom = null,
    legalMoves,
    tacticalMode = 'wild',
    evaluatedCandidates = null
  } = payload;

  const startTime = Date.now();
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const board = new Int8Array(rawBoard);

  if (!legalMoves || legalMoves.length === 0) {
    self.postMessage({
      type: 'MOVE_RESULT',
      id,
      payload: {
        success: false,
        chosenMove: null,
        reasoning: 'No legal moves',
        rawPrompt: [],
        rawResponse: '',
        latencyMs: 0,
        attempts: 0,
        isFallback: false
      }
    });
    return;
  }

  // Single forced move shortcut
  if (legalMoves.length === 1) {
    const single = legalMoves[0];
    self.postMessage({
      type: 'MOVE_RESULT',
      id,
      payload: {
        success: true,
        chosenMove: single,
        reasoning: single.isJump ? 'Forced mandatory jump' : 'Single legal move',
        rawPrompt: [],
        rawResponse: '{"moveIndex": 0, "tacticalReason": "Forced single move"}',
        latencyMs: 1,
        attempts: 1,
        isFallback: false,
        tokensPerSec: 0,
        tokenCount: 10
      }
    });
    return;
  }

  // Tactical candidate evaluation for Grandmaster mode
  let evaluated = evaluatedCandidates;
  if (tacticalMode === 'grandmaster' && !evaluated) {
    const best = minimaxHelper.getBestMove({ board, turn, mustContinueJumpFrom });
    evaluated = legalMoves.map((m) => ({
      move: m,
      rating: (best && m.from === best.from && m.to === best.to)
        ? 'Recommended Master Move'
        : (m.isJump ? 'Mandatory Capture' : 'Standard Development')
    }));
  }

  const initialMessages = buildTacticalPrompt({
    board,
    turn,
    legalMoves,
    tacticalMode,
    evaluatedCandidates: evaluated
  });

  const messages = initialMessages.slice();
  let attempts = 0;
  const maxRetries = 2;
  let rawResponse = '';
  let parsed = null;

  while (attempts <= maxRetries) {
    attempts++;
    if (signal.aborted) return;

    try {
      if (!engine) {
        throw new Error('LLM Engine not initialized');
      }

      const response = await engine.chat.completions.create({
        messages,
        temperature: 0.1,
        max_tokens: 60
      });

      rawResponse = response.choices[0]?.message?.content || '';
      parsed = parseMoveIndex(rawResponse, legalMoves.length);

      if (parsed.success) {
        break;
      }

      if (attempts <= maxRetries) {
        messages.push({ role: 'assistant', content: rawResponse });
        messages.push(buildTacticalRetryPrompt(legalMoves.length, parsed.error));
      }
    } catch (err) {
      if (signal.aborted) return;
      if (attempts > maxRetries) break;
    }
  }

  const latencyMs = Math.max(1, Date.now() - startTime);
  const tokenCount = rawResponse ? Math.ceil(rawResponse.length / 4) : 15;
  const tokensPerSec = latencyMs > 0 ? Math.round((tokenCount / (latencyMs / 1000)) * 10) / 10 : 0;

  let chosenMove;
  let isFallback = false;
  let reasoning = '';

  if (parsed && parsed.success) {
    chosenMove = legalMoves[parsed.index];
    reasoning = parsed.reasoning || 'Tactical move selected';
  } else {
    // Fallback heuristic: Minimax choice or first legal move
    const bestMinimax = minimaxHelper.getBestMove({ board, turn, mustContinueJumpFrom });
    chosenMove = bestMinimax || legalMoves[0];
    isFallback = true;
    reasoning = 'Fallback heuristic engaged after LLM move extraction retry exhaustion.';
  }

  const resultRecord = {
    success: true,
    chosenMove,
    reasoning,
    rawPrompt: initialMessages,
    rawResponse,
    latencyMs,
    attempts,
    isFallback,
    tokensPerSec,
    tokenCount
  };

  telemetryHistory.push({
    type: 'tactical_move',
    turn,
    timestamp: Date.now(),
    ...resultRecord
  });

  self.postMessage({
    type: 'MOVE_RESULT',
    id,
    payload: resultRecord
  });
}

/**
 * Session B: Personality Banter Streamer.
 * @param {string} id - Request ID
 * @param {Object} payload
 */
async function handleStreamBanter(id, payload) {
  const {
    persona,
    move,
    board: rawBoard,
    turn,
    crowned = false,
    opponentBanter = ''
  } = payload;

  const startTime = Date.now();
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  const board = new Int8Array(rawBoard);
  const messages = buildBanterPrompt({
    persona,
    move,
    board,
    turn,
    crowned,
    opponentBanter
  });

  try {
    if (!engine) {
      throw new Error('Engine not ready for banter');
    }

    const chunks = await engine.chat.completions.create({
      messages,
      temperature: 0.85,
      max_tokens: 50,
      stream: true
    });

    let accumulated = '';
    for await (const chunk of chunks) {
      if (signal.aborted) return;
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        accumulated += delta;
        self.postMessage({
          type: 'BANTER_TOKEN',
          id,
          payload: { delta, fullText: accumulated }
        });
      }
    }

    const latencyMs = Math.max(1, Date.now() - startTime);
    const fullText = accumulated.trim();

    telemetryHistory.push({
      type: 'banter',
      personaId: persona?.id,
      timestamp: Date.now(),
      rawPrompt: messages,
      fullText,
      latencyMs
    });

    self.postMessage({
      type: 'BANTER_DONE',
      id,
      payload: { fullText, rawPrompt: messages, latencyMs }
    });
  } catch (err) {
    if (signal.aborted) return;
    self.postMessage({
      type: 'BANTER_DONE',
      id,
      payload: { fullText: '', rawPrompt: messages, latencyMs: Date.now() - startTime }
    });
  }
}

// Global Message Listener for Worker thread
self.onmessage = async (event) => {
  const { type, id, payload } = event.data || {};

  switch (type) {
    case 'INIT':
      await handleInit(id, payload?.modelId);
      break;

    case 'GENERATE_MOVE':
      await handleGenerateMove(id, payload);
      break;

    case 'STREAM_BANTER':
      await handleStreamBanter(id, payload);
      break;

    case 'ABORT':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'RESET':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'GET_TELEMETRY':
      self.postMessage({
        type: 'TELEMETRY_EXPORT',
        id,
        payload: telemetryHistory
      });
      break;

    default:
      console.warn('[LLMWorker] Unknown message type:', type);
  }
};
