/**
 * @file debug_inspector.js
 * Prompt & Engine Debugger Panel for inspecting raw LLM prompts, model responses,
 * retry loops, latency metrics, and banter streaming telemetry turn-by-turn.
 */

import { llmWorkerBridge } from '../workers/llm_bridge.js';

export class DebugInspector {
  /**
   * @param {Object} [options]
   * @param {import('../workers/llm_bridge.js').LLMWorkerBridge} [options.bridge]
   */
  constructor({ bridge = llmWorkerBridge } = {}) {
    this.bridge = bridge;
    this.turns = [];
    this.selectedTurnIndex = -1;
    this.isOpen = false;

    // DOM references
    this.modal = null;
    this.turnListEl = null;
    this.metricsBarEl = null;
    this.sessionADetailsEl = null;
    this.sessionBDetailsEl = null;

    // Listen to live telemetry from the worker bridge
    if (this.bridge && typeof this.bridge.onTelemetry === 'function') {
      this.bridge.onTelemetry((record) => this.recordTelemetry(record));
    }
  }

  /**
   * Initializes DOM bindings and listeners.
   */
  init() {
    if (typeof document === 'undefined') return;

    this.modal = document.getElementById('modal-debug-inspector');
    this.turnListEl = document.getElementById('debug-turn-list');
    this.metricsBarEl = document.getElementById('debug-metrics-bar');
    this.sessionADetailsEl = document.getElementById('debug-session-a');
    this.sessionBDetailsEl = document.getElementById('debug-session-b');

    // Trigger buttons
    const btnHeaderDebug = document.getElementById('btn-debug-inspector');
    if (btnHeaderDebug) {
      btnHeaderDebug.addEventListener('click', () => this.open());
    }

    const btnSpectatorDebug = document.getElementById('btn-spectator-debug');
    if (btnSpectatorDebug) {
      btnSpectatorDebug.addEventListener('click', () => this.open());
    }

    const btnClose = document.getElementById('btn-close-debug-inspector');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.close());
    }

    const btnCopyPrompt = document.getElementById('btn-debug-copy-prompt');
    if (btnCopyPrompt) {
      btnCopyPrompt.addEventListener('click', () => this.copyCurrentPrompt());
    }

    const btnExportLogs = document.getElementById('btn-debug-export-logs');
    if (btnExportLogs) {
      btnExportLogs.addEventListener('click', () => this.exportLogs());
    }

    const btnClearLogs = document.getElementById('btn-debug-clear-logs');
    if (btnClearLogs) {
      btnClearLogs.addEventListener('click', () => this.clearLogs());
    }

    // Close when clicking backdrop
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }
  }

  /**
   * Records a telemetry entry and associates it into turn history.
   * @param {Object} record
   */
  recordTelemetry(record) {
    if (!record) return;

    if (record.type === 'tactical_move') {
      const turnNumber = this.turns.length + 1;
      const turnEntry = {
        turnNumber,
        timestamp: record.timestamp || Date.now(),
        turnColor: record.turn,
        tactical: record,
        banter: null
      };
      this.turns.push(turnEntry);
      if (this.selectedTurnIndex === -1 || this.selectedTurnIndex === this.turns.length - 2) {
        this.selectedTurnIndex = this.turns.length - 1;
      }
    } else if (record.type === 'banter') {
      // Attach banter to the most recent turn if available
      if (this.turns.length > 0) {
        const lastTurn = this.turns[this.turns.length - 1];
        lastTurn.banter = record;
      }
    }

    if (this.isOpen) {
      this.render();
    }
  }

  /**
   * Clears all recorded telemetry.
   */
  clearLogs() {
    this.turns = [];
    this.selectedTurnIndex = -1;
    this.render();
  }

  /**
   * Opens the Debug Inspector modal/drawer.
   */
  open() {
    this.isOpen = true;
    if (this.turns.length > 0 && this.selectedTurnIndex === -1) {
      this.selectedTurnIndex = this.turns.length - 1;
    }
    if (this.modal) {
      this.modal.classList.remove('hidden');
    }
    this.render();
  }

  /**
   * Closes the Debug Inspector.
   */
  close() {
    this.isOpen = false;
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }

  /**
   * Toggles drawer open/close.
   */
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  /**
   * Selects a turn by index (0-based).
   * @param {number} index
   */
  selectTurn(index) {
    if (index >= 0 && index < this.turns.length) {
      this.selectedTurnIndex = index;
      this.render();
    }
  }

  /**
   * Copies current prompt, raw model response, and metrics to clipboard.
   */
  async copyCurrentPrompt() {
    const turn = this.turns[this.selectedTurnIndex];
    if (!turn || !turn.tactical) {
      alert('No turn data to copy.');
      return;
    }

    const tactical = turn.tactical;
    const promptText = Array.isArray(tactical.rawPrompt)
      ? tactical.rawPrompt.map((m) => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n')
      : String(tactical.rawPrompt || '');

    const exportText = [
      `=== CHECKERS LLM DEBUG LOG - TURN ${turn.turnNumber} ===`,
      `Latency: ${tactical.latencyMs}ms | Attempts: ${tactical.attempts} | Fallback: ${tactical.isFallback}`,
      `Tokens/Sec: ${tactical.tokensPerSec || 'N/A'} | Token Count: ${tactical.tokenCount || 'N/A'}`,
      `\n--- RAW PROMPT ---`,
      promptText,
      `\n--- RAW MODEL RESPONSE ---`,
      tactical.rawResponse || '(none)',
      `\n--- CHOSEN MOVE & REASONING ---`,
      tactical.reasoning || '(none)',
      turn.banter ? `\n--- BANTER STREAM ---\n${turn.banter.fullText || ''}` : ''
    ].join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(exportText);
        const btn = document.getElementById('btn-debug-copy-prompt');
        if (btn) {
          const original = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(() => { btn.textContent = original; }, 1500);
        }
      }
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  }

  /**
   * Exports full telemetry history as a downloadable JSON file.
   */
  exportLogs() {
    const data = JSON.stringify({
      exportedAt: new Date().toISOString(),
      turnsCount: this.turns.length,
      turns: this.turns
    }, null, 2);

    if (typeof document === 'undefined') return data;

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkers-llm-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return data;
  }

  /**
   * Renders the turn list sidebar, metrics header, and detailed prompt cards.
   */
  render() {
    if (typeof document === 'undefined') return;

    // 1. Render turn list
    if (this.turnListEl) {
      this.turnListEl.innerHTML = '';
      if (this.turns.length === 0) {
        this.turnListEl.innerHTML = '<div class="debug-empty-note">No LLM moves recorded yet.<br>Play a turn to inspect prompts!</div>';
      } else {
        this.turns.forEach((turn, idx) => {
          const item = document.createElement('button');
          item.className = `debug-turn-item ${idx === this.selectedTurnIndex ? 'active' : ''}`;
          const isRed = turn.turnColor === 1;
          const dot = isRed ? '🔴' : '⚫';
          const latency = turn.tactical?.latencyMs ? `${turn.tactical.latencyMs}ms` : '';
          const fallbackBadge = turn.tactical?.isFallback ? '<span class="debug-badge-fallback">Fallback</span>' : '';

          item.innerHTML = `
            <div class="turn-item-top">
              <span class="turn-item-title">${dot} Turn ${turn.turnNumber}</span>
              <span class="turn-item-latency">${latency}</span>
            </div>
            <div class="turn-item-sub">
              ${fallbackBadge}
              <span class="turn-item-attempts">Attempts: ${turn.tactical?.attempts || 1}</span>
            </div>
          `;

          item.addEventListener('click', () => this.selectTurn(idx));
          this.turnListEl.appendChild(item);
        });
      }
    }

    const currentTurn = this.turns[this.selectedTurnIndex];

    // 2. Render Metrics Bar
    if (this.metricsBarEl) {
      if (!currentTurn || !currentTurn.tactical) {
        this.metricsBarEl.innerHTML = '<span class="debug-metric-item">Select a turn to inspect details</span>';
      } else {
        const t = currentTurn.tactical;
        this.metricsBarEl.innerHTML = `
          <div class="debug-metric-card">
            <span class="metric-label">Latency</span>
            <span class="metric-val">${t.latencyMs} ms</span>
          </div>
          <div class="debug-metric-card">
            <span class="metric-label">Speed</span>
            <span class="metric-val">${t.tokensPerSec ? `${t.tokensPerSec} t/s` : 'N/A'}</span>
          </div>
          <div class="debug-metric-card">
            <span class="metric-label">Tokens</span>
            <span class="metric-val">${t.tokenCount || 'N/A'}</span>
          </div>
          <div class="debug-metric-card">
            <span class="metric-label">Attempts</span>
            <span class="metric-val ${t.attempts > 1 ? 'metric-warn' : ''}">${t.attempts || 1}</span>
          </div>
          <div class="debug-metric-card">
            <span class="metric-label">Result</span>
            <span class="metric-val ${t.isFallback ? 'metric-error' : 'metric-success'}">
              ${t.isFallback ? '⚠️ Fallback' : '✓ Clean Parse'}
            </span>
          </div>
        `;
      }
    }

    // 3. Render Session A: Tactical Move
    if (this.sessionADetailsEl) {
      if (!currentTurn || !currentTurn.tactical) {
        this.sessionADetailsEl.innerHTML = '<div class="debug-empty-panel">No turn selected.</div>';
      } else {
        const t = currentTurn.tactical;
        const systemMsg = Array.isArray(t.rawPrompt)
          ? t.rawPrompt.find((m) => m.role === 'system')?.content || '(None)'
          : '(Raw prompt format)';
        const userMsg = Array.isArray(t.rawPrompt)
          ? t.rawPrompt.find((m) => m.role === 'user')?.content || '(None)'
          : String(t.rawPrompt || '');

        this.sessionADetailsEl.innerHTML = `
          <div class="debug-section">
            <div class="debug-section-header">
              <h4>System Prompt (Rules & JSON Specification)</h4>
            </div>
            <pre class="debug-code-box"><code>${this._escapeHtml(systemMsg)}</code></pre>
          </div>

          <div class="debug-section">
            <div class="debug-section-header">
              <h4>User Prompt (Board State & Legal Move Options)</h4>
            </div>
            <pre class="debug-code-box"><code>${this._escapeHtml(userMsg)}</code></pre>
          </div>

          <div class="debug-section">
            <div class="debug-section-header">
              <h4>Raw Unparsed Model Response</h4>
            </div>
            <pre class="debug-code-box response-box"><code>${this._escapeHtml(t.rawResponse || '(empty)')}</code></pre>
          </div>

          <div class="debug-section">
            <div class="debug-section-header">
              <h4>Extracted Move & Tactical Reasoning</h4>
            </div>
            <div class="debug-reasoning-card">
              <strong>Reasoning:</strong> ${this._escapeHtml(t.reasoning || 'N/A')}
            </div>
          </div>
        `;
      }
    }

    // 4. Render Session B: Banter Stream
    if (this.sessionBDetailsEl) {
      if (!currentTurn || !currentTurn.banter) {
        this.sessionBDetailsEl.innerHTML = `
          <div class="debug-empty-panel">
            ${currentTurn ? 'No banter recorded for this turn (or banter skipped).' : 'No turn selected.'}
          </div>
        `;
      } else {
        const b = currentTurn.banter;
        const banterPromptText = Array.isArray(b.rawPrompt)
          ? b.rawPrompt.map((m) => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n')
          : String(b.rawPrompt || '');

        this.sessionBDetailsEl.innerHTML = `
          <div class="debug-section">
            <div class="debug-section-header">
              <h4>Banter Prompt (Persona & Game Context)</h4>
            </div>
            <pre class="debug-code-box"><code>${this._escapeHtml(banterPromptText)}</code></pre>
          </div>

          <div class="debug-section">
            <div class="debug-section-header">
              <h4>Streamed Banter Dialogue</h4>
              <span class="debug-mini-tag">${b.latencyMs}ms</span>
            </div>
            <div class="debug-banter-quote">
              "${this._escapeHtml(b.fullText || '')}"
            </div>
          </div>
        `;
      }
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const debugInspector = new DebugInspector();
