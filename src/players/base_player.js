/**
 * @file base_player.js
 * Abstract BasePlayer class defining the unified interface for all player types.
 */

export class BasePlayer {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique player instance identifier
   * @param {string} options.name - Display name (e.g. "Human", "Minimax", "Captain Redbeard")
   * @param {number} options.color - PLAYER_RED (1) or PLAYER_BLACK (-1)
   * @param {string} options.type - 'human' | 'minimax' | 'llm'
   * @param {boolean} [options.isInteractive=false] - True if moves are input through DOM clicks
   */
  constructor({ id, name, color, type, isInteractive = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.type = type;
    this.isInteractive = isInteractive;
  }

  /**
   * Requests a move for this player's turn.
   * @param {Object} context
   * @param {Int8Array} context.board - 32-square board representation
   * @param {number} context.turn - Active player color
   * @param {number|null} context.mustContinueJumpFrom - Square index if mid-jump
   * @param {Array<Object>} context.legalMoves - Enumerated legal moves
   * @param {Object} [context.stats] - Match stats
   * @param {number} [context.halfMovesWithoutProgress] - Draw counter
   * @param {AbortSignal} [context.signal] - Signal to cancel pending move
   * @returns {Promise<{ move: Object, banter?: string, meta?: Object }>}
   */
  async requestMove(context) {
    throw new Error('requestMove must be implemented by subclass');
  }

  /**
   * Callback invoked after any move is executed on the board.
   * Allows LLM or agents to update conversation context or react to opponent moves.
   * @param {Object} moveRecord
   */
  onMoveExecuted(moveRecord) {}

  /**
   * Clean up background listeners, workers, or timers.
   */
  dispose() {}
}
