/**
 * @file minimax_player.js
 * Minimax AI player implementation using CheckersAI search engine.
 */

import { BasePlayer } from './base_player.js';
import { CheckersAI } from '../ai.js';

export class MinimaxPlayer extends BasePlayer {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} [options.name]
   * @param {number} options.color
   * @param {string} [options.difficulty='medium'] - 'easy' | 'medium' | 'hard'
   * @param {number} [options.delayMs=250] - Simulated thinking delay in milliseconds
   */
  constructor({ id, name, color, difficulty = 'medium', delayMs = 0 }) {
    const defaultName = `Minimax (${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)})`;
    super({
      id,
      name: name || defaultName,
      color,
      type: 'minimax',
      isInteractive: false
    });

    this.difficulty = difficulty;
    this.delayMs = delayMs;
    this.engine = new CheckersAI(difficulty);
    this._timer = null;
  }

  /**
   * Sets AI difficulty.
   * @param {string} difficulty
   */
  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    this.engine.setDifficulty(difficulty);
  }

  /**
   * Requests the best tactical move via Minimax search.
   * @param {Object} context
   * @returns {Promise<{ move: Object, meta: Object }>}
   */
  requestMove(context) {
    if (context.signal && context.signal.aborted) {
      return Promise.reject(new Error('Move request aborted'));
    }

    const compute = () => {
      const move = this.engine.getBestMove({
        board: context.board,
        turn: context.turn,
        mustContinueJumpFrom: context.mustContinueJumpFrom
      });

      if (!move && context.legalMoves && context.legalMoves.length > 0) {
        return { move: context.legalMoves[0], meta: { fallback: true } };
      }
      return { move, meta: { difficulty: this.difficulty } };
    };

    if (this.delayMs <= 0) {
      try {
        return Promise.resolve(compute());
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this._timer) {
          clearTimeout(this._timer);
          this._timer = null;
        }
        reject(new Error('Move request aborted'));
      };

      if (context.signal) {
        context.signal.addEventListener('abort', onAbort, { once: true });
      }

      this._timer = setTimeout(() => {
        this._timer = null;
        if (context.signal) {
          context.signal.removeEventListener('abort', onAbort);
        }
        try {
          resolve(compute());
        } catch (err) {
          reject(err);
        }
      }, this.delayMs);
    });
  }

  dispose() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
