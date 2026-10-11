/**
 * @file llm_player.js
 * LLM-powered player coordinating Session A (Tactical Move Selection)
 * and Session B (Personality Banter Streamer) via dedicated Web Worker bridge.
 */

import { BasePlayer } from './base_player.js';
import { getPersona, DEFAULT_PERSONA_RED, DEFAULT_PERSONA_BLACK } from '../llm/personas.js';
import { DEFAULT_MODEL_ID } from '../llm/model_registry.js';
import { llmWorkerBridge, LLMWorkerBridge } from '../workers/llm_bridge.js';
import { PLAYER_RED } from '../state.js';

export class LLMPlayer extends BasePlayer {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} [options.name]
   * @param {number} options.color - PLAYER_RED or PLAYER_BLACK
   * @param {string} [options.personaId] - Persona key ('pirate', 'victorian', etc.)
   * @param {string} [options.modelId]
   * @param {'wild'|'grandmaster'} [options.tacticalMode='wild']
   * @param {import('../llm/web_llm_service.js').WebLLMService} [options.service] - Custom WebLLMService instance
   * @param {LLMWorkerBridge} [options.bridge] - Custom worker bridge instance
   */
  constructor({
    id,
    name,
    color,
    personaId,
    modelId = DEFAULT_MODEL_ID,
    tacticalMode = 'wild',
    service = null,
    bridge = null
  }) {
    const defaultPersonaKey = color === PLAYER_RED ? DEFAULT_PERSONA_RED : DEFAULT_PERSONA_BLACK;
    const persona = getPersona(personaId || defaultPersonaKey);

    super({
      id,
      name: name || `${persona.name} (${persona.avatar})`,
      color,
      type: 'llm',
      isInteractive: false
    });

    this.persona = persona;
    this.modelId = modelId;
    this.tacticalMode = tacticalMode;

    // Use custom bridge if provided, or wrap custom service, or use shared bridge
    if (bridge) {
      this.bridge = bridge;
    } else if (service) {
      this.bridge = new LLMWorkerBridge({ service });
    } else {
      this.bridge = llmWorkerBridge;
    }

    this.service = service || this.bridge.service;
    this.lastBanter = '';
    this.lastOpponentBanter = '';
    this._abortController = null;
  }

  /**
   * Updates persona profile.
   * @param {string} personaId
   */
  setPersona(personaId) {
    this.persona = getPersona(personaId);
    this.name = `${this.persona.name} (${this.persona.avatar})`;
  }

  /**
   * Sets tactical reasoning mode ('wild' vs 'grandmaster').
   * @param {'wild'|'grandmaster'} mode
   */
  setTacticalMode(mode) {
    this.tacticalMode = mode;
  }

  /**
   * Request move selection via Session A (Tactical Engine in Web Worker).
   * @param {Object} context
   * @returns {Promise<{ move: Object, reasoning: string, isFallback: boolean, attempts: number, rawPrompt: Array, rawResponse: string, latencyMs: number }>}
   */
  async requestMove(context) {
    const { board, turn, mustContinueJumpFrom, legalMoves, signal } = context;

    if (!legalMoves || legalMoves.length === 0) {
      return { move: null, reasoning: 'No legal moves available', isFallback: false };
    }

    // Single forced move shortcut: immediately choose to conserve compute
    if (legalMoves.length === 1) {
      return {
        move: legalMoves[0],
        reasoning: legalMoves[0].isJump ? 'Forced mandatory jump' : 'Single legal move',
        isFallback: false,
        attempts: 1
      };
    }

    // Ensure model is initialized if using service directly in mock
    if (this.service && typeof this.service.loadModel === 'function' && !this.bridge.isWorkerReady) {
      await this.service.loadModel(this.modelId);
    }

    const result = await this.bridge.generateMove({
      board,
      turn,
      mustContinueJumpFrom,
      legalMoves,
      tacticalMode: this.tacticalMode,
      personaId: this.persona?.id,
      signal
    });

    return {
      move: result.chosenMove,
      reasoning: result.reasoning,
      isFallback: Boolean(result.isFallback),
      attempts: result.attempts || 1,
      rawPrompt: result.rawPrompt,
      rawResponse: result.rawResponse,
      latencyMs: result.latencyMs
    };
  }

  /**
   * Streams banter for Session B (Personality Banter Streamer in Web Worker).
   * @param {Object} options
   * @param {Object} options.move - Move executed
   * @param {Int8Array} options.board - Board after move
   * @param {number} options.turn - Player color
   * @param {boolean} [options.crowned=false]
   * @param {Function} [options.onToken] - (delta, fullText) => void
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<string>}
   */
  async streamBanter({ move, board, turn, crowned = false, onToken = null, signal = null }) {
    try {
      const banter = await this.bridge.streamBanter({
        persona: this.persona,
        move,
        board,
        turn,
        crowned,
        opponentBanter: this.lastOpponentBanter,
        onToken,
        signal
      });

      this.lastBanter = banter.trim();
      return this.lastBanter;
    } catch (e) {
      return '';
    }
  }

  /**
   * Records opponent banter to maintain banter dialogue coherence.
   * @param {Object} moveRecord
   */
  onMoveExecuted(moveRecord) {
    if (moveRecord && moveRecord.player !== this.color && moveRecord.banter) {
      this.lastOpponentBanter = moveRecord.banter;
    }
  }

  dispose() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }
}
