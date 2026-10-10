/**
 * @file human_player.js
 * Human player implementation driven by interactive DOM clicks.
 */

import { BasePlayer } from './base_player.js';

export class HumanPlayer extends BasePlayer {
  /**
   * @param {Object} options
   * @param {string} options.id
   * @param {string} [options.name='Human']
   * @param {number} options.color
   */
  constructor({ id, name = 'Human', color }) {
    super({
      id,
      name,
      color,
      type: 'human',
      isInteractive: true
    });

    this._pendingResolver = null;
    this._pendingRejecter = null;
  }

  /**
   * Waits for human move input via board clicks.
   * @param {Object} context
   * @returns {Promise<{ move: Object }>}
   */
  requestMove(context) {
    if (this._pendingRejecter) {
      this._pendingRejecter(new Error('Previous turn superseded'));
      this._pendingResolver = null;
      this._pendingRejecter = null;
    }

    return new Promise((resolve, reject) => {
      this._pendingResolver = resolve;
      this._pendingRejecter = reject;

      if (context.signal) {
        context.signal.addEventListener('abort', () => {
          if (this._pendingRejecter) {
            this._pendingRejecter(new Error('Move request aborted'));
            this._pendingResolver = null;
            this._pendingRejecter = null;
          }
        }, { once: true });
      }
    });
  }

  /**
   * Called by controller when a valid move is clicked by the user.
   * @param {Object} move
   */
  submitMove(move) {
    if (this._pendingResolver) {
      const resolver = this._pendingResolver;
      this._pendingResolver = null;
      this._pendingRejecter = null;
      resolver({ move });
    }
  }

  /**
   * Cancels any pending turn promise.
   */
  cancelPendingMove() {
    if (this._pendingRejecter) {
      this._pendingRejecter(new Error('Move cancelled'));
      this._pendingResolver = null;
      this._pendingRejecter = null;
    }
  }

  dispose() {
    this.cancelPendingMove();
  }
}
