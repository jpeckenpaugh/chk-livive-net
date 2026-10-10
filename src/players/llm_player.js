/**
 * @file llm_player.js
 * LLM-powered player coordinating Session A (Tactical Move Selection)
 * and Session B (Personality Banter Streamer) with fallback support.
 */

import { BasePlayer } from './base_player.js';
import { getPersona, DEFAULT_PERSONA_RED, DEFAULT_PERSONA_BLACK } from '../llm/personas.js';
import { DEFAULT_MODEL_ID } from '../llm/model_registry.js';
import { buildTacticalPrompt, buildBanterPrompt } from '../llm/prompts.js';
import { executeMoveSelectionWithRetries } from '../llm/parser.js';
import { webLLMService } from '../llm/web_llm_service.js';
import { CheckersAI } from '../ai.js';
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
   * @param {WebLLMService} [options.service] - Optional custom WebLLMService instance
   */
  constructor({
    id,
    name,
    color,
    personaId,
    modelId = DEFAULT_MODEL_ID,
    tacticalMode = 'wild',
    service = webLLMService
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
    this.service = service;

    this.minimaxHelper = new CheckersAI('medium');
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
   * Request move selection via Session A (Tactical Engine).
   * @param {Object} context
   * @returns {Promise<{ move: Object, reasoning: string, isFallback: boolean, banterPromise?: Promise<string> }>}
   */
  async requestMove(context) {
    const { board, turn, mustContinueJumpFrom, legalMoves, signal } = context;

    if (!legalMoves || legalMoves.length === 0) {
      return { move: null, reasoning: 'No legal moves available' };
    }

    // Single forced move shortcut: immediately choose to conserve compute
    if (legalMoves.length === 1) {
      return {
        move: legalMoves[0],
        reasoning: legalMoves[0].isJump ? 'Forced mandatory jump' : 'Single legal move',
        isFallback: false
      };
    }

    // Ensure model is loaded in service
    await this.service.loadModel(this.modelId);

    // Optional Minimax candidate annotations in Grandmaster mode
    let evaluatedCandidates = null;
    if (this.tacticalMode === 'grandmaster') {
      const best = this.minimaxHelper.getBestMove({ board, turn, mustContinueJumpFrom });
      evaluatedCandidates = legalMoves.map((m) => ({
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
      tacticalMode: this.tacticalMode,
      evaluatedCandidates
    });

    const queryFn = async (msgs) => {
      return await this.service.chatCompletion({
        messages: msgs,
        temperature: 0.1,
        max_tokens: 60,
        signal
      });
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

    return selectionResult;
  }

  /**
   * Streams banter for Session B (Personality Banter Streamer).
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
      const messages = buildBanterPrompt({
        persona: this.persona,
        move,
        board,
        turn,
        crowned,
        opponentBanter: this.lastOpponentBanter
      });

      const banter = await this.service.chatCompletion({
        messages,
        temperature: 0.85,
        max_tokens: 50,
        stream: true,
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
