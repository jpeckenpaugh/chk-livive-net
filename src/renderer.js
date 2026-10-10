/**
 * @file renderer.js
 * DOM rendering, board grid generation, piece presentation,
 * highlights, and zero-dependency Web Audio effects for English Draughts.
 */

import {
  EMPTY,
  RED_MAN,
  RED_KING,
  BLACK_MAN,
  BLACK_KING,
  PLAYER_RED,
  PLAYER_BLACK,
  isRed,
  isBlack,
  isKing,
  indexToCoord,
  coordToIndex,
  indexToNotation,
  isDarkSquare
} from './state.js';

// SVG Crown icon markup for crowned King pieces
const CROWN_SVG = `
<svg class="crown-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z"/>
</svg>`.trim();

/**
 * Audio Synthesizer using Web Audio API for zero-dependency sound effects.
 */
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _initContext() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playMove() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.05);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Audio context may be restricted in non-user-gesture environment
    }
  }

  playCapture() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.09);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch (e) {}
  }

  playCrown() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [587.33, 880]; // D5 -> A5 fanfare chime
      notes.forEach((freq, idx) => {
        const noteTime = now + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.28, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.18);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.18);
      });
    } catch (e) {}
  }

  playWin() {
    if (this.muted) return;
    this._initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      chord.forEach((freq, idx) => {
        const noteTime = now + idx * 0.09;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.3, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.35);
      });
    } catch (e) {}
  }
}

/**
 * CheckersRenderer handles all UI updates, DOM construction, and visual state.
 */
export class CheckersRenderer {
  constructor(boardElement) {
    this.boardElement = boardElement;
    this.sound = new SoundEffects();

    // Cache of 32 dark square DOM elements (indexed 0..31)
    this.darkSquareElements = new Array(32);
    // Cache of all 64 square elements
    this.allSquareElements = [];

    // DOM UI elements
    this.turnBadge = document.getElementById('turn-badge');
    this.turnDot = document.getElementById('turn-dot');
    this.turnText = document.getElementById('turn-text');
    this.turnMessage = document.getElementById('turn-message');

    this.playerRedCard = document.getElementById('player-red-card');
    this.playerBlackCard = document.getElementById('player-black-card');

    this.redPiecesCountEl = document.getElementById('red-pieces-count');
    this.redKingsCountEl = document.getElementById('red-kings-count');
    this.blackPiecesCountEl = document.getElementById('black-pieces-count');
    this.blackKingsCountEl = document.getElementById('black-kings-count');

    this.modal = document.getElementById('game-over-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.modalMessage = document.getElementById('modal-message');

    this.soundOnIcon = document.getElementById('icon-sound-on');
    this.soundOffIcon = document.getElementById('icon-sound-off');
    this.soundLabel = document.getElementById('sound-label');

    this._buildBoardGrid();
  }

  /**
   * Generates the 8x8 grid in the board container.
   * Dark squares are stored in `darkSquareElements` by 32-square index.
   */
  _buildBoardGrid() {
    this.boardElement.innerHTML = '';
    this.allSquareElements = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const square = document.createElement('div');
        square.dataset.row = String(row);
        square.dataset.col = String(col);

        if (isDarkSquare(row, col)) {
          const index = coordToIndex(row, col);
          square.className = 'square square-dark';
          square.dataset.index = String(index);

          // Draughts notation badge (1..32)
          const notationBadge = document.createElement('span');
          notationBadge.className = 'square-notation';
          notationBadge.textContent = String(indexToNotation(index));
          square.appendChild(notationBadge);

          this.darkSquareElements[index] = square;
        } else {
          square.className = 'square square-light';
        }

        this.boardElement.appendChild(square);
        this.allSquareElements.push(square);
      }
    }
  }

  /**
   * Updates sound muted UI state.
   * @param {boolean} isMuted
   */
  setMuted(isMuted) {
    this.sound.muted = isMuted;
    if (this.soundOnIcon && this.soundOffIcon) {
      if (isMuted) {
        this.soundOnIcon.classList.add('hidden');
        this.soundOffIcon.classList.remove('hidden');
        if (this.soundLabel) this.soundLabel.textContent = 'Muted';
      } else {
        this.soundOnIcon.classList.remove('hidden');
        this.soundOffIcon.classList.add('hidden');
        if (this.soundLabel) this.soundLabel.textContent = 'Sound';
      }
    }
  }

  /**
   * Toggles display of square numbers (1..32).
   * @param {boolean} show
   */
  setShowNotation(show) {
    if (show) {
      this.boardElement.classList.add('show-notation');
    } else {
      this.boardElement.classList.remove('show-notation');
    }
  }

  /**
   * Toggles board rotation by 180 degrees.
   * @param {boolean} flipped
   */
  setBoardFlipped(flipped) {
    if (flipped) {
      this.boardElement.classList.add('flipped');
    } else {
      this.boardElement.classList.remove('flipped');
    }
  }

  /**
   * Full re-render of the board and scoreboard based on current game state.
   * @param {Object} renderData
   * @param {Object} renderData.state - current state object
   * @param {Array} renderData.legalMovesForSelected - legal moves for selected piece
   * @param {Set<number>} renderData.selectableIndices - set of square indices player can pick
   * @param {Object|null} renderData.lastMove - { from, to }
   * @param {boolean} renderData.mustJump - whether mandatory jump is active
   * @param {string} renderData.message - status message to display
   * @param {boolean} [renderData.newlyCrownedIndex] - index of piece crowned on this move
   */
  render({
    state,
    legalMovesForSelected = [],
    selectableIndices = new Set(),
    lastMove = null,
    mustJump = false,
    message = '',
    newlyCrownedIndex = null
  }) {
    // 1. Clear highlights on all dark squares
    for (let i = 0; i < 32; i++) {
      const square = this.darkSquareElements[i];
      if (!square) continue;

      square.classList.remove('valid-dest', 'is-jump-dest', 'last-move-from', 'last-move-to');

      // Clear existing piece element (retaining notation badge)
      const existingPiece = square.querySelector('.piece');
      if (existingPiece) {
        existingPiece.remove();
      }

      // Check board piece value
      const pieceVal = state.board[i];
      if (pieceVal !== EMPTY) {
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';

        if (isRed(pieceVal)) {
          pieceEl.classList.add('red');
        } else if (isBlack(pieceVal)) {
          pieceEl.classList.add('black');
        }

        if (isKing(pieceVal)) {
          pieceEl.classList.add('king');
          pieceEl.innerHTML = CROWN_SVG;
        }

        if (selectableIndices.has(i)) {
          pieceEl.classList.add('selectable');
        }

        if (state.selectedSquare === i) {
          pieceEl.classList.add('selected');
        }

        if (newlyCrownedIndex === i) {
          pieceEl.classList.add('newly-crowned');
        }

        square.appendChild(pieceEl);
      }
    }

    // 2. Highlight legal move destinations for selected piece
    if (legalMovesForSelected && legalMovesForSelected.length > 0) {
      for (let j = 0; j < legalMovesForSelected.length; j++) {
        const move = legalMovesForSelected[j];
        const destSquare = this.darkSquareElements[move.to];
        if (destSquare) {
          destSquare.classList.add('valid-dest');
          if (move.isJump) {
            destSquare.classList.add('is-jump-dest');
          }
        }
      }
    }

    // 3. Highlight last move (from & to)
    if (lastMove) {
      const fromSquare = this.darkSquareElements[lastMove.from];
      const toSquare = this.darkSquareElements[lastMove.to];
      if (fromSquare) fromSquare.classList.add('last-move-from');
      if (toSquare) toSquare.classList.add('last-move-to');
    }

    // 4. Update Scoreboard and Stats
    this._updateStats(state);

    // 5. Update Status Banner
    this._updateStatus(state, mustJump, message);

    // 6. Game Over Modal
    if (state.winner !== null) {
      this._showGameOver(state);
    } else {
      this._hideGameOver();
    }
  }

  _updateStats(state) {
    let redCount = 0;
    let redKings = 0;
    let blackCount = 0;
    let blackKings = 0;

    for (let i = 0; i < 32; i++) {
      const piece = state.board[i];
      if (piece === RED_MAN) redCount++;
      else if (piece === RED_KING) { redCount++; redKings++; }
      else if (piece === BLACK_MAN) blackCount++;
      else if (piece === BLACK_KING) { blackCount++; blackKings++; }
    }

    if (this.redPiecesCountEl) this.redPiecesCountEl.textContent = String(redCount);
    if (this.redKingsCountEl) this.redKingsCountEl.textContent = String(redKings);
    if (this.blackPiecesCountEl) this.blackPiecesCountEl.textContent = String(blackCount);
    if (this.blackKingsCountEl) this.blackKingsCountEl.textContent = String(blackKings);

    // Active card highlighting
    if (this.playerRedCard && this.playerBlackCard) {
      if (state.turn === PLAYER_RED) {
        this.playerRedCard.classList.add('active-turn');
        this.playerBlackCard.classList.remove('active-turn');
      } else {
        this.playerBlackCard.classList.add('active-turn');
        this.playerRedCard.classList.remove('active-turn');
      }
    }
  }

  _updateStatus(state, mustJump, customMessage) {
    const isRedTurn = state.turn === PLAYER_RED;

    if (this.turnText) {
      this.turnText.textContent = isRedTurn ? "Red's Turn" : "Black's Turn";
    }

    if (this.turnDot) {
      if (isRedTurn) {
        this.turnDot.classList.remove('black-turn');
      } else {
        this.turnDot.classList.add('black-turn');
      }
    }

    if (this.turnMessage) {
      if (customMessage) {
        this.turnMessage.textContent = customMessage;
        if (/thinking/i.test(customMessage)) {
          this.turnMessage.classList.add('thinking');
          this.turnMessage.classList.remove('alert');
        } else {
          this.turnMessage.classList.add('alert');
          this.turnMessage.classList.remove('thinking');
        }
      } else if (state.mustContinueJumpFrom !== null) {
        this.turnMessage.textContent = 'Multi-jump! You must continue the capture chain.';
        this.turnMessage.classList.add('alert');
        this.turnMessage.classList.remove('thinking');
      } else if (mustJump) {
        this.turnMessage.textContent = 'Capture available! Mandatory jump required.';
        this.turnMessage.classList.add('alert');
        this.turnMessage.classList.remove('thinking');
      } else {
        this.turnMessage.textContent = 'Select a piece to move.';
        this.turnMessage.classList.remove('alert');
        this.turnMessage.classList.remove('thinking');
      }
    }
  }

  _showGameOver(state) {
    if (!this.modal) return;

    let title = 'Game Over';
    let msg = '';

    if (state.winner === PLAYER_RED) {
      title = 'Red Wins!';
      msg = 'Congratulations! Red has won the game!';
    } else if (state.winner === PLAYER_BLACK) {
      title = 'Black Wins!';
      msg = 'Congratulations! Black has won the game!';
    } else if (state.winner === 'draw') {
      title = 'Draw Game';
      msg = 'The game has ended in a draw.';
    }

    if (this.modalTitle) this.modalTitle.textContent = title;
    if (this.modalMessage) this.modalMessage.textContent = msg;

    this.modal.classList.remove('hidden');
  }

  _hideGameOver() {
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }
}
