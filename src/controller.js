/**
 * @file controller.js
 * Game orchestration, turn lifecycle, selection state machine,
 * mandatory capture enforcement, multi-jump management, and AI-ready turn dispatch.
 */

import {
  PLAYER_RED,
  PLAYER_BLACK,
  EMPTY,
  isPlayerPiece,
  createInitialState
} from './state.js';

import {
  getLegalMoves,
  applyMove,
  checkGameOver
} from './rules.js';

import { CheckersAI } from './ai.js';

export class CheckersController {
  /**
   * @param {import('./renderer.js').CheckersRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;

    this.state = createInitialState();
    this.lastMove = null;
    this.statusMessage = '';

    // Game Mode: 'ai' (Play vs AI) or 'pvp' (Pass & Play)
    this.gameMode = 'ai';
    this.difficulty = 'medium';

    // Player types: 'human' or 'ai'.
    // In 'ai' mode, Human is Red (1) and AI is Black (-1).
    this.playerTypes = {
      [PLAYER_RED]: 'human',
      [PLAYER_BLACK]: 'ai'
    };

    // UI Preferences
    this.showNotation = false;
    this.boardFlipped = false;
    this.soundMuted = false;

    // AI Engine instance
    this.aiAgent = new CheckersAI(this.difficulty);

    // AI turn timeout reference to prevent overlapping runs
    this.aiTimeoutId = null;
  }

  /**
   * Initializes event listeners and starts the game.
   */
  init() {
    // 1. Board click delegation
    this.renderer.boardElement.addEventListener('click', (event) => {
      const square = event.target.closest('.square-dark');
      if (!square || square.dataset.index === undefined) return;

      const index = parseInt(square.dataset.index, 10);
      if (!Number.isNaN(index)) {
        this.handleSquareClick(index);
      }
    });

    // 2. Control buttons
    if (typeof document !== 'undefined') {
      const btnNewGame = document.getElementById('btn-new-game');
      if (btnNewGame) {
        btnNewGame.addEventListener('click', () => this.resetGame());
      }

      const btnModalRestart = document.getElementById('btn-modal-restart');
      if (btnModalRestart) {
        btnModalRestart.addEventListener('click', () => this.resetGame());
      }

      const btnRotate = document.getElementById('btn-rotate');
      if (btnRotate) {
        btnRotate.addEventListener('click', () => this.toggleRotate());
      }

      const btnNotation = document.getElementById('btn-notation');
      if (btnNotation) {
        btnNotation.addEventListener('click', () => this.toggleNotation());
      }

      const btnMute = document.getElementById('btn-mute');
      if (btnMute) {
        btnMute.addEventListener('click', () => this.toggleMute());
      }

      const selectMode = document.getElementById('select-game-mode');
      if (selectMode) {
        selectMode.value = this.gameMode;
        selectMode.addEventListener('change', (e) => this.setGameMode(e.target.value));
      }

      const selectDifficulty = document.getElementById('select-difficulty');
      if (selectDifficulty) {
        selectDifficulty.value = this.difficulty;
        selectDifficulty.addEventListener('change', (e) => this.setDifficulty(e.target.value));
      }
    }

    // 3. Initial render
    this.updateView();
  }

  /**
   * Handles user clicks on a dark square (0..31).
   * @param {number} index
   */
  handleSquareClick(index) {
    // Ignore input if game is over or current turn belongs to AI
    if (this.state.winner !== null) return;
    if (this.playerTypes[this.state.turn] !== 'human') return;

    const legalMoves = getLegalMoves(
      this.state.board,
      this.state.turn,
      this.state.mustContinueJumpFrom
    );

    // If locked into a multi-jump sequence:
    if (this.state.mustContinueJumpFrom !== null) {
      const validMove = legalMoves.find(
        (m) => m.from === this.state.mustContinueJumpFrom && m.to === index
      );

      if (validMove) {
        this.executeMove(validMove);
      } else {
        this.statusMessage = 'Multi-jump in progress! You must complete the capture chain.';
        this.updateView();
      }
      return;
    }

    // Normal play: No piece currently selected
    if (this.state.selectedSquare === null) {
      const piece = this.state.board[index];

      if (piece !== EMPTY && isPlayerPiece(piece, this.state.turn)) {
        const pieceLegalMoves = legalMoves.filter((m) => m.from === index);
        if (pieceLegalMoves.length > 0) {
          this.state.selectedSquare = index;
          this.statusMessage = '';
        } else {
          const hasJumps = legalMoves.some((m) => m.isJump);
          this.statusMessage = hasJumps
            ? 'Mandatory capture! You must select a piece that can jump.'
            : 'That piece has no legal moves.';
        }
      }
      this.updateView();
      return;
    }

    // Piece already selected:
    const selected = this.state.selectedSquare;

    // Deselect if clicking the already selected piece
    if (index === selected) {
      this.state.selectedSquare = null;
      this.statusMessage = '';
      this.updateView();
      return;
    }

    // If clicking another friendly piece, switch selection if legal
    const targetPiece = this.state.board[index];
    if (targetPiece !== EMPTY && isPlayerPiece(targetPiece, this.state.turn)) {
      const otherPieceMoves = legalMoves.filter((m) => m.from === index);
      if (otherPieceMoves.length > 0) {
        this.state.selectedSquare = index;
        this.statusMessage = '';
      } else {
        const hasJumps = legalMoves.some((m) => m.isJump);
        this.statusMessage = hasJumps
          ? 'Mandatory capture! You must select a piece that can jump.'
          : 'That piece has no legal moves.';
      }
      this.updateView();
      return;
    }

    // Check if clicked square is a valid destination for the selected piece
    const move = legalMoves.find((m) => m.from === selected && m.to === index);
    if (move) {
      this.executeMove(move);
    } else {
      // Clicked an invalid destination square: deselect
      this.state.selectedSquare = null;
      this.statusMessage = '';
      this.updateView();
    }
  }

  /**
   * Applies a legal move, triggers sound and animation, handles multi-jump
   * continuation, and updates turn or game over status.
   * @param {{ from: number, to: number, isJump: boolean, captured: number|null }} move
   */
  executeMove(move) {
    const { nextBoard, crowned, canContinueJump } = applyMove(this.state.board, move);

    this.state.board = nextBoard;
    this.lastMove = { from: move.from, to: move.to };

    // Play appropriate sound effect
    if (move.isJump) {
      this.renderer.sound.playCapture();
    } else {
      this.renderer.sound.playMove();
    }

    if (crowned) {
      this.renderer.sound.playCrown();
    }

    // Check multi-jump continuation
    if (canContinueJump) {
      this.state.mustContinueJumpFrom = move.to;
      this.state.selectedSquare = move.to;
      this.statusMessage = 'Multi-jump! Continue the capture chain.';
    } else {
      this.state.mustContinueJumpFrom = null;
      this.state.selectedSquare = null;
      this.statusMessage = '';
      // Pass turn to opponent
      this.state.turn = -this.state.turn;
    }

    // Check victory condition
    const winner = checkGameOver(this.state.board, this.state.turn);
    if (winner !== null) {
      this.state.winner = winner;
      this.renderer.sound.playWin();
    }

    this.updateView(crowned ? move.to : null);

    // If turn switched or continues to AI, schedule AI turn
    if (this.state.winner === null && this.playerTypes[this.state.turn] === 'ai') {
      this.scheduleAiTurn();
    }
  }

  /**
   * Schedules AI move execution with natural delay and status indicator.
   * Uses 300ms pacing for both normal moves and chained jumps.
   */
  scheduleAiTurn() {
    if (!this.aiAgent) return;
    if (this.aiTimeoutId !== null) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    this.statusMessage = 'AI is thinking...';
    this.updateView();

    this.aiTimeoutId = setTimeout(() => {
      this.aiTimeoutId = null;
      if (this.state.winner !== null) return;
      if (this.playerTypes[this.state.turn] !== 'ai') return;

      const move = this.aiAgent.getBestMove(this.state);
      if (move) {
        this.executeMove(move);
      }
    }, 300);
  }

  /**
   * Sets game mode: 'ai' (Play vs AI) or 'pvp' (Pass & Play).
   * @param {string} mode
   */
  setGameMode(mode) {
    this.gameMode = mode;
    if (mode === 'ai') {
      this.playerTypes[PLAYER_RED] = 'human';
      this.playerTypes[PLAYER_BLACK] = 'ai';
    } else {
      this.playerTypes[PLAYER_RED] = 'human';
      this.playerTypes[PLAYER_BLACK] = 'human';
    }

    // Toggle difficulty selector visibility if in DOM
    if (typeof document !== 'undefined') {
      const selectDifficulty = document.getElementById('select-difficulty');
      if (selectDifficulty) {
        selectDifficulty.style.display = mode === 'ai' ? 'inline-block' : 'none';
      }
    }

    // If active turn is now AI, schedule AI move
    if (this.state.winner === null && this.playerTypes[this.state.turn] === 'ai') {
      this.scheduleAiTurn();
    } else {
      this.updateView();
    }
  }

  /**
   * Sets AI difficulty level: 'easy', 'medium', or 'hard'.
   * @param {string} diff
   */
  setDifficulty(diff) {
    this.difficulty = diff;
    if (this.aiAgent) {
      this.aiAgent.setDifficulty(diff);
    }
  }

  /**
   * Re-evaluates current legal moves and updates renderer.
   * @param {number|null} [newlyCrownedIndex=null]
   */
  updateView(newlyCrownedIndex = null) {
    const isAiTurn = this.playerTypes[this.state.turn] === 'ai';
    const legalMoves = (this.state.winner !== null || isAiTurn)
      ? []
      : getLegalMoves(this.state.board, this.state.turn, this.state.mustContinueJumpFrom);

    const selectableIndices = new Set(legalMoves.map((m) => m.from));

    const legalMovesForSelected = this.state.selectedSquare !== null
      ? legalMoves.filter((m) => m.from === this.state.selectedSquare)
      : [];

    const mustJump = legalMoves.some((m) => m.isJump);

    this.renderer.render({
      state: this.state,
      legalMovesForSelected,
      selectableIndices,
      lastMove: this.lastMove,
      mustJump,
      message: this.statusMessage,
      newlyCrownedIndex
    });
  }

  /**
   * Resets game to starting position.
   */
  resetGame() {
    if (this.aiTimeoutId !== null) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }
    this.state = createInitialState();
    this.lastMove = null;
    this.statusMessage = '';
    this.updateView();

    if (this.playerTypes[this.state.turn] === 'ai') {
      this.scheduleAiTurn();
    }
  }

  /**
   * Toggles board visual rotation.
   */
  toggleRotate() {
    this.boardFlipped = !this.boardFlipped;
    this.renderer.setBoardFlipped(this.boardFlipped);
  }

  /**
   * Toggles board square notation display (1..32).
   */
  toggleNotation() {
    this.showNotation = !this.showNotation;
    this.renderer.setShowNotation(this.showNotation);
  }

  /**
   * Toggles sound audio.
   */
  toggleMute() {
    this.soundMuted = !this.soundMuted;
    this.renderer.setMuted(this.soundMuted);
  }
}
