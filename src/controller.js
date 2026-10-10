/**
 * @file controller.js
 * Game orchestration, turn lifecycle, selection state machine,
 * pluggable player architecture, WebLLM banter integration, and Model vs Model spectator arena.
 */

import {
  PLAYER_RED,
  PLAYER_BLACK,
  RED_MAN,
  BLACK_MAN,
  EMPTY,
  isPlayerPiece,
  createInitialState
} from './state.js';

import {
  getLegalMoves,
  applyMove,
  checkGameOver,
  getGameOverReason,
  DRAW_RULE_HALF_MOVES
} from './rules.js';

import { CheckersAI } from './ai.js';
import { HumanPlayer } from './players/human_player.js';
import { MinimaxPlayer } from './players/minimax_player.js';
import { LLMPlayer } from './players/llm_player.js';
import { webLLMService } from './llm/web_llm_service.js';
import { checkWebGPUSupport } from './llm/gpu_check.js';
import { formatMoveDescription } from './llm/prompts.js';
import { DEFAULT_MODEL_ID } from './llm/model_registry.js';
import { DEFAULT_PERSONA_RED, DEFAULT_PERSONA_BLACK } from './llm/personas.js';

export class CheckersController {
  /**
   * @param {import('./renderer.js').CheckersRenderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;

    this.state = createInitialState();
    this.lastMove = null;
    this.statusMessage = '';

    // Match statistics tracking
    this.stats = {
      turnCount: 0,
      redCaptures: 0,
      blackCaptures: 0,
      redKingsCrowned: 0,
      blackKingsCrowned: 0,
      startTime: Date.now()
    };

    // 40-move draw rule progress counter
    this.halfMovesWithoutProgress = 0;
    this.winReason = null;
    this.isAnimating = false;

    // Game Mode: 'llm', 'minimax', 'pvp', or 'arena' (legacy 'ai' maps to 'minimax' or 'llm')
    this.gameMode = 'minimax';
    this.difficulty = 'medium';

    // Model & Tactical settings
    this.modelId = DEFAULT_MODEL_ID;
    this.tacticalMode = 'wild'; // 'wild' | 'grandmaster'

    // Spectator Controls (AI vs AI / LLM vs LLM)
    this.spectatorState = 'playing'; // 'playing' | 'paused'
    this.spectatorSpeed = 1600;      // Milliseconds delay between spectator moves
    this.isStepActive = false;

    // Pluggable Player Registry
    this.players = {
      [PLAYER_RED]: new HumanPlayer({ id: 'player-red', name: 'Red', color: PLAYER_RED }),
      [PLAYER_BLACK]: new MinimaxPlayer({
        id: 'player-black',
        name: 'Black',
        color: PLAYER_BLACK,
        difficulty: this.difficulty
      })
    };

    // Backward-compatibility mirror for player types ('human' | 'ai')
    this.playerTypes = {
      [PLAYER_RED]: 'human',
      [PLAYER_BLACK]: 'ai'
    };

    // Backward-compatibility reference to Minimax AI engine
    this.aiAgent = this.players[PLAYER_BLACK].engine;

    // Turn scheduling and cancellation
    this.aiTimeoutId = null;
    this.turnAbortController = null;

    // UI Preferences
    this.showNotation = false;
    this.boardFlipped = false;
    this.soundMuted = false;
  }

  /**
   * Returns whether both Red and Black are non-interactive players (Spectator Mode).
   * @returns {boolean}
   */
  get isSpectatorMode() {
    return !this.players[PLAYER_RED].isInteractive && !this.players[PLAYER_BLACK].isInteractive;
  }

  /**
   * Sets player instance for a given color.
   * @param {number} color - PLAYER_RED or PLAYER_BLACK
   * @param {import('./players/base_player.js').BasePlayer} playerInstance
   */
  setPlayer(color, playerInstance) {
    if (this.players[color]) {
      this.players[color].dispose();
    }
    this.players[color] = playerInstance;
    this.playerTypes[color] = playerInstance.isInteractive ? 'human' : 'ai';

    if (color === PLAYER_BLACK && playerInstance instanceof MinimaxPlayer) {
      this.aiAgent = playerInstance.engine;
    }

    if (this.renderer && typeof this.renderer.setPlayerInfo === 'function') {
      const avatar = playerInstance.persona ? playerInstance.persona.avatar : (color === PLAYER_RED ? '🔴' : '⚫');
      this.renderer.setPlayerInfo(color, { name: playerInstance.name, avatar });
    }
  }

  /**
   * Initializes event listeners, model listeners, and starts the game.
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

    // 2. Control buttons and review modal
    if (typeof document !== 'undefined') {
      const btnNewGame = document.getElementById('btn-new-game');
      if (btnNewGame) {
        btnNewGame.addEventListener('click', () => this.resetGame());
      }

      const btnModalRestart = document.getElementById('btn-modal-restart');
      if (btnModalRestart) {
        btnModalRestart.addEventListener('click', () => this.resetGame());
      }

      const btnModalReview = document.getElementById('btn-modal-review');
      if (btnModalReview) {
        btnModalReview.addEventListener('click', () => {
          this.renderer.hideModalForReview();
        });
      }

      const btnReopenModal = document.getElementById('btn-reopen-modal');
      if (btnReopenModal) {
        btnReopenModal.addEventListener('click', () => {
          this.renderer.showReviewRecap();
        });
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

      // Arena Setup and Spectator Control bindings
      this._bindArenaControls();
    }

    // 3. WebLLM Progress Reporting
    webLLMService.onProgress((report) => {
      if (this.renderer && typeof this.renderer.updateDownloadProgress === 'function') {
        this.renderer.updateDownloadProgress(report);
      }
    });

    // 4. Global keyboard shortcut dispatcher
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // 5. Initial hardware & WebGPU check to configure initial default game mode
    this._checkWebGPUAndSetInitialMode();

    // 6. Initial render
    this.updateView();

    // Check if initial turn belongs to automated player
    if (!this.players[this.state.turn].isInteractive) {
      this.scheduleAutomatedTurn();
    }
  }

  /**
   * Evaluates WebGPU support and sets the initial game mode:
   * Defaults to 'llm' if WebGPU is supported, or 'minimax' with notice if not.
   * @private
   */
  async _checkWebGPUAndSetInitialMode() {
    try {
      const gpuResult = await checkWebGPUSupport();
      if (gpuResult.supported) {
        // WebGPU is supported: default to LLM AI mode
        this.setGameMode('llm', false);
      } else {
        // WebGPU is not supported: set to Minimax with status notice
        this.setGameMode('minimax', false);
        this.statusMessage = 'WebGPU not detected; using Minimax (Classic AI).';
        this.updateView();
      }
    } catch (e) {
      this.setGameMode('minimax', false);
    }
  }

  /**
   * Binds UI controls for Arena setup modal and spectator toolbar.
   * @private
   */
  _bindArenaControls() {
    if (typeof document === 'undefined') return;

    // Spectator toolbar buttons
    const btnPlay = document.getElementById('btn-spectator-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        if (this.spectatorState === 'playing') {
          this.spectatorPause();
        } else {
          this.spectatorPlay();
        }
      });
    }

    const btnStep = document.getElementById('btn-spectator-step');
    if (btnStep) {
      btnStep.addEventListener('click', () => this.spectatorStep());
    }

    const selectSpeed = document.getElementById('select-spectator-speed');
    if (selectSpeed) {
      selectSpeed.value = String(this.spectatorSpeed);
      selectSpeed.addEventListener('change', (e) => {
        this.spectatorSpeed = parseInt(e.target.value, 10) || 1600;
      });
    }

    // Matchup setup modal triggers
    const btnOpenArena = document.getElementById('btn-arena-setup');
    const modalArena = document.getElementById('modal-arena-setup');
    const btnCloseArena = document.getElementById('btn-close-arena');
    const btnApplyArena = document.getElementById('btn-apply-arena');

    if (btnOpenArena && modalArena) {
      btnOpenArena.addEventListener('click', () => {
        modalArena.classList.remove('hidden');
      });
    }

    if (btnCloseArena && modalArena) {
      btnCloseArena.addEventListener('click', () => {
        modalArena.classList.add('hidden');
      });
    }

    if (btnApplyArena && modalArena) {
      btnApplyArena.addEventListener('click', () => {
        this._applyArenaSetupFromDOM();
        modalArena.classList.add('hidden');
      });
    }

    // Clear feed button
    const btnClearFeed = document.getElementById('btn-clear-feed');
    if (btnClearFeed && this.renderer && this.renderer.arenaFeedList) {
      btnClearFeed.addEventListener('click', () => {
        this.renderer.arenaFeedList.innerHTML = '';
      });
    }
  }

  /**
   * Reads arena configuration values from modal form and configures matchup.
   * @private
   */
  _applyArenaSetupFromDOM() {
    if (typeof document === 'undefined') return;

    const redType = document.getElementById('arena-red-type')?.value || 'human';
    const redPersona = document.getElementById('arena-red-persona')?.value || DEFAULT_PERSONA_RED;
    const blackType = document.getElementById('arena-black-type')?.value || 'llm';
    const blackPersona = document.getElementById('arena-black-persona')?.value || DEFAULT_PERSONA_BLACK;
    const modelId = document.getElementById('arena-model')?.value || DEFAULT_MODEL_ID;
    const tacticalMode = document.getElementById('arena-tactical-mode')?.value || 'wild';

    this.configureMatchup({
      redType,
      redPersona,
      blackType,
      blackPersona,
      modelId,
      tacticalMode
    });
  }

  /**
   * Configures players for Red and Black and restarts the match.
   * @param {Object} config
   */
  configureMatchup({
    redType = 'human',
    redPersona = DEFAULT_PERSONA_RED,
    blackType = 'ai',
    blackPersona = DEFAULT_PERSONA_BLACK,
    modelId = DEFAULT_MODEL_ID,
    tacticalMode = 'wild'
  }) {
    this.modelId = modelId;
    this.tacticalMode = tacticalMode;

    // Configure Red Player
    let redPlayer;
    if (redType === 'human') {
      redPlayer = new HumanPlayer({ id: 'player-red', name: 'Red (Human)', color: PLAYER_RED });
    } else if (redType === 'minimax') {
      redPlayer = new MinimaxPlayer({
        id: 'player-red',
        name: `Red (Minimax ${this.difficulty})`,
        color: PLAYER_RED,
        difficulty: this.difficulty
      });
    } else {
      redPlayer = new LLMPlayer({
        id: 'player-red',
        color: PLAYER_RED,
        personaId: redPersona,
        modelId,
        tacticalMode
      });
    }

    // Configure Black Player
    let blackPlayer;
    if (blackType === 'human') {
      blackPlayer = new HumanPlayer({ id: 'player-black', name: 'Black (Human)', color: PLAYER_BLACK });
    } else if (blackType === 'minimax' || blackType === 'ai') {
      blackPlayer = new MinimaxPlayer({
        id: 'player-black',
        name: `Black (Minimax ${this.difficulty})`,
        color: PLAYER_BLACK,
        difficulty: this.difficulty
      });
    } else {
      blackPlayer = new LLMPlayer({
        id: 'player-black',
        color: PLAYER_BLACK,
        personaId: blackPersona,
        modelId,
        tacticalMode
      });
    }

    this.setPlayer(PLAYER_RED, redPlayer);
    this.setPlayer(PLAYER_BLACK, blackPlayer);

    // Update gameMode state
    if (this.isSpectatorMode) {
      this.gameMode = 'arena';
      this.spectatorState = 'playing';
    } else if (blackType === 'human' && redType === 'human') {
      this.gameMode = 'pvp';
    } else {
      this.gameMode = 'ai';
    }

    // Sync select dropdown in header if present
    if (typeof document !== 'undefined') {
      const selectMode = document.getElementById('select-game-mode');
      if (selectMode) selectMode.value = this.gameMode;
    }

    this.resetGame();
  }

  /**
   * Resumes automated spectator play.
   */
  spectatorPlay() {
    this.spectatorState = 'playing';
    if (this.renderer && typeof this.renderer.setSpectatorMode === 'function') {
      this.renderer.setSpectatorMode(true, false);
    }
    if (this.state.winner === null && !this.players[this.state.turn].isInteractive) {
      this.scheduleAutomatedTurn(150);
    }
  }

  /**
   * Pauses automated spectator play.
   */
  spectatorPause() {
    this.spectatorState = 'paused';
    if (this.turnAbortController) {
      this.turnAbortController.abort();
      this.turnAbortController = null;
    }
    if (this.aiTimeoutId !== null) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }
    if (this.renderer && typeof this.renderer.setSpectatorMode === 'function') {
      this.renderer.setSpectatorMode(true, true);
    }
    this.statusMessage = 'Spectator match paused.';
    this.updateView();
  }

  /**
   * Advances exactly one automated move in spectator mode.
   */
  spectatorStep() {
    if (this.isAnimating || this.state.winner !== null) return;
    this.isStepActive = true;
    this.scheduleAutomatedTurn(50);
  }

  /**
   * Dispatches keyboard shortcuts (Esc, R, M, N, F, Space).
   * @param {KeyboardEvent} event
   */
  handleKeyDown(event) {
    const targetTag = (event.target && event.target.tagName) ? event.target.tagName : '';
    if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') {
      return;
    }

    const key = event.key ? event.key.toLowerCase() : '';
    if (event.key === 'Escape') {
      this.handleEscapeKey();
    } else if (key === 'r') {
      this.resetGame();
    } else if (key === 'm') {
      this.toggleMute();
    } else if (key === 'n') {
      this.toggleNotation();
    } else if (key === 'f') {
      this.toggleRotate();
    } else if (event.code === 'Space' && this.isSpectatorMode) {
      event.preventDefault();
      if (this.spectatorState === 'playing') {
        this.spectatorPause();
      } else {
        this.spectatorPlay();
      }
    }
  }

  /**
   * Deselects current piece unless locked into a multi-jump sequence.
   */
  handleEscapeKey() {
    if (this.state.mustContinueJumpFrom === null && this.state.selectedSquare !== null) {
      this.state.selectedSquare = null;
      this.statusMessage = '';
      this.updateView();
    }
  }

  /**
   * Handles user clicks on a dark square (0..31).
   * @param {number} index
   */
  handleSquareClick(index) {
    if (this.isAnimating) return;
    if (this.state.winner !== null) return;

    const activePlayer = this.players[this.state.turn];
    if (!activePlayer || !activePlayer.isInteractive) return;

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
        if (activePlayer instanceof HumanPlayer) {
          activePlayer.submitMove(validMove);
        }
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
      if (activePlayer instanceof HumanPlayer) {
        activePlayer.submitMove(move);
      }
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
    if (this.isAnimating) return;

    const movingPiece = this.state.board[move.from];
    const isMan = movingPiece === RED_MAN || movingPiece === BLACK_MAN;
    const isJump = move.isJump;
    const currentTurn = this.state.turn;

    // Apply move through pure rules engine
    const { nextBoard, crowned, canContinueJump } = applyMove(this.state.board, move);

    // Track 40-move draw progress rule
    if (isJump || isMan) {
      this.halfMovesWithoutProgress = 0;
    } else {
      this.halfMovesWithoutProgress++;
    }

    // Track match statistics
    this.stats.turnCount++;
    if (isJump) {
      if (currentTurn === PLAYER_RED) {
        this.stats.redCaptures++;
      } else {
        this.stats.blackCaptures++;
      }
    }
    if (crowned) {
      if (currentTurn === PLAYER_RED) {
        this.stats.redKingsCrowned++;
      } else {
        this.stats.blackKingsCrowned++;
      }
    }

    const shouldAnimate = typeof window !== 'undefined' && this.renderer && typeof this.renderer.animateMove === 'function';

    if (shouldAnimate) {
      this.isAnimating = true;
      this.renderer.animateMove(move).then(() => {
        this.isAnimating = false;
        this._finalizeMove(move, nextBoard, crowned, canContinueJump);
      });
      return;
    }

    this._finalizeMove(move, nextBoard, crowned, canContinueJump);
  }

  /**
   * Finalizes state mutation, sound effects, multi-jump checks, and game-over detection.
   * @private
   */
  _finalizeMove(move, nextBoard, crowned, canContinueJump) {
    const executedTurn = this.state.turn;
    const executingPlayer = this.players[executedTurn];

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

    // Check victory condition with 40-move rule
    const winner = checkGameOver(this.state.board, this.state.turn, this.halfMovesWithoutProgress);
    if (winner !== null) {
      this.state.winner = winner;
      this.winReason = getGameOverReason(this.state.board, this.state.turn, this.halfMovesWithoutProgress);
      this.renderer.sound.playWin();
    }

    this.updateView(crowned ? move.to : null);

    // Notify players of executed move
    const moveRecord = {
      player: executedTurn,
      from: move.from,
      to: move.to,
      isJump: move.isJump,
      crowned,
      board: nextBoard
    };
    if (this.players[PLAYER_RED]) this.players[PLAYER_RED].onMoveExecuted(moveRecord);
    if (this.players[PLAYER_BLACK]) this.players[PLAYER_BLACK].onMoveExecuted(moveRecord);

    // If game ended, stop
    if (this.state.winner !== null) {
      return;
    }

    // Handle next turn for automated players
    const nextPlayer = this.players[this.state.turn];
    if (!nextPlayer.isInteractive) {
      if (this.isSpectatorMode && this.isStepActive) {
        // Single step completed: pause spectator
        this.isStepActive = false;
        this.spectatorPause();
        return;
      }

      if (this.isSpectatorMode && this.spectatorState === 'paused') {
        return;
      }

      const delay = canContinueJump
        ? 250
        : (this.isSpectatorMode ? Math.max(300, this.spectatorSpeed) : 300);

      this.scheduleAutomatedTurn(delay);
    }
  }

  /**
   * Schedules move execution for automated players (Minimax or LLM).
   * @param {number} [delay=300]
   */
  scheduleAutomatedTurn(delay = 300) {
    if (this.aiTimeoutId !== null) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    if (this.turnAbortController) {
      this.turnAbortController.abort();
      this.turnAbortController = null;
    }

    const activePlayer = this.players[this.state.turn];
    if (!activePlayer || activePlayer.isInteractive) return;

    if (this.isSpectatorMode && this.spectatorState === 'paused' && !this.isStepActive) {
      return;
    }

    if (activePlayer.type === 'minimax') {
      this.statusMessage = 'AI is thinking...';
    } else {
      this.statusMessage = `${activePlayer.name} is thinking...`;
    }
    this.updateView();

    this.turnAbortController = new AbortController();
    const currentSignal = this.turnAbortController.signal;

    this.aiTimeoutId = setTimeout(async () => {
      this.aiTimeoutId = null;
      if (this.state.winner !== null || currentSignal.aborted) return;

      const legalMoves = getLegalMoves(
        this.state.board,
        this.state.turn,
        this.state.mustContinueJumpFrom
      );

      if (legalMoves.length === 0) return;

      try {
        const turnContext = {
          board: this.state.board,
          turn: this.state.turn,
          mustContinueJumpFrom: this.state.mustContinueJumpFrom,
          legalMoves,
          stats: this.stats,
          halfMovesWithoutProgress: this.halfMovesWithoutProgress,
          signal: currentSignal
        };

        const result = await activePlayer.requestMove(turnContext);
        if (currentSignal.aborted || !result || !result.move) return;

        const chosenMove = result.move;

        // If active player is an LLMPlayer, trigger concurrent personality banter streaming
        if (activePlayer instanceof LLMPlayer && typeof activePlayer.streamBanter === 'function') {
          const moveDesc = formatMoveDescription(chosenMove);
          activePlayer.streamBanter({
            move: chosenMove,
            board: this.state.board,
            turn: this.state.turn,
            crowned: false,
            onToken: (delta, full) => {
              if (this.renderer && typeof this.renderer.streamBanter === 'function') {
                this.renderer.streamBanter(this.state.turn, full);
              }
            },
            signal: currentSignal
          }).then((banter) => {
            if (banter && this.renderer && typeof this.renderer.addBanterToFeed === 'function') {
              this.renderer.addBanterToFeed({
                color: activePlayer.color,
                name: activePlayer.name,
                avatar: activePlayer.persona?.avatar,
                text: banter,
                moveDesc
              });
            }
          }).catch(() => {});
        }

        this.executeMove(chosenMove);
      } catch (err) {
        if (!currentSignal.aborted) {
          const reason = err.message || 'Move calculation failed';
          console.error(`[Controller] Error during ${activePlayer.name}'s move:`, err);

          // Update turn message banner with explicit failure reason
          const errorBanner = `⚠️ LLM error: ${reason}. Fallback move executed.`;
          this.statusMessage = errorBanner;
          if (this.renderer && this.renderer.turnMessage) {
            this.renderer.turnMessage.textContent = errorBanner;
          }

          // Log error to WebLLM service / Dashboard activity log
          webLLMService._log(`[Controller] ${activePlayer.name} error: ${reason}. Executing fallback move.`, 'error');

          // Fallback move: execute first legal move (or minimax move) to keep game alive
          if (legalMoves.length > 0) {
            this.executeMove(legalMoves[0]);
          }

          // Retain explicit banner after fallback move finalizes
          this.statusMessage = errorBanner;
          if (this.renderer && this.renderer.turnMessage) {
            this.renderer.turnMessage.textContent = errorBanner;
          }
        }
      }
    }, delay);
  }

  /**
   * Sets game mode:
   * - 'llm': Play vs LLM AI (Chat & Banter)
   * - 'minimax': Play vs Minimax (Classic AI)
   * - 'pvp': Pass & Play (2 Player)
   * - 'arena': AI vs AI Arena (Spectator)
   * @param {string} mode
   * @param {boolean} [shouldReset=true]
   */
  setGameMode(mode, shouldReset = true) {
    this.gameMode = mode;

    if (mode === 'llm') {
      this.setPlayer(PLAYER_RED, new HumanPlayer({ id: 'player-red', name: 'Red', color: PLAYER_RED }));
      this.setPlayer(PLAYER_BLACK, new LLMPlayer({
        id: 'player-black',
        color: PLAYER_BLACK,
        personaId: DEFAULT_PERSONA_BLACK,
        modelId: this.modelId,
        tacticalMode: this.tacticalMode
      }));
    } else if (mode === 'minimax' || mode === 'ai') {
      this.setPlayer(PLAYER_RED, new HumanPlayer({ id: 'player-red', name: 'Red', color: PLAYER_RED }));
      this.setPlayer(PLAYER_BLACK, new MinimaxPlayer({
        id: 'player-black',
        name: 'Black',
        color: PLAYER_BLACK,
        difficulty: this.difficulty
      }));
    } else if (mode === 'pvp') {
      this.setPlayer(PLAYER_RED, new HumanPlayer({ id: 'player-red', name: 'Red', color: PLAYER_RED }));
      this.setPlayer(PLAYER_BLACK, new HumanPlayer({ id: 'player-black', name: 'Black', color: PLAYER_BLACK }));
    } else if (mode === 'arena') {
      this.setPlayer(PLAYER_RED, new LLMPlayer({
        id: 'player-red',
        color: PLAYER_RED,
        personaId: DEFAULT_PERSONA_RED,
        modelId: this.modelId,
        tacticalMode: this.tacticalMode
      }));
      this.setPlayer(PLAYER_BLACK, new LLMPlayer({
        id: 'player-black',
        color: PLAYER_BLACK,
        personaId: DEFAULT_PERSONA_BLACK,
        modelId: this.modelId,
        tacticalMode: this.tacticalMode
      }));
      this.spectatorState = 'playing';
    }

    // Toggle difficulty selector visibility if in DOM (only needed for minimax/ai)
    if (typeof document !== 'undefined') {
      const selectDifficulty = document.getElementById('select-difficulty');
      if (selectDifficulty) {
        selectDifficulty.style.display = (mode === 'minimax' || mode === 'ai') ? 'inline-block' : 'none';
      }
      const selectMode = document.getElementById('select-game-mode');
      if (selectMode && selectMode.value !== mode) {
        selectMode.value = mode;
      }
    }

    if (shouldReset) {
      this.resetGame();
    }
  }

  /**
   * Sets AI difficulty level: 'easy', 'medium', or 'hard'.
   * @param {string} diff
   */
  setDifficulty(diff) {
    this.difficulty = diff;
    if (this.players[PLAYER_BLACK] instanceof MinimaxPlayer) {
      this.players[PLAYER_BLACK].setDifficulty(diff);
      this.aiAgent = this.players[PLAYER_BLACK].engine;
    }
    if (this.players[PLAYER_RED] instanceof MinimaxPlayer) {
      this.players[PLAYER_RED].setDifficulty(diff);
    }
  }

  /**
   * Re-evaluates current legal moves and updates renderer.
   * @param {number|null} [newlyCrownedIndex=null]
   */
  updateView(newlyCrownedIndex = null) {
    const activePlayer = this.players[this.state.turn];
    const isInteractive = activePlayer && activePlayer.isInteractive;

    const legalMoves = (this.state.winner !== null || !isInteractive)
      ? []
      : getLegalMoves(this.state.board, this.state.turn, this.state.mustContinueJumpFrom);

    const selectableIndices = new Set(legalMoves.map((m) => m.from));

    const legalMovesForSelected = this.state.selectedSquare !== null
      ? legalMoves.filter((m) => m.from === this.state.selectedSquare)
      : [];

    const mustJump = legalMoves.some((m) => m.isJump);

    // Compute prey indices for jump targets
    const preyIndices = new Set();
    if (this.state.mustContinueJumpFrom !== null) {
      const jumps = legalMoves.filter((m) => m.from === this.state.mustContinueJumpFrom && m.isJump);
      for (let i = 0; i < jumps.length; i++) {
        if (jumps[i].captured !== null && jumps[i].captured !== undefined) {
          preyIndices.add(jumps[i].captured);
        }
      }
    } else if (this.state.selectedSquare !== null) {
      const jumps = legalMovesForSelected.filter((m) => m.isJump);
      for (let i = 0; i < jumps.length; i++) {
        if (jumps[i].captured !== null && jumps[i].captured !== undefined) {
          preyIndices.add(jumps[i].captured);
        }
      }
    }

    if (this.renderer && typeof this.renderer.setSpectatorMode === 'function') {
      this.renderer.setSpectatorMode(this.isSpectatorMode, this.spectatorState === 'paused');
    }

    this.renderer.render({
      state: this.state,
      legalMovesForSelected,
      selectableIndices,
      lastMove: this.lastMove,
      mustJump,
      message: this.statusMessage,
      newlyCrownedIndex,
      stats: this.stats,
      winReason: this.winReason,
      preyIndices
    });
  }

  /**
   * Resets game to starting position.
   */
  resetGame() {
    if (this.turnAbortController) {
      this.turnAbortController.abort();
      this.turnAbortController = null;
    }
    if (this.aiTimeoutId !== null) {
      clearTimeout(this.aiTimeoutId);
      this.aiTimeoutId = null;
    }

    if (this.players[PLAYER_RED]) this.players[PLAYER_RED].dispose();
    if (this.players[PLAYER_BLACK]) this.players[PLAYER_BLACK].dispose();

    this.state = createInitialState();
    this.lastMove = null;
    this.statusMessage = '';
    this.halfMovesWithoutProgress = 0;
    this.winReason = null;
    this.isAnimating = false;
    this.stats = {
      turnCount: 0,
      redCaptures: 0,
      blackCaptures: 0,
      redKingsCrowned: 0,
      blackKingsCrowned: 0,
      startTime: Date.now()
    };

    if (this.renderer) {
      if (typeof this.renderer.hideBanter === 'function') {
        this.renderer.hideBanter(PLAYER_RED);
        this.renderer.hideBanter(PLAYER_BLACK);
      }
      if (typeof this.renderer.setPlayerInfo === 'function') {
        const redAvatar = this.players[PLAYER_RED]?.persona?.avatar || '🔴';
        const blackAvatar = this.players[PLAYER_BLACK]?.persona?.avatar || '⚫';
        this.renderer.setPlayerInfo(PLAYER_RED, { name: this.players[PLAYER_RED]?.name || 'Red', avatar: redAvatar });
        this.renderer.setPlayerInfo(PLAYER_BLACK, { name: this.players[PLAYER_BLACK]?.name || 'Black', avatar: blackAvatar });
      }
    }

    this.updateView();

    const activePlayer = this.players[this.state.turn];
    if (activePlayer && !activePlayer.isInteractive) {
      this.scheduleAutomatedTurn();
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
