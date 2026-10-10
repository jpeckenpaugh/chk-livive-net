/**
 * @file web_llm_service.js
 * Singleton service managing in-browser WebLLM engine initialization, WebGPU detection,
 * model weight caching, and chat completion execution.
 */

import { DEFAULT_MODEL_ID } from './model_registry.js';

const WEBLLM_CDN_URL = 'https://esm.sh/@mlc-ai/web-llm@0.2.78';

export class WebLLMService {
  constructor() {
    this.engine = null;
    this.currentModelId = null;
    this.isLoading = false;
    this.progressListeners = new Set();
    this._customEngine = null; // Injected for unit testing
  }

  /**
   * Checks if WebGPU is available in the current browser environment.
   * @returns {boolean}
   */
  static isWebGPUSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
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
    } else {
      this.engine = null;
      this.currentModelId = null;
    }
  }

  /**
   * Adds progress callback for model loading.
   * @param {Function} callback - Receives { text: string, progress: number }
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
   * Initializes or switches to the specified WebLLM model.
   * @param {string} [modelId=DEFAULT_MODEL_ID]
   * @returns {Promise<Object>} The initialized MLC engine
   */
  async loadModel(modelId = DEFAULT_MODEL_ID) {
    if (this._customEngine) {
      return this._customEngine;
    }

    if (this.engine && this.currentModelId === modelId) {
      return this.engine;
    }

    if (!WebLLMService.isWebGPUSupported()) {
      throw new Error('WebGPU is not supported in this browser. Please use Chrome 113+ or Edge with WebGPU enabled.');
    }

    this.isLoading = true;
    this._notifyProgress({ text: `Initializing ${modelId}...`, progress: 0 });

    try {
      const webllm = await import(WEBLLM_CDN_URL);

      const initProgressCallback = (report) => {
        // report has: { progress: number (0..1), text: string, timeElapsed: number }
        this._notifyProgress({
          text: report.text || 'Loading model weights...',
          progress: typeof report.progress === 'number' ? report.progress : 0
        });
      };

      const engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback,
        logLevel: 'WARN'
      });

      this.engine = engine;
      this.currentModelId = modelId;
      this.isLoading = false;
      this._notifyProgress({ text: 'Model loaded and ready!', progress: 1 });
      return this.engine;
    } catch (err) {
      this.isLoading = false;
      this._notifyProgress({ text: `Failed: ${err.message}`, progress: 0 });
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
  }

  /**
   * Unloads the engine and releases WebGPU buffers.
   */
  async unload() {
    if (this.engine && typeof this.engine.unload === 'function') {
      try {
        await this.engine.unload();
      } catch (e) {}
    }
    this.engine = null;
    this.currentModelId = null;
  }
}

// Global singleton instance
export const webLLMService = new WebLLMService();
