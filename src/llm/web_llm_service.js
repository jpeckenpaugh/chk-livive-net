/**
 * @file web_llm_service.js
 * Singleton service managing in-browser WebLLM engine initialization, WebGPU detection,
 * model weight caching, multi-CDN fallback, diagnostic logging, and test bench execution.
 */

import { DEFAULT_MODEL_ID, getModelInfo } from './model_registry.js';
import { checkWebGPUSupport } from './gpu_check.js';
import { createInitialBoard } from '../state.js';
import { getLegalMoves } from '../rules.js';
import { buildTacticalPrompt } from './prompts.js';
import { parseMoveIndex } from './parser.js';

// Multi-CDN URLs in fallback order
export const WEBLLM_CDN_URLS = [
  'https://esm.run/@mlc-ai/web-llm',
  'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm',
  'https://esm.sh/@mlc-ai/web-llm@0.2.85'
];

export class WebLLMService {
  constructor() {
    this.engine = null;
    this.currentModelId = null;
    this.isLoading = false;
    this.progressListeners = new Set();
    this.stateListeners = new Set();
    this.errorListeners = new Set();
    this.logListeners = new Set();

    this.progressReport = { text: 'Idle', progress: 0 };
    this.lastError = null;
    this.activeCdnUrl = null;

    this._customEngine = null; // Injected for unit testing
    this._customImportFn = null; // Injected for CDN testing
  }

  /**
   * Checks if WebGPU is available in the current browser environment (legacy helper).
   * @returns {boolean}
   */
  static isWebGPUSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  /**
   * Checks detailed WebGPU hardware support via checkWebGPUSupport().
   * @returns {Promise<{ supported: boolean, adapterName?: string, details?: Object, reason?: string }>}
   */
  async checkGPU() {
    return await checkWebGPUSupport();
  }

  /**
   * Returns current granular state.
   * @returns {{
   *   isInitializing: boolean,
   *   isReady: boolean,
   *   currentModelId: string|null,
   *   progressReport: { text: string, progress: number },
   *   error: string|null,
   *   vramEstimate: string
   * }}
   */
  getState() {
    const info = this.currentModelId ? getModelInfo(this.currentModelId) : null;
    return {
      isInitializing: this.isLoading,
      isReady: Boolean(this.engine !== null && !this.isLoading),
      currentModelId: this.currentModelId,
      progressReport: { ...this.progressReport },
      error: this.lastError,
      vramEstimate: info ? info.vram : 'N/A'
    };
  }

  /**
   * Allows setting a custom mock engine (used in unit tests and simulation).
   * @param {Object|null} mockEngine
   */
  setCustomEngine(mockEngine) {
    this._customEngine = mockEngine;
    if (mockEngine) {
      this.engine = mockEngine;
      this.currentModelId = 'mock-model';
      this.lastError = null;
    } else {
      this.engine = null;
      this.currentModelId = null;
    }
    this._notifyState();
  }

  /**
   * Allows overriding module dynamic import function (for testing CDN fallback).
   * @param {Function|null} importFn
   */
  setCustomImportFn(importFn) {
    this._customImportFn = importFn;
  }

  /**
   * Subscribes to model loading progress reports.
   * @param {Function} callback - Receives { text: string, progress: number }
   * @returns {Function} Unsubscribe function
   */
  onProgress(callback) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  /**
   * Subscribes to state updates.
   * @param {Function} callback - Receives state object
   * @returns {Function} Unsubscribe function
   */
  onStateChange(callback) {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribes to errors.
   * @param {Function} callback - Receives error object or message
   * @returns {Function} Unsubscribe function
   */
  onError(callback) {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Subscribes to activity log events.
   * @param {Function} callback - Receives { type: 'info'|'warn'|'error', message: string, timestamp: number }
   * @returns {Function} Unsubscribe function
   */
  onLog(callback) {
    this.logListeners.add(callback);
    return () => this.logListeners.delete(callback);
  }

  _log(message, type = 'info') {
    const entry = { type, message, timestamp: Date.now() };
    for (const listener of this.logListeners) {
      try {
        listener(entry);
      } catch (e) {
        console.error('Log listener error:', e);
      }
    }
  }

  _notifyProgress(report) {
    this.progressReport = { ...report };
    for (const listener of this.progressListeners) {
      try {
        listener(this.progressReport);
      } catch (e) {
        console.error('Progress listener error:', e);
      }
    }
    this._notifyState();
  }

  _notifyState() {
    const state = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (e) {
        console.error('State listener error:', e);
      }
    }
  }

  _notifyError(err) {
    this.lastError = err ? (err.message || String(err)) : null;
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch (e) {
        console.error('Error listener error:', e);
      }
    }
    this._notifyState();
  }

  /**
   * Dynamically imports WebLLM from primary CDN, falling back to secondary and tertiary.
   * @returns {Promise<{ module: Object, cdnUrl: string }>}
   */
  async loadWebLLMModule() {
    const importFn = this._customImportFn || ((url) => import(url));
    const errors = [];

    for (const url of WEBLLM_CDN_URLS) {
      try {
        this._log(`Attempting to load WebLLM from CDN: ${url}`, 'info');
        const mod = await importFn(url);
        if (mod && (mod.CreateMLCEngine || mod.MLCEngine)) {
          this.activeCdnUrl = url;
          this._log(`Successfully loaded WebLLM from CDN: ${url}`, 'info');
          return { module: mod, cdnUrl: url };
        }
        throw new Error(`Loaded module from ${url} does not expose CreateMLCEngine`);
      } catch (err) {
        const errorMsg = `Failed loading from ${url}: ${err.message || String(err)}`;
        this._log(errorMsg, 'warn');
        errors.push(errorMsg);
      }
    }

    const aggregatedError = new Error(`All WebLLM CDN mirrors failed to load:\n${errors.join('\n')}`);
    this._log(aggregatedError.message, 'error');
    throw aggregatedError;
  }

  /**
   * Clears WebLLM cached weights from Cache API and IndexedDB.
   * Matches caches or DBs containing 'mlc' or 'web-llm'.
   * @returns {Promise<{ clearedCaches: string[], clearedDatabases: string[] }>}
   */
  async clearModelCache() {
    this._log('Starting cache cleanup for WebLLM model weights...', 'info');
    const result = {
      clearedCaches: [],
      clearedDatabases: []
    };

    // 1. Clear Cache API
    if (typeof caches !== 'undefined' && caches.keys) {
      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const lower = name.toLowerCase();
          if (lower.includes('mlc') || lower.includes('web-llm') || lower.includes('webllm')) {
            await caches.delete(name);
            result.clearedCaches.push(name);
            this._log(`Deleted cache: ${name}`, 'info');
          }
        }
      } catch (e) {
        this._log(`Error clearing Cache API: ${e.message}`, 'warn');
      }
    }

    // 2. Clear IndexedDB
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          if (dbInfo && dbInfo.name) {
            const lower = dbInfo.name.toLowerCase();
            if (lower.includes('mlc') || lower.includes('web-llm') || lower.includes('webllm')) {
              await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(dbInfo.name);
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
              });
              result.clearedDatabases.push(dbInfo.name);
              this._log(`Deleted IndexedDB: ${dbInfo.name}`, 'info');
            }
          }
        }
      } catch (e) {
        this._log(`Error clearing IndexedDB: ${e.message}`, 'warn');
      }
    }

    // Also unload currently loaded engine to free memory
    await this.unload();
    this._log(`Cache clearance complete. Cleared ${result.clearedCaches.length} caches and ${result.clearedDatabases.length} databases.`, 'info');
    return result;
  }

  /**
   * Initializes or switches to the specified WebLLM model.
   * @param {string} [modelId=DEFAULT_MODEL_ID]
   * @returns {Promise<Object>} The initialized MLC engine
   */
  async loadModel(modelId = DEFAULT_MODEL_ID) {
    if (this._customEngine) {
      this.currentModelId = modelId;
      this.lastError = null;
      this._notifyState();
      return this._customEngine;
    }

    if (this.engine && this.currentModelId === modelId) {
      return this.engine;
    }

    const gpuCheck = await this.checkGPU();
    if (!gpuCheck.supported) {
      const err = new Error(gpuCheck.reason || 'WebGPU is not supported in this browser.');
      this.lastError = err.message;
      this._notifyError(err);
      this._log(`WebGPU validation failed: ${err.message}`, 'error');
      throw err;
    }

    this.isLoading = true;
    this.lastError = null;
    this._notifyProgress({ text: `Initializing ${modelId}...`, progress: 0 });
    this._log(`Initializing model ${modelId} on adapter: ${gpuCheck.adapterName || 'default'}`, 'info');

    try {
      const { module: webllm } = await this.loadWebLLMModule();

      const initProgressCallback = (report) => {
        const text = report.text || 'Loading model weights...';
        const progress = typeof report.progress === 'number' ? report.progress : 0;
        this._notifyProgress({ text, progress });
        if (progress === 1 || report.text?.includes('finish')) {
          this._log(`Model init step: ${text}`, 'info');
        }
      };

      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback,
        logLevel: 'WARN'
      });

      this.engine = engine;
      this.currentModelId = modelId;
      this.isLoading = false;
      this._notifyProgress({ text: 'Model loaded and ready!', progress: 1 });
      this._log(`Model ${modelId} successfully loaded and ready for inference!`, 'info');
      return this.engine;
    } catch (err) {
      this.isLoading = false;
      this.engine = null;
      this._notifyError(err);
      this._notifyProgress({ text: `Failed: ${err.message}`, progress: 0 });
      this._log(`Model initialization failed: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Executes a chat completion query.
   * @param {Object} options
   * @param {Array<Object>} options.messages
   * @param {number} [options.temperature=0.1]
   * @param {number} [options.max_tokens=80]
   * @param {boolean} [options.stream=false]
   * @param {Function} [options.onToken] - Streaming token callback
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<string>} Full response string
   */
  async chatCompletion({
    messages,
    temperature = 0.1,
    max_tokens = 80,
    stream = false,
    onToken = null,
    signal = null
  }) {
    if (signal && signal.aborted) {
      throw new Error('Chat completion aborted');
    }

    if (!this.engine) {
      throw new Error('LLM Engine not initialized. Call loadModel() first.');
    }

    try {
      if (stream && onToken) {
        const chunks = await this.engine.chat.completions.create({
          messages,
          temperature,
          max_tokens,
          stream: true
        });

        let accumulated = '';
        for await (const chunk of chunks) {
          if (signal && signal.aborted) {
            throw new Error('Chat completion aborted');
          }
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) {
            accumulated += delta;
            onToken(delta, accumulated);
          }
        }
        return accumulated;
      }

      const response = await this.engine.chat.completions.create({
        messages,
        temperature,
        max_tokens
      });

      return response.choices[0]?.message?.content || '';
    } catch (err) {
      this._log(`Chat completion failed: ${err.message}`, 'error');
      this._notifyError(err);
      throw err;
    }
  }

  /**
   * Test bench method: runs a test chat completion and measures tokens/sec.
   * @param {string} [prompt="Give a short witty 1-sentence checkers insult."]
   * @param {Function} [onToken]
   * @returns {Promise<{ text: string, tokenCount: number, durationMs: number, tokensPerSec: number }>}
   */
  async testChat(prompt = 'Give a short witty 1-sentence checkers insult.', onToken = null) {
    if (!this.engine) {
      throw new Error('Engine not loaded. Please load a model before running testChat().');
    }

    this._log(`Running test chat bench with prompt: "${prompt}"`, 'info');
    const messages = [
      { role: 'system', content: 'You are a lively checkers master.' },
      { role: 'user', content: prompt }
    ];

    let tokenCount = 0;
    const startTime = performance.now();

    const text = await this.chatCompletion({
      messages,
      temperature: 0.7,
      max_tokens: 60,
      stream: true,
      onToken: (delta, full) => {
        tokenCount++;
        if (onToken) onToken(delta, full);
      }
    });

    const endTime = performance.now();
    const durationMs = Math.max(endTime - startTime, 1);
    const tokensPerSec = Number(((tokenCount / durationMs) * 1000).toFixed(1));

    this._log(`Test chat completed in ${durationMs.toFixed(0)}ms: ${tokenCount} tokens (${tokensPerSec} tok/s)`, 'info');

    return {
      text,
      tokenCount,
      durationMs,
      tokensPerSec
    };
  }

  /**
   * Test bench method: tests board serialization, prompt generation, and JSON parsing on a sample position.
   * @returns {Promise<{
   *   rawResponse: string,
   *   parsed: Object,
   *   move: Object|null,
   *   verified: boolean,
   *   durationMs: number
   * }>}
   */
  async testTacticalMove() {
    if (!this.engine) {
      throw new Error('Engine not loaded. Please load a model before running testTacticalMove().');
    }

    this._log('Running test tactical move benchmark on standard opening position...', 'info');
    const board = createInitialBoard();
    const turn = 1; // Red
    const legalMoves = getLegalMoves(board, turn);

    const messages = buildTacticalPrompt({
      board,
      turn,
      legalMoves,
      tacticalMode: 'wild'
    });

    const startTime = performance.now();
    const rawResponse = await this.chatCompletion({
      messages,
      temperature: 0.1,
      max_tokens: 60
    });
    const endTime = performance.now();
    const durationMs = Math.max(endTime - startTime, 1);

    const parsed = parseMoveIndex(rawResponse, legalMoves.length);
    const verified = parsed.success && parsed.index >= 0 && parsed.index < legalMoves.length;
    const move = verified ? legalMoves[parsed.index] : null;

    this._log(`Test tactical move completed in ${durationMs.toFixed(0)}ms. Parsed index: ${parsed.index}, verified: ${verified}`, verified ? 'info' : 'warn');

    return {
      rawResponse,
      parsed,
      move,
      verified,
      durationMs
    };
  }

  /**
   * Unloads the engine and releases WebGPU buffers.
   */
  async unload() {
    if (this.engine && typeof this.engine.unload === 'function') {
      try {
        await this.engine.unload();
        this._log('Unloaded WebLLM engine.', 'info');
      } catch (e) {
        this._log(`Error unloading engine: ${e.message}`, 'warn');
      }
    }
    this.engine = null;
    this.currentModelId = null;
    this.isLoading = false;
    this.progressReport = { text: 'Engine unloaded', progress: 0 };
    this._notifyState();
  }
}

// Global singleton instance
export const webLLMService = new WebLLMService();
