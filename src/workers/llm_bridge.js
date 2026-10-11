/**
 * @file llm_bridge.js
 * Main-thread bridge managing communication with the dedicated Web Worker (llm_worker.js).
 * Guarantees 60fps UI by offloading WebLLM inference off the main thread.
 * Supports simulated/mock mode for unit tests and headless environments.
 */

import { buildTacticalPrompt, buildBanterPrompt, formatMoveDescription } from '../llm/prompts.js';
import { parseMoveIndex, executeMoveSelectionWithRetries } from '../llm/parser.js';
import { getPersona, DEFAULT_PERSONA_RED, DEFAULT_PERSONA_BLACK } from '../llm/personas.js';
import { DEFAULT_MODEL_ID } from '../llm/model_registry.js';
import { webLLMService } from '../llm/web_llm_service.js';
import { CheckersAI } from '../ai.js';
import { PLAYER_RED } from '../state.js';

export class LLMWorkerBridge {
  /**
   * @param {Object} [options]
   * @param {string|URL} [options.workerUrl] - Path to worker script
   * @param {boolean} [options.mockMode=false] - Explicitly force mock/in-process mode
   * @param {WebLLMService} [options.service] - Optional custom service
   */
  constructor({
    workerUrl = null,
    mockMode = false,
    service = webLLMService
  } = {}) {
    this.workerUrl = workerUrl;
    this.mockMode = mockMode;
    this.service = service;

    this.worker = null;
    this.isWorkerReady = false;
    this.currentModelId = null;

    this.pendingRequests = new Map();
    this.streamListeners = new Map();
    this.telemetryHistory = [];
    this.telemetryListeners = new Set();
    this.progressListeners = new Set();

    this.minimaxHelper = new CheckersAI('medium');
    this._customEngine = null;
    this.workerFailed = false;

    this._reqCounter = 0;
  }

  /**
   * Generates a unique request ID.
   * @private
   * @returns {string}
   */
  _nextId() {
    this._reqCounter++;
    return `req_${Date.now()}_${this._reqCounter}`;
  }

  /**
   * Checks whether actual Web Workers can be instantiated.
   * @returns {boolean}
   */
  canUseWorker() {
    if (this.mockMode || this.workerFailed) return false;
    if (this._customEngine !== null) return false;
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return false;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('chk_prefer_in_process') === 'true') {
        return false;
      }
    } catch (_) {}
    return true;
  }

  /**
   * Allows setting a custom mock engine (used in unit tests and simulation).
   * @param {Object|null} engine
   */
  setCustomEngine(engine) {
    this._customEngine = engine;
    if (this.service) {
      this.service.setCustomEngine(engine);
    }
  }

  /**
   * Subscribes to telemetry records (turns, prompts, responses, latencies).
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onTelemetry(callback) {
    this.telemetryListeners.add(callback);
    return () => this.telemetryListeners.delete(callback);
  }

  /**
   * Subscribes to model initialization progress reports.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onProgress(callback) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  _notifyProgress(report) {
    for (const listener of this.progressListeners) {
      try {
        listener(report);
      } catch (e) {
        console.error('Progress listener error:', e);
      }
    }
  }

  /**
   * Appends and broadcasts a telemetry entry.
   * @param {Object} record
   */
  addTelemetry(record) {
    const entry = {
      id: record.id || this._nextId(),
      timestamp: record.timestamp || Date.now(),
      ...record
    };
    this.telemetryHistory.push(entry);
    for (const listener of this.telemetryListeners) {
      try {
        listener(entry);
      } catch (e) {
        console.error('Telemetry listener error:', e);
      }
    }
    return entry;
  }

  /**
   * Returns copy of telemetry records.
   * @returns {Array<Object>}
   */
  getTelemetryHistory() {
    return [...this.telemetryHistory];
  }

  /**
   * Initializes or connects to the Web Worker.
   * @private
   */
  _ensureWorker() {
    if (this.worker || !this.canUseWorker()) return;

    try {
      const url = this.workerUrl || new URL('./llm_worker.js', import.meta.url);
      this.worker = new Worker(url, { type: 'module' });

      this.worker.onmessage = (event) => this._handleWorkerMessage(event.data);
      this.worker.onerror = (err) => {
        const errorMsg = (err && err.message) ? err.message : (err && err.error?.message) ? err.error.message : 'Worker failure';
        console.warn('[LLMWorkerBridge] Web Worker error event:', errorMsg, err);
        this.workerFailed = true;
        // Reject all pending requests so caller can fall back
        for (const [id, req] of this.pendingRequests.entries()) {
          req.reject(new Error(`Worker error: ${errorMsg}`));
        }
        this.pendingRequests.clear();
        this.streamListeners.clear();
      };
    } catch (err) {
      console.warn('[LLMWorkerBridge] Failed to instantiate worker, falling back to in-process mode:', err);
      this.worker = null;
      this.workerFailed = true;
    }
  }

  /**
   * Dispatches incoming worker messages to their corresponding resolvers or streams.
   * @private
   * @param {Object} msg
   */
  _handleWorkerMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'PROGRESS':
        this._notifyProgress(msg.payload || { text: 'Loading...', progress: 0 });
        break;

      case 'READY': {
        const req = this.pendingRequests.get(msg.id);
        if (req) {
          this.isWorkerReady = true;
          this.currentModelId = msg.payload?.modelId || this.currentModelId;
          req.resolve(msg.payload);
          this.pendingRequests.delete(msg.id);
        }
        break;
      }

      case 'MOVE_RESULT': {
        const req = this.pendingRequests.get(msg.id);
        if (req) {
          if (msg.payload) {
            this.addTelemetry({
              type: 'tactical_move',
              ...msg.payload
            });
          }
          req.resolve(msg.payload);
          this.pendingRequests.delete(msg.id);
        }
        break;
      }

      case 'BANTER_TOKEN': {
        const streamCallback = this.streamListeners.get(msg.id);
        if (streamCallback && msg.payload) {
          streamCallback(msg.payload.delta || '', msg.payload.fullText || '');
        }
        break;
      }

      case 'BANTER_DONE': {
        const req = this.pendingRequests.get(msg.id);
        if (req) {
          if (msg.payload) {
            this.addTelemetry({
              type: 'banter',
              ...msg.payload
            });
          }
          req.resolve(msg.payload ? msg.payload.fullText : '');
          this.pendingRequests.delete(msg.id);
          this.streamListeners.delete(msg.id);
        }
        break;
      }

      case 'ERROR': {
        const req = this.pendingRequests.get(msg.id);
        if (req) {
          req.reject(new Error(msg.payload?.error || 'Worker operation failed'));
          this.pendingRequests.delete(msg.id);
          this.streamListeners.delete(msg.id);
        }
        break;
      }

      case 'TELEMETRY_EXPORT': {
        if (Array.isArray(msg.payload)) {
          for (const item of msg.payload) {
            this.addTelemetry(item);
          }
        }
        break;
      }

      default:
        console.warn('[LLMWorkerBridge] Unknown worker message type:', msg.type);
    }
  }

  /**
   * Initializes model weights and verifies WebGPU pipeline.
   * @param {Object} options
   * @param {string} [options.modelId]
   * @param {Function} [options.onProgress]
   * @returns {Promise<{ success: boolean, modelId: string }>}
   */
  async initModel({ modelId = DEFAULT_MODEL_ID, onProgress = null } = {}) {
    const unsub = onProgress ? this.onProgress(onProgress) : null;

    try {
      if (this.canUseWorker()) {
        this._ensureWorker();
      }

      if (this.worker && !this.workerFailed) {
        try {
          const reqId = this._nextId();
          const result = await new Promise((resolve, reject) => {
            this.pendingRequests.set(reqId, { resolve, reject });
            this.worker.postMessage({
              type: 'INIT',
              id: reqId,
              payload: { modelId }
            });
          });
          return result;
        } catch (workerErr) {
          console.warn('[LLMWorkerBridge] Web Worker initialization failed. Automatically switching to in-process WebLLM (rag-poc engine mode):', workerErr);
          this.workerFailed = true;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('chk_prefer_in_process', 'true');
            }
          } catch (_) {}
          if (this.worker) {
            try { this.worker.terminate(); } catch (_) {}
            this.worker = null;
          }
          this._notifyProgress({ text: 'Worker issue detected. Loading model in-process (WebGPU window mode)...', progress: 0.12 });
        }
      }

      // Simulated / In-process fallback mode:
      return await this._initModelInProcess({ modelId });
    } finally {
      if (unsub) unsub();
    }
  }

  /**
   * In-process / simulated model loading fallback.
   * @private
   */
  async _initModelInProcess({ modelId }) {
    this._notifyProgress({ text: `Validating WebGPU environment for ${modelId}...`, progress: 0.1 });

    if (this._customEngine) {
      this.currentModelId = modelId;
      this.isWorkerReady = true;
      this._notifyProgress({ text: 'Mock model ready!', progress: 1.0 });
      return { success: true, modelId };
    }

    if (this.service) {
      await this.service.loadModel(modelId);
      this.currentModelId = modelId;
      this.isWorkerReady = true;
      this._notifyProgress({ text: 'Model loaded and verified!', progress: 1.0 });
      return { success: true, modelId };
    }

    // Default simulation
    this._notifyProgress({ text: 'Compiling shaders & verifying pipeline...', progress: 0.7 });
    this.currentModelId = modelId;
    this.isWorkerReady = true;
    this._notifyProgress({ text: 'Ready!', progress: 1.0 });
    return { success: true, modelId };
  }

  /**
   * Requests Session A Tactical Move Generation from worker.
   * Handles prompt construction, internal retries, and fallback if needed.
   * @param {Object} params
   * @param {Int8Array} params.board
   * @param {number} params.turn - PLAYER_RED (1) or PLAYER_BLACK (-1)
   * @param {number|null} [params.mustContinueJumpFrom=null]
   * @param {Array<Object>} params.legalMoves
   * @param {'wild'|'grandmaster'} [params.tacticalMode='wild']
   * @param {string} [params.personaId]
   * @param {Array<Object>} [params.evaluatedCandidates=null]
   * @param {AbortSignal} [params.signal=null]
   * @returns {Promise<{
   *   success: boolean,
   *   chosenMove: Object,
   *   reasoning: string,
   *   rawPrompt: Array<Object>,
   *   rawResponse: string,
   *   latencyMs: number,
   *   attempts: number,
   *   isFallback: boolean,
   *   tokensPerSec?: number,
   *   tokenCount?: number
   * }>}
   */
  async generateMove(params) {
    const {
      board,
      turn,
      mustContinueJumpFrom = null,
      legalMoves,
      tacticalMode = 'wild',
      personaId = null,
      evaluatedCandidates = null,
      signal = null
    } = params;

    if (!legalMoves || legalMoves.length === 0) {
      return {
        success: false,
        chosenMove: null,
        reasoning: 'No legal moves available',
        rawPrompt: [],
        rawResponse: '',
        latencyMs: 0,
        attempts: 0,
        isFallback: false
      };
    }

    // Single forced move shortcut: immediately return to conserve compute
    if (legalMoves.length === 1) {
      const singleMove = legalMoves[0];
      return {
        success: true,
        chosenMove: singleMove,
        reasoning: singleMove.isJump ? 'Forced mandatory jump' : 'Single legal move',
        rawPrompt: [],
        rawResponse: '{"moveIndex": 0, "tacticalReason": "Forced single move"}',
        latencyMs: 1,
        attempts: 1,
        isFallback: false
      };
    }

    if (this.canUseWorker()) {
      this._ensureWorker();
    }

    if (this.worker && !this.workerFailed) {
      try {
        const reqId = this._nextId();
        return await new Promise((resolve, reject) => {
          const onAbort = () => {
            if (this.worker) this.worker.postMessage({ type: 'ABORT', id: reqId });
            reject(new Error('Move generation aborted'));
            this.pendingRequests.delete(reqId);
          };

          if (signal) {
            if (signal.aborted) return reject(new Error('Move generation aborted'));
            signal.addEventListener('abort', onAbort, { once: true });
          }

          this.pendingRequests.set(reqId, {
            resolve: (val) => {
              if (signal) signal.removeEventListener('abort', onAbort);
              resolve(val);
            },
            reject: (err) => {
              if (signal) signal.removeEventListener('abort', onAbort);
              reject(err);
            }
          });

          this.worker.postMessage({
            type: 'GENERATE_MOVE',
            id: reqId,
            payload: {
              board: Array.from(board),
              turn,
              mustContinueJumpFrom,
              legalMoves,
              tacticalMode,
              personaId,
              evaluatedCandidates
            }
          });
        });
      } catch (workerErr) {
        console.warn('[LLMWorkerBridge] Worker move generation failed, falling back to in-process:', workerErr);
        this.workerFailed = true;
        if (this.worker) {
          try { this.worker.terminate(); } catch (_) {}
          this.worker = null;
        }
        return await this._generateMoveInProcess(params);
      }
    }

    // In-process fallback execution
    return await this._generateMoveInProcess(params);
  }

  /**
   * In-process fallback move generation with retry loop and telemetry recording.
   * @private
   */
  async _generateMoveInProcess(params) {
    const {
      board,
      turn,
      mustContinueJumpFrom = null,
      legalMoves,
      tacticalMode = 'wild',
      evaluatedCandidates = null,
      signal = null
    } = params;

    const startTime = Date.now();
    let evaluated = evaluatedCandidates;

    if (tacticalMode === 'grandmaster' && !evaluated) {
      const best = this.minimaxHelper.getBestMove({ board, turn, mustContinueJumpFrom });
      evaluated = legalMoves.map((m) => ({
        move: m,
        rating: (best && m.from === best.from && m.to === best.to)
          ? 'Recommended Master Move'
          : (m.isJump ? 'Mandatory Capture' : 'Standard Development')
      }));
    }

    const messages = buildTacticalPrompt({
      board,
      turn,
      legalMoves,
      tacticalMode,
      evaluatedCandidates: evaluated
    });

    let rawResponse = '';
    const queryFn = async (msgs) => {
      if (this.service && (this.service.engine || this._customEngine)) {
        const res = await this.service.chatCompletion({
          messages: msgs,
          temperature: 0.1,
          max_tokens: 60,
          signal,
          timeoutMs: 12000
        });
        rawResponse = res;
        return res;
      }

      // Default mock completion
      rawResponse = '```json\n{"moveIndex": 0, "tacticalReason": "Tactical development"}\n```';
      return rawResponse;
    };

    const fallbackFn = () => {
      const best = this.minimaxHelper.getBestMove({ board, turn, mustContinueJumpFrom });
      return best || legalMoves[0];
    };

    const selectionResult = await executeMoveSelectionWithRetries({
      queryFn,
      initialMessages: messages,
      legalMoves,
      maxRetries: 2,
      fallbackFn
    });

    const latencyMs = Math.max(1, Date.now() - startTime);
    const chosenMove = selectionResult.move || legalMoves[0];
    const isFallback = Boolean(selectionResult.isFallback);
    const tokenCount = rawResponse ? Math.ceil(rawResponse.length / 4) : 15;
    const tokensPerSec = latencyMs > 0 ? Math.round((tokenCount / (latencyMs / 1000)) * 10) / 10 : 0;

    const result = {
      success: true,
      chosenMove,
      reasoning: selectionResult.reasoning || 'Tactical move selected',
      rawPrompt: messages,
      rawResponse,
      latencyMs,
      attempts: selectionResult.attempts || 1,
      isFallback,
      tokensPerSec,
      tokenCount
    };

    this.addTelemetry({
      type: 'tactical_move',
      turn,
      ...result
    });

    return result;
  }

  /**
   * Requests Session B personality banter streaming from worker.
   * @param {Object} params
   * @param {Object} params.persona
   * @param {Object} params.move
   * @param {Int8Array} params.board
   * @param {number} params.turn
   * @param {boolean} [params.crowned=false]
   * @param {string} [params.opponentBanter='']
   * @param {Function} [params.onToken=null] - (delta, fullText) => void
   * @param {AbortSignal} [params.signal=null]
   * @returns {Promise<string>}
   */
  async streamBanter(params) {
    const {
      persona,
      move,
      board,
      turn,
      crowned = false,
      opponentBanter = '',
      onToken = null,
      signal = null
    } = params;

    if (this.canUseWorker()) {
      this._ensureWorker();
    }

    if (this.worker && !this.workerFailed) {
      try {
        const reqId = this._nextId();
        return await new Promise((resolve, reject) => {
          const onAbort = () => {
            if (this.worker) this.worker.postMessage({ type: 'ABORT', id: reqId });
            reject(new Error('Banter streaming aborted'));
            this.pendingRequests.delete(reqId);
            this.streamListeners.delete(reqId);
          };

          if (signal) {
            if (signal.aborted) return reject(new Error('Banter streaming aborted'));
            signal.addEventListener('abort', onAbort, { once: true });
          }

          if (onToken) {
            this.streamListeners.set(reqId, onToken);
          }

          this.pendingRequests.set(reqId, {
            resolve: (text) => {
              if (signal) signal.removeEventListener('abort', onAbort);
              resolve(text);
            },
            reject: (err) => {
              if (signal) signal.removeEventListener('abort', onAbort);
              reject(err);
            }
          });

          this.worker.postMessage({
            type: 'STREAM_BANTER',
            id: reqId,
            payload: {
              persona,
              move,
              board: Array.from(board),
              turn,
              crowned,
              opponentBanter
            }
          });
        });
      } catch (workerErr) {
        console.warn('[LLMWorkerBridge] Worker banter stream failed, falling back to in-process:', workerErr);
        this.workerFailed = true;
        if (this.worker) {
          try { this.worker.terminate(); } catch (_) {}
          this.worker = null;
        }
        return await this._streamBanterInProcess(params);
      }
    }

    // In-process fallback banter
    return await this._streamBanterInProcess(params);
  }

  /**
   * In-process fallback banter streaming.
   * @private
   */
  async _streamBanterInProcess(params) {
    const {
      persona,
      move,
      board,
      turn,
      crowned = false,
      opponentBanter = '',
      onToken = null,
      signal = null
    } = params;

    const startTime = Date.now();
    const messages = buildBanterPrompt({
      persona,
      move,
      board,
      turn,
      crowned,
      opponentBanter
    });

    try {
      if (this.service && (this.service.engine || this._customEngine)) {
        const res = await this.service.chatCompletion({
          messages,
          temperature: 0.85,
          max_tokens: 35,
          stream: Boolean(onToken),
          onToken,
          signal,
          timeoutMs: 7000
        });

        const latencyMs = Math.max(1, Date.now() - startTime);
        this.addTelemetry({
          type: 'banter',
          personaId: persona?.id,
          rawPrompt: messages,
          fullText: res.trim(),
          latencyMs
        });
        return res.trim();
      }

      // Default mock banter streaming
      const sampleText = `${persona?.avatar || '💬'} A bold maneuver upon the board!`;
      if (onToken) {
        onToken(sampleText, sampleText);
      }
      const latencyMs = Math.max(1, Date.now() - startTime);
      this.addTelemetry({
        type: 'banter',
        personaId: persona?.id,
        rawPrompt: messages,
        fullText: sampleText,
        latencyMs
      });
      return sampleText;
    } catch (e) {
      return '';
    }
  }

  /**
   * Sends abort signal to worker.
   */
  abort() {
    if (this.worker) {
      this.worker.postMessage({ type: 'ABORT' });
    }
  }

  /**
   * Resets worker state.
   */
  reset() {
    if (this.worker) {
      this.worker.postMessage({ type: 'RESET' });
    }
  }

  /**
   * Terminates the worker thread.
   */
  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
    this.streamListeners.clear();
  }
}

// Shared singleton instance
export const llmWorkerBridge = new LLMWorkerBridge();
