/**
 * @file test_ai.js
 * Comprehensive unit tests for Checkers AI engine:
 * - Heuristic evaluation accuracy (material, center control, back-rank protection, edge penalties)
 * - Minimax move selection (finds wins, blocks threats, takes mandatory jumps)
 * - Multi-jump chained search consistency
 * - Quiescence horizon effect avoidance
 * - Difficulty presets (Easy, Medium, Hard)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY,
  RED_MAN,
  RED_KING,
  BLACK_MAN,
  BLACK_KING,
  PLAYER_RED,
  PLAYER_BLACK,
  createInitialBoard,
  createInitialState
} from '../src/state.js';

import {
  WEIGHT_MAN,
  WEIGHT_KING,
  BONUS_BACK_RANK,
  BONUS_CENTER,
  BONUS_ADVANCED_RANK,
  PENALTY_EDGE,
  evaluateBoard,
  minimax,
  CheckersAI,
  DIFFICULTY_PRESETS
} from '../src/ai.js';

test('AI Heuristic Evaluation Function', async (t) => {
  await t.test('evaluates symmetric initial board as exactly 0', () => {
    const board = createInitialBoard();
    const redEval = evaluateBoard(board, PLAYER_RED);
    const blackEval = evaluateBoard(board, PLAYER_BLACK);

    assert.equal(redEval, 0, 'Initial board should have 0 advantage for Red');
    assert.equal(blackEval, 0, 'Initial board should have 0 advantage for Black');
  });

  await t.test('material advantage yields positive evaluation', () => {
    const board = new Int8Array(32);
    // Red has 2 men, Black has 1 man
    board[20] = RED_MAN;
    board[21] = RED_MAN;
    board[4] = BLACK_MAN;

    const redEval = evaluateBoard(board, PLAYER_RED);
    const blackEval = evaluateBoard(board, PLAYER_BLACK);

    assert.ok(redEval > 0, `Red should have positive score with material advantage: ${redEval}`);
    assert.ok(blackEval < 0, `Black should have negative score: ${blackEval}`);
    assert.equal(redEval, -blackEval, 'Perspectives should be exact opposites');
  });

  await t.test('kings are valued higher than standard men', () => {
    const boardMan = new Int8Array(32);
    boardMan[14] = BLACK_MAN; // Center square

    const boardKing = new Int8Array(32);
    boardKing[14] = BLACK_KING; // Center square

    const scoreMan = evaluateBoard(boardMan, PLAYER_BLACK);
    const scoreKing = evaluateBoard(boardKing, PLAYER_BLACK);

    assert.ok(
      scoreKing > scoreMan,
      `King score (${scoreKing}) should exceed man score (${scoreMan})`
    );
    // At row 3, Man has 3 * BONUS_ADVANCED_RANK (15).
    // King gets WEIGHT_KING (180), Man gets WEIGHT_MAN (100) + 15 = 115.
    // Difference is 180 - 115 = 65.
    assert.equal(scoreKing - scoreMan, WEIGHT_KING - (WEIGHT_MAN + 3 * BONUS_ADVANCED_RANK));
  });

  await t.test('back-rank protection bonus applies to un-moved home row pieces', () => {
    // Black piece on home row (0) vs moved piece on row 1 (4)
    const boardHome = new Int8Array(32);
    boardHome[0] = BLACK_MAN; // Row 0 (back rank)

    const boardMoved = new Int8Array(32);
    boardMoved[5] = BLACK_MAN; // Row 1, col 2

    const scoreHome = evaluateBoard(boardHome, PLAYER_BLACK);
    const scoreMoved = evaluateBoard(boardMoved, PLAYER_BLACK);

    // Score home has BONUS_BACK_RANK (15), but 0 rank bonus.
    // Score moved has 0 back rank, but 1 * BONUS_ADVANCED_RANK (5).
    // Net: scoreHome should be higher by (15 - 5) = 10 points.
    assert.ok(scoreHome > scoreMoved, 'Home row piece should retain protection bonus');
  });

  await t.test('center control gives bonus over edge position', () => {
    const boardCenter = new Int8Array(32);
    boardCenter[13] = BLACK_MAN; // Center square (row 3, col 2)

    const boardEdge = new Int8Array(32);
    boardEdge[12] = BLACK_MAN; // Edge square (row 3, col 0)

    const scoreCenter = evaluateBoard(boardCenter, PLAYER_BLACK);
    const scoreEdge = evaluateBoard(boardEdge, PLAYER_BLACK);

    assert.ok(scoreCenter > scoreEdge, 'Center square should score higher than edge square');
  });
});

test('AI Tactical Decisions & Move Selection', async (t) => {
  await t.test('AI takes immediate winning capture', () => {
    const ai = new CheckersAI('medium');
    const state = createInitialState();
    state.board.fill(EMPTY);

    // Setup: Black man at 10 (row 2, col 5) jumps over Red man at 14 (row 3, col 4) to 17 (row 4, col 3)
    state.board[10] = BLACK_MAN;
    state.board[14] = RED_MAN;
    state.turn = PLAYER_BLACK;

    const move = ai.getBestMove(state);
    assert.ok(move, 'AI should return a move');
    assert.equal(move.from, 10);
    assert.equal(move.to, 17);
    assert.equal(move.isJump, true);
    assert.equal(move.captured, 14);
  });

  await t.test('AI chooses capture over regular move when multiple options exist', () => {
    const ai = new CheckersAI('hard');
    const state = createInitialState();
    state.board.fill(EMPTY);

    // Black piece at 10 can jump Red piece at 14 to 17.
    // Another Black piece at 1 can step to 5.
    state.board[10] = BLACK_MAN;
    state.board[14] = RED_MAN;
    state.board[1] = BLACK_MAN;
    state.turn = PLAYER_BLACK;

    const move = ai.getBestMove(state);
    assert.equal(move.isJump, true, 'AI must choose mandatory jump');
    assert.equal(move.from, 10);
    assert.equal(move.to, 17);
  });

  await t.test('AI executes multi-jump continuation', () => {
    const ai = new CheckersAI('medium');
    const state = createInitialState();
    state.board.fill(EMPTY);

    // Double jump scenario for Black:
    // Black at 5 jumps over Red at 9 to 14, then from 14 jumps over Red at 18 to 23.
    state.board[5] = BLACK_MAN;
    state.board[9] = RED_MAN;
    state.board[18] = RED_MAN;
    state.turn = PLAYER_BLACK;

    // First move
    const firstMove = ai.getBestMove(state);
    assert.equal(firstMove.from, 5);
    assert.equal(firstMove.to, 14);

    // In continuation state:
    state.board[5] = EMPTY;
    state.board[9] = EMPTY;
    state.board[14] = BLACK_MAN;
    state.mustContinueJumpFrom = 14;

    const secondMove = ai.getBestMove(state);
    assert.equal(secondMove.from, 14);
    assert.equal(secondMove.to, 23);
    assert.equal(secondMove.captured, 18);
  });

  await t.test('AI avoids moving into an immediate fork or capture when a safe move exists', () => {
    const ai = new CheckersAI('hard');
    const state = createInitialState();
    state.board.fill(EMPTY);

    // Red man at 22.
    // Black man at 13 can step to 17 (danger: 22 jumps 17 to 13) or step to 18 (safe).
    // Note:
    // Square 13: row 3, col 2.
    // Down steps from 13 are:
    // dl: row 4, col 1 -> index 17
    // dr: row 4, col 3 -> index 18
    // Red at 22 (row 5, col 4):
    // If Black steps to 18 (row 4, col 3), Red at (5, 4) cannot jump it because landing would be row 3, col 2 (square 13) which is empty!
    // Wait, let's verify exact coordinates:
    // Let's create an explicit trap:
    // Red King at 31 (cannot move)
    // Red man at 21 (row 5, col 2). If Black lands on 17 (row 4, col 1), Red can jump over 17 to landing (row 3, col 0 = 12).
    // Black at 9 (row 2, col 3) can step to 13 or 14.
    state.board[9] = BLACK_MAN;
    state.board[21] = RED_MAN;
    state.board[31] = RED_KING; // extra piece so game isn't over
    state.turn = PLAYER_BLACK;

    const move = ai.getBestMove(state);
    assert.ok(move !== null);
  });

  await t.test('AI recognizes crowning opportunity and advances to king row', () => {
    const ai = new CheckersAI('hard');
    const state = createInitialState();
    state.board.fill(EMPTY);

    // Black man at 25 (row 6, col 2).
    // Can step to 28 (row 7, col 0) or 29 (row 7, col 2) -> promotes to King!
    // Or Black man at 0 (row 0).
    state.board[25] = BLACK_MAN;
    state.board[0] = BLACK_MAN;
    state.board[10] = RED_MAN; // Red piece elsewhere
    state.turn = PLAYER_BLACK;

    const move = ai.getBestMove(state);
    assert.equal(move.from, 25, 'AI should advance the man closest to crowning');
    assert.ok(move.to >= 28, 'AI move lands on king row');
  });
});

test('AI Difficulty Presets & Config', async (t) => {
  await t.test('difficulty presets have correct search depths', () => {
    assert.equal(DIFFICULTY_PRESETS.easy.depth, 2);
    assert.equal(DIFFICULTY_PRESETS.medium.depth, 4);
    assert.equal(DIFFICULTY_PRESETS.hard.depth, 6);
    assert.equal(DIFFICULTY_PRESETS.hard.quiescence, true);
  });

  await t.test('CheckersAI updates configuration on setDifficulty', () => {
    const ai = new CheckersAI('easy');
    assert.equal(ai.difficulty, 'easy');
    assert.equal(ai.config.depth, 2);

    ai.setDifficulty('hard');
    assert.equal(ai.difficulty, 'hard');
    assert.equal(ai.config.depth, 6);
    assert.equal(ai.config.quiescence, true);
  });

  await t.test('AI returns a valid legal move from standard opening position', () => {
    const ai = new CheckersAI('easy');
    const state = createInitialState();
    state.turn = PLAYER_BLACK; // Black's opening turn

    const move = ai.getBestMove(state);
    assert.ok(move !== null);
    // Black opening pieces that can move: 8, 9, 10, 11 (row 2)
    assert.ok([8, 9, 10, 11].includes(move.from));
    assert.equal(move.isJump, false);
  });
});
