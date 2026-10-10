/**
 * @file dashboard.js
 * LLM Dashboard UI manager and interactive test bench controller.
 * Manages WebGPU hardware status, model loading, cache clearance,
 * live test chat & tactical move verification, and activity log streaming.
 */

import { webLLMService } from './web_llm_service.js';
import { checkWebGPUSupport } from './gpu_check.js';
import { SUPPORTED_MODELS, DEFAULT_MODEL_ID, getModelInfo } from './model_registry.js';

export class LLMDashboard {
  /**
   * @param {Object} [options]
   * @param {WebLLMService} [options.service]
   */
  constructor(options = {}) {
    this.service = options.service || webLLMService;
    this.isOpen = false;
    this.gpuInfo = null;

    // DOM Elements
    this.modal = null;
    this.btnOpen = null;
    this.btnClose = null;

    // Hardware Card
    this.gpuBadge = null;
    this.gpuAdapterName = null;
    this.gpuNotes = null;

    // Model Manager
    this.selectModel = null;
    this.modelVramBadge = null;
    this.modelDownloadBadge = null;
    this.modelDescription = null;
    this.btnLoadModel = null;
    this.btnClearCache = null;
    this.loadProgressContainer = null;
    this.loadProgressLabel = null;
    this.loadProgressFill = null;

    // Test Bench
    this.btnTestChat = null;
    this.btnTestMove = null;
    this.testBenchOutput = null;
    this.testBenchMetrics = null;

    // Activity Log
    this.activityLogContainer = null;
    this.btnClearLog = null;

    this._unsubscribeProgress = null;
    this._unsubscribeState = null;
    this._unsubscribeLog = null;
  }

  /**
   * Initializes the dashboard by binding to DOM elements and registering listeners.
   */
  init() {
    if (typeof document === 'undefined') return;

    this.modal = document.getElementById('modal-llm-dashboard');
    this.btnOpen = document.getElementById('btn-open-llm-dashboard');
    this.btnClose = document.getElementById('btn-close-llm-dashboard');

    if (!this.modal) return;

    // Hardware Card elements
    this.gpuBadge = document.getElementById('llm-gpu-badge');
    this.gpuAdapterName = document.getElementById('llm-gpu-adapter-name');
    this.gpuNotes = document.getElementById('llm-gpu-notes');

    // Model Manager elements
    this.selectModel = document.getElementById('llm-select-model');
    this.modelVramBadge = document.getElementById('llm-model-vram');
    this.modelDownloadBadge = document.getElementById('llm-model-download');
    this.modelDescription = document.getElementById('llm-model-desc');
    this.btnLoadModel = document.getElementById('btn-llm-load-model');
    this.btnClearCache = document.getElementById('btn-llm-clear-cache');
    this.loadProgressContainer = document.getElementById('llm-load-progress-container');
    this.loadProgressLabel = document.getElementById('llm-load-progress-label');
    this.loadProgressFill = document.getElementById('llm-load-progress-fill');

    // Test Bench elements
    this.btnTestChat = document.getElementById('btn-llm-test-chat');
    this.btnTestMove = document.getElementById('btn-llm-test-move');
    this.testBenchOutput = document.getElementById('llm-testbench-output');
    this.testBenchMetrics = document.getElementById('llm-testbench-metrics');

    // Activity Log elements
    this.activityLogContainer = document.getElementById('llm-activity-log');
    this.btnClearLog = document.getElementById('btn-llm-clear-log');

    this._populateModelDropdown();
    this._bindEvents();
    this._subscribeService();

    // Initial check for WebGPU hardware
    this.refreshHardwareInfo();
  }

  _populateModelDropdown() {
    if (!this.selectModel) return;
    this.selectModel.innerHTML = '';

    SUPPORTED_MODELS.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.vram} VRAM)`;
      if (m.id === (this.service.currentModelId || DEFAULT_MODEL_ID)) {
        opt.selected = true;
      }
      this.selectModel.appendChild(opt);
    });

    this._updateModelMetadataDisplay(this.selectModel.value);
  }

  _updateModelMetadataDisplay(modelId) {
    const info = getModelInfo(modelId);
    if (!info) return;

    if (this.modelVramBadge) this.modelVramBadge.textContent = `VRAM: ${info.vram}`;
    if (this.modelDownloadBadge) this.modelDownloadBadge.textContent = `Size: ${info.size}`;
    if (this.modelDescription) this.modelDescription.textContent = info.description;
  }

  _bindEvents() {
    if (this.btnOpen) {
      this.btnOpen.addEventListener('click', () => this.open());
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    // Modal backdrop click
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    if (this.selectModel) {
      this.selectModel.addEventListener('change', (e) => {
        this._updateModelMetadataDisplay(e.target.value);
      });
    }

    if (this.btnLoadModel) {
      this.btnLoadModel.addEventListener('click', () => this.handleLoadModel());
    }

    if (this.btnClearCache) {
      this.btnClearCache.addEventListener('click', () => this.handleClearCache());
    }

    if (this.btnTestChat) {
      this.btnTestChat.addEventListener('click', () => this.handleTestChat());
    }

    if (this.btnTestMove) {
      this.btnTestMove.addEventListener('click', () => this.handleTestMove());
    }

    if (this.btnClearLog) {
      this.btnClearLog.addEventListener('click', () => {
        if (this.activityLogContainer) {
          this.activityLogContainer.innerHTML = '';
        }
      });
    }
  }

  _subscribeService() {
    this._unsubscribeProgress = this.service.onProgress((report) => {
      this._updateProgress(report);
    });

    this._unsubscribeState = this.service.onStateChange((state) => {
      this._updateControlsForState(state);
    });

    this._unsubscribeLog = this.service.onLog((entry) => {
      this.appendLogEntry(entry);
    });
  }

  /**
   * Refreshes WebGPU hardware detection and updates the UI card.
   */
  async refreshHardwareInfo() {
    try {
      this.gpuInfo = await checkWebGPUSupport();
      this.renderHardwareStatus(this.gpuInfo);
    } catch (e) {
      this.renderHardwareStatus({ supported: false, reason: e.message });
    }
  }

  /**
   * Renders the Hardware & WebGPU status card.
   * @param {{ supported: boolean, adapterName?: string, details?: Object, reason?: string }} gpuInfo
   */
  renderHardwareStatus(gpuInfo) {
    if (!this.gpuBadge) return;

    if (gpuInfo.supported) {
      this.gpuBadge.className = 'status-badge status-badge-success';
      this.gpuBadge.textContent = 'WebGPU Supported';

      if (this.gpuAdapterName) {
        this.gpuAdapterName.textContent = gpuInfo.adapterName || 'Generic WebGPU Adapter';
      }

      if (this.gpuNotes) {
        const det = gpuInfo.details || {};
        const maxBuf = det.maxBufferSize ? `Max Buffer: ${(det.maxBufferSize / (1024 * 1024)).toFixed(0)}MB` : '';
        const fallback = det.isFallbackAdapter ? ' (Software/Fallback Adapter)' : ' (Hardware Accelerated)';
        this.gpuNotes.textContent = `High-performance WebGPU ready.${fallback} ${maxBuf}`.trim();
      }
    } else {
      this.gpuBadge.className = 'status-badge status-badge-danger';
      this.gpuBadge.textContent = 'WebGPU Not Supported';

      if (this.gpuAdapterName) {
        this.gpuAdapterName.textContent = 'No WebGPU Device';
      }

      if (this.gpuNotes) {
        this.gpuNotes.textContent = gpuInfo.reason || 'Browser lacks WebGPU support. Minimax AI will be used.';
      }
    }
  }

  /**
   * Appends an entry to the live Activity Log.
   * @param {{ type: string, message: string, timestamp: number }} entry
   */
  appendLogEntry({ type, message, timestamp }) {
    if (!this.activityLogContainer) return;

    const timeStr = new Date(timestamp).toLocaleTimeString();
    const item = document.createElement('div');
    item.className = `log-entry log-entry-${type || 'info'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = `[${timeStr}]`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    msgSpan.textContent = ` ${message}`;

    item.appendChild(timeSpan);
    item.appendChild(msgSpan);

    this.activityLogContainer.appendChild(item);
    this.activityLogContainer.scrollTop = this.activityLogContainer.scrollHeight;
  }

  _updateProgress(report) {
    if (!this.loadProgressContainer) return;

    if (report.progress > 0 && report.progress < 1) {
      this.loadProgressContainer.classList.remove('hidden');
    } else if (report.progress >= 1) {
      setTimeout(() => {
        if (!this.service.isLoading) {
          this.loadProgressContainer.classList.add('hidden');
        }
      }, 1200);
    }

    if (this.loadProgressLabel) {
      this.loadProgressLabel.textContent = report.text;
    }
    if (this.loadProgressFill) {
      const pct = Math.round(report.progress * 100);
      this.loadProgressFill.style.width = `${pct}%`;
    }
  }

  _updateControlsForState(state) {
    if (this.btnLoadModel) {
      if (state.isInitializing) {
        this.btnLoadModel.disabled = true;
        this.btnLoadModel.textContent = '⏳ Loading...';
      } else if (state.isReady) {
        this.btnLoadModel.disabled = false;
        this.btnLoadModel.textContent = '✓ Model Loaded';
      } else {
        this.btnLoadModel.disabled = false;
        this.btnLoadModel.textContent = '⬇ Load Model';
      }
    }

    if (this.btnTestChat) {
      this.btnTestChat.disabled = !state.isReady || state.isInitializing;
    }
    if (this.btnTestMove) {
      this.btnTestMove.disabled = !state.isReady || state.isInitializing;
    }
  }

  /**
   * Handles user clicking "Load Model".
   */
  async handleLoadModel() {
    const selectedModelId = this.selectModel ? this.selectModel.value : DEFAULT_MODEL_ID;
    try {
      if (this.loadProgressContainer) {
        this.loadProgressContainer.classList.remove('hidden');
      }
      await this.service.loadModel(selectedModelId);
    } catch (err) {
      console.error('Model load error:', err);
    }
  }

  /**
   * Handles user clicking "Clear Cache".
   */
  async handleClearCache() {
    if (!confirm('Clear all cached WebLLM weights from browser Cache API and IndexedDB? This will require re-downloading model weights.')) {
      return;
    }

    try {
      if (this.btnClearCache) this.btnClearCache.disabled = true;
      const res = await this.service.clearModelCache();
      alert(`Cleared ${res.clearedCaches.length} caches and ${res.clearedDatabases.length} IndexedDB databases.`);
    } catch (err) {
      alert(`Error clearing cache: ${err.message}`);
    } finally {
      if (this.btnClearCache) this.btnClearCache.disabled = false;
    }
  }

  /**
   * Handles "Test Chat & Banter" button click.
   */
  async handleTestChat() {
    if (!this.testBenchOutput) return;

    this.testBenchOutput.textContent = 'Streaming chat test...\n';
    if (this.testBenchMetrics) this.testBenchMetrics.textContent = 'Measuring tokens/sec...';

    if (this.btnTestChat) this.btnTestChat.disabled = true;

    try {
      const result = await this.service.testChat(
        'Give a short witty 1-sentence checkers insult.',
        (delta, full) => {
          this.testBenchOutput.textContent = full;
        }
      );

      if (this.testBenchMetrics) {
        this.testBenchMetrics.textContent = `Generated ${result.tokenCount} tokens in ${(result.durationMs / 1000).toFixed(2)}s (${result.tokensPerSec} tok/s)`;
      }
    } catch (err) {
      this.testBenchOutput.textContent = `Test chat error: ${err.message}`;
      if (this.testBenchMetrics) this.testBenchMetrics.textContent = 'Test failed';
    } finally {
      if (this.btnTestChat) this.btnTestChat.disabled = false;
    }
  }

  /**
   * Handles "Test Tactical Move" button click.
   */
  async handleTestMove() {
    if (!this.testBenchOutput) return;

    this.testBenchOutput.textContent = 'Evaluating test board position...\n';
    if (this.testBenchMetrics) this.testBenchMetrics.textContent = 'Generating move JSON...';

    if (this.btnTestMove) this.btnTestMove.disabled = true;

    try {
      const res = await this.service.testTacticalMove();

      const outputLines = [
        `Raw Model Response:\n${res.rawResponse}\n`,
        `--- Parse Verification ---`,
        `Success: ${res.parsed.success}`,
        `Parsed Index: ${res.parsed.index !== undefined ? res.parsed.index : 'N/A'}`,
        `Reasoning: "${res.parsed.reasoning || ''}"`,
        `Move Verified Legal: ${res.verified ? '✓ Yes (' + res.move.from + ' -> ' + res.move.to + ')' : '✗ No'}`
      ];

      this.testBenchOutput.textContent = outputLines.join('\n');
      if (this.testBenchMetrics) {
        this.testBenchMetrics.textContent = `Completed in ${res.durationMs.toFixed(0)}ms | Verification: ${res.verified ? 'PASSED' : 'FAILED'}`;
      }
    } catch (err) {
      this.testBenchOutput.textContent = `Test tactical move error: ${err.message}`;
      if (this.testBenchMetrics) this.testBenchMetrics.textContent = 'Test failed';
    } finally {
      if (this.btnTestMove) this.btnTestMove.disabled = false;
    }
  }

  /**
   * Opens the LLM Dashboard modal.
   */
  open() {
    if (!this.modal) return;
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.refreshHardwareInfo();
    this._updateControlsForState(this.service.getState());
  }

  /**
   * Closes the LLM Dashboard modal.
   */
  close() {
    if (!this.modal) return;
    this.isOpen = false;
    this.modal.classList.add('hidden');
  }

  /**
   * Disposes of listeners.
   */
  dispose() {
    if (this._unsubscribeProgress) this._unsubscribeProgress();
    if (this._unsubscribeState) this._unsubscribeState();
    if (this._unsubscribeLog) this._unsubscribeLog();
  }
}
