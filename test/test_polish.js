/**
 * @file test_polish.js
 * Comprehensive unit tests for Milestone 4:
 * 40-move draw rule, game-over reasons, match stats tracking,
 * keyboard shortcuts, multi-jump prey indicators, and review board state.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CheckersController } from '../src/controller.js';
import {
  checkGameOver,
  getGameOverReason,
  DRAW_RULE_HALF_MOVES
} from '../src/rules.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  RED_MAN,
  RED_KING,
  BLACK_MAN,
  BLACK_KING,
  EMPTY
} from '../src/state.js';

/**
 * Creates a mock renderer for testing the controller in Node.js.
 */
function createMockRenderer() {
  const boardEl = {
    addEventListener: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    }
  };

  return {
    boardElement: boardEl,
    sound: {
      playMove: () => {},
      playCapture: () => {},
      playCrown: () => {},
      playWin: () => {}
    },
    lastRenderArgs: null,
    reviewHidden: false,
    recapShown: false,
    render(args) {
      this.lastRenderArgs = args;
    },
    setBoardFlipped() {},
    setShowNotation() {},
    setMuted() {},
    hideModalForReview() {
      this.reviewHidden = true;
    },
    showReviewRecap() {
      this.recapShown = true;
    }
  };
}

test('Polish - 40-Move Rule & Draw Detection in rules.js', async (t) => {
  await t.test('checkGameOver returns null before 80 half-moves without progress', () => {
    const board = new Int8Array(32);
    // Two opposing kings that can move
    board[0] = RED_KING;
    board[31] = BLACK_KING;

    assert.equal(checkGameOver(board, PLAYER_RED, 79), null);
    assert.equal(getGameOverReason(board, PLAYER_RED, 79), null);
  });

  await t.test('checkGameOver returns draw at 80 half-moves without progress', () => {
    const board = new Int8Array(32);
    board[0] = RED_KING;
    board[31] = BLACK_KING;

    assert.equal(checkGameOver(board, PLAYER_RED, DRAW_RULE_HALF_MOVES), 'draw');
    assert.equal(getGameOverReason(board, PLAYER_RED, DRAW_RULE_HALF_MOVES), 'draw');
  });

  await t.test('getGameOverReason accurately identifies elimination vs trapped vs draw', () => {
    const board = new Int8Array(32);
    // Elimination: Black has 0 pieces
    board[10] = RED_MAN;
    assert.equal(getGameOverReason(board, PLAYER_BLACK, 10), 'elimination');

    // Trapped: Black has piece but 0 legal moves
    const trappedBoard = new Int8Array(32);
    trappedBoard[0] = BLACK_MAN;
    trappedBoard[4] = RED_MAN;
    trappedBoard[5] = RED_MAN;
    trappedBoard[9] = RED_MAN;
    assert.equal(getGameOverReason(trappedBoard, PLAYER_BLACK, 10), 'trapped');
  });
});

test('Polish - Controller 40-Move Rule Progress Tracking', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // Set up King move (non-capture, king-only)
  controller.state.board.fill(EMPTY);
  controller.state.board[18] = RED_KING;
  controller.state.board[5] = BLACK_KING;
  controller.state.turn = PLAYER_RED;
  controller.halfMovesWithoutProgress = 10;

  // Move Red King from 18 to 14 (step)
  controller.executeMove({ from: 18, to: 14, isJump: false, captured: null });
  assert.equal(controller.halfMovesWithoutProgress, 11, 'Counter should increment on King step');

  // Red Man advance (step) should reset counter to 0
  controller.state.board[22] = BLACK_MAN;
  controller.executeMove({ from: 22, to: 26, isJump: false, captured: null });
  assert.equal(controller.halfMovesWithoutProgress, 0, 'Counter should reset to 0 on Man advance');

  // King move again increments
  controller.executeMove({ from: 14, to: 10, isJump: false, captured: null });
  assert.equal(controller.halfMovesWithoutProgress, 1);

  // Jump capture resets counter to 0
  controller.state.board[10] = RED_KING;
  controller.state.board[15] = BLACK_MAN;
  controller.state.turn = PLAYER_RED;
  controller.executeMove({ from: 10, to: 19, isJump: true, captured: 15 });
  assert.equal(controller.halfMovesWithoutProgress, 0, 'Counter should reset to 0 on capture jump');

  // If counter reaches 80, draw triggers
  controller.state.board.fill(EMPTY);
  controller.state.board[1] = RED_KING;
  controller.state.board[30] = BLACK_KING;
  controller.state.turn = PLAYER_RED;
  controller.halfMovesWithoutProgress = 79;
  controller.executeMove({ from: 1, to: 6, isJump: false, captured: null });

  assert.equal(controller.state.winner, 'draw');
  assert.equal(controller.winReason, 'draw');
});

test('Polish - Controller Match Statistics Tracking', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  assert.equal(controller.stats.turnCount, 0);
  assert.equal(controller.stats.redCaptures, 0);
  assert.equal(controller.stats.blackCaptures, 0);
  assert.equal(controller.stats.redKingsCrowned, 0);
  assert.equal(controller.stats.blackKingsCrowned, 0);

  // 1. Red moves 21 -> 17 (simple step)
  controller.executeMove({ from: 21, to: 17, isJump: false, captured: null });
  assert.equal(controller.stats.turnCount, 1);
  assert.equal(controller.stats.redCaptures, 0);

  // 2. Black captures 9 -> 18 jumping 14
  controller.state.board[9] = BLACK_MAN;
  controller.state.board[14] = RED_MAN;
  controller.state.turn = PLAYER_BLACK;
  controller.executeMove({ from: 9, to: 18, isJump: true, captured: 14 });
  assert.equal(controller.stats.turnCount, 2);
  assert.equal(controller.stats.blackCaptures, 1);

  // 3. Red man promotes to King at row 0 (e.g. square 5 -> 1)
  controller.state.board[5] = RED_MAN;
  controller.state.turn = PLAYER_RED;
  controller.executeMove({ from: 5, to: 1, isJump: false, captured: null });
  assert.equal(controller.stats.turnCount, 3);
  assert.equal(controller.stats.redKingsCrowned, 1);

  // 4. Reset game restores all stats to 0
  controller.resetGame();
  assert.equal(controller.stats.turnCount, 0);
  assert.equal(controller.stats.redCaptures, 0);
  assert.equal(controller.stats.blackCaptures, 0);
  assert.equal(controller.stats.redKingsCrowned, 0);
});

test('Polish - Multi-Jump Prey Targets Highlighting', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  // Setup position where piece 27 jumps over 23 to 18, then jumps over 14 to 9
  controller.state.board.fill(EMPTY);
  controller.state.board[27] = RED_MAN;
  controller.state.board[23] = BLACK_MAN;
  controller.state.board[14] = BLACK_MAN;
  controller.state.turn = PLAYER_RED;
  controller.updateView();

  // Select square 27: prey target should be 23
  controller.handleSquareClick(27);
  assert.ok(mockRenderer.lastRenderArgs.preyIndices.has(23));

  // Execute first jump to 18: enters multi-jump lock
  controller.handleSquareClick(18);
  assert.equal(controller.state.mustContinueJumpFrom, 18);
  // Next prey target in chain (14) must be highlighted
  assert.ok(mockRenderer.lastRenderArgs.preyIndices.has(14));
});

test('Polish - Keyboard Shortcuts Dispatching', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // 1. Select a piece
  controller.handleSquareClick(21);
  assert.equal(controller.state.selectedSquare, 21);

  // Press Escape -> deselects piece
  controller.handleKeyDown({ key: 'Escape', target: {} });
  assert.equal(controller.state.selectedSquare, null);

  // 2. Press M -> toggles mute
  assert.equal(controller.soundMuted, false);
  controller.handleKeyDown({ key: 'm', target: {} });
  assert.equal(controller.soundMuted, true);
  controller.handleKeyDown({ key: 'M', target: {} });
  assert.equal(controller.soundMuted, false);

  // 3. Press N -> toggles notation numbers
  assert.equal(controller.showNotation, false);
  controller.handleKeyDown({ key: 'n', target: {} });
  assert.equal(controller.showNotation, true);

  // 4. Press F -> toggles board flip / rotate
  assert.equal(controller.boardFlipped, false);
  controller.handleKeyDown({ key: 'f', target: {} });
  assert.equal(controller.boardFlipped, true);

  // 5. Press R -> resets game
  controller.handleSquareClick(21);
  controller.handleSquareClick(17);
  assert.equal(controller.state.turn, PLAYER_BLACK);
  controller.handleKeyDown({ key: 'r', target: {} });
  assert.equal(controller.state.turn, PLAYER_RED);

  // 6. Typing in an input/select element is ignored
  controller.handleSquareClick(21);
  assert.equal(controller.state.selectedSquare, 21);
  controller.handleKeyDown({ key: 'Escape', target: { tagName: 'INPUT' } });
  assert.equal(controller.state.selectedSquare, 21, 'Should ignore shortcut when focused in input');
});
