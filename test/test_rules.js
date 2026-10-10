/**
 * @file test_rules.js
 * Comprehensive unit test suite for English Draughts state and rules engine.
 * Run with: node --test test/test_rules.js
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
  isRed,
  isBlack,
  isKing,
  isDarkSquare,
  indexToCoord,
  coordToIndex,
  indexToNotation,
  notationToIndex,
  createInitialBoard,
  createInitialState,
  cloneBoard,
  cloneState
} from '../src/state.js';

import {
  getPieceJumps,
  getPieceSteps,
  getLegalMoves,
  applyMove,
  applyMoveInPlace,
  undoMoveInPlace,
  checkGameOver
} from '../src/rules.js';

test('Board Topology & Coordinate Conversion', async (t) => {
  await t.test('all 32 dark squares round-trip correctly between index and (row, col)', () => {
    for (let index = 0; index < 32; index++) {
      const { row, col } = indexToCoord(index);
      assert.ok(row >= 0 && row <= 7, `Row out of bounds for index ${index}: ${row}`);
      assert.ok(col >= 0 && col <= 7, `Col out of bounds for index ${index}: ${col}`);
      assert.ok(isDarkSquare(row, col), `Square (${row}, ${col}) should be dark`);
      const mappedIndex = coordToIndex(row, col);
      assert.equal(mappedIndex, index, `Index round-trip mismatch at ${index}`);
    }
  });

  await t.test('isDarkSquare correctly identifies dark and light squares', () => {
    // Row 0, Col 0 is light; Row 0, Col 1 is dark
    assert.equal(isDarkSquare(0, 0), false);
    assert.equal(isDarkSquare(0, 1), true);
    // Row 7, Col 0 is dark; Row 7, Col 7 is light
    assert.equal(isDarkSquare(7, 0), true);
    assert.equal(isDarkSquare(7, 7), false);
    // Out of bounds
    assert.equal(isDarkSquare(-1, 0), false);
    assert.equal(isDarkSquare(8, 2), false);
  });

  await t.test('coordToIndex returns -1 for light or out-of-bounds squares', () => {
    assert.equal(coordToIndex(0, 0), -1);
    assert.equal(coordToIndex(7, 7), -1);
    assert.equal(coordToIndex(-1, 2), -1);
    assert.equal(coordToIndex(4, 8), -1);
  });

  await t.test('standard Draughts notation (1..32) maps correctly', () => {
    assert.equal(indexToNotation(0), 1);
    assert.equal(indexToNotation(31), 32);
    assert.equal(notationToIndex(1), 0);
    assert.equal(notationToIndex(32), 31);
    assert.equal(notationToIndex(0), -1);
    assert.equal(notationToIndex(33), -1);
    assert.throws(() => indexToNotation(-1), RangeError);
    assert.throws(() => indexToNotation(32), RangeError);
  });
});

test('Initial Board State & Opening Moves', async (t) => {
  await t.test('createInitialBoard correctly places 12 Black and 12 Red pieces', () => {
    const board = createInitialBoard();
    assert.equal(board.length, 32);

    let blackCount = 0;
    let redCount = 0;
    let emptyCount = 0;

    for (let i = 0; i < 12; i++) {
      assert.equal(board[i], BLACK_MAN, `Square ${i} should have BLACK_MAN`);
      blackCount++;
    }
    for (let i = 12; i < 20; i++) {
      assert.equal(board[i], EMPTY, `Square ${i} should be EMPTY`);
      emptyCount++;
    }
    for (let i = 20; i < 32; i++) {
      assert.equal(board[i], RED_MAN, `Square ${i} should have RED_MAN`);
      redCount++;
    }

    assert.equal(blackCount, 12);
    assert.equal(emptyCount, 8);
    assert.equal(redCount, 12);
  });

  await t.test('initial game state starts with Red turn and 7 legal opening moves', () => {
    const state = createInitialState();
    assert.equal(state.turn, PLAYER_RED);
    assert.equal(state.mustContinueJumpFrom, null);
    assert.equal(state.winner, null);

    const legalMoves = getLegalMoves(state.board, state.turn);
    // Red pieces on row 5:
    // idx 20 -> (5,0): can move to 16
    // idx 21 -> (5,2): can move to 16, 17
    // idx 22 -> (5,4): can move to 17, 18
    // idx 23 -> (5,6): can move to 18, 19
    // Total opening moves = 1 + 2 + 2 + 2 = 7 moves
    assert.equal(legalMoves.length, 7);
    for (const move of legalMoves) {
      assert.equal(move.isJump, false);
      assert.equal(move.captured, null);
      assert.ok(move.from >= 20 && move.from <= 23);
      assert.ok(move.to >= 16 && move.to <= 19);
    }
  });
});

test('Regular Diagonal Moves & Direction Constraints', async (t) => {
  await t.test('Red men only move UP and Black men only move DOWN', () => {
    const board = new Int8Array(32);
    // Place Red man on square 17 (row 4, col 3)
    board[17] = RED_MAN;
    const redSteps = getPieceSteps(board, 17, PLAYER_RED);
    // Up steps from row 4 col 3 go to row 3:
    // Up-Left: (3,2) -> idx 13; Up-Right: (3,4) -> idx 14
    assert.equal(redSteps.length, 2);
    const redDestinations = redSteps.map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(redDestinations, [13, 14]);

    // Place Black man on square 14 (row 3, col 4)
    board[14] = BLACK_MAN;
    const blackSteps = getPieceSteps(board, 14, PLAYER_BLACK);
    // Down steps from row 3 col 4 go to row 4:
    // Down-Left: (4,3) occupied by Red; Down-Right: (4,5) -> idx 18
    assert.equal(blackSteps.length, 1);
    assert.equal(blackSteps[0].to, 18);
  });

  await t.test('Men cannot move backward', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;
    const steps = getPieceSteps(board, 17, PLAYER_RED);
    // None of the destinations should have row > 4
    for (const step of steps) {
      const { row } = indexToCoord(step.to);
      assert.ok(row < 4, `Red man moved backward to row ${row}`);
    }
  });

  await t.test('Pieces cannot move into occupied squares', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;
    board[13] = RED_MAN;   // Block Up-Left
    board[14] = BLACK_MAN; // Block Up-Right
    const steps = getPieceSteps(board, 17, PLAYER_RED);
    assert.equal(steps.length, 0);
  });
});

test('King Movement', async (t) => {
  await t.test('Kings can move diagonally forward and backward in 4 directions', () => {
    const board = new Int8Array(32);
    board[17] = RED_KING; // row 4, col 3
    const steps = getPieceSteps(board, 17, PLAYER_RED);
    // 4 diagonal directions: (3,2)=13, (3,4)=14, (5,2)=21, (5,4)=22
    assert.equal(steps.length, 4);
    const dests = steps.map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(dests, [13, 14, 21, 22]);
  });

  await t.test('Kings respect board borders', () => {
    const board = new Int8Array(32);
    board[0] = BLACK_KING; // Top-left corner: (0,1)
    const steps = getPieceSteps(board, 0, PLAYER_BLACK);
    // Can only move down to row 1: (1,0)=4, (1,2)=5
    assert.equal(steps.length, 2);
    const dests = steps.map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(dests, [4, 5]);
  });
});

test('Mandatory Captures & Jump Mechanics', async (t) => {
  await t.test('Mandatory capture: regular moves are suppressed when a jump exists', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;   // row 4, col 3
    board[13] = BLACK_MAN; // row 3, col 2 (can be jumped to row 2, col 1 = idx 8)
    board[20] = RED_MAN;   // row 5, col 0 (has normal moves available)

    const legalMoves = getLegalMoves(board, PLAYER_RED);
    // All returned moves must be jumps!
    assert.ok(legalMoves.length > 0);
    for (const move of legalMoves) {
      assert.equal(move.isJump, true);
      assert.equal(move.from, 17);
      assert.equal(move.captured, 13);
      assert.equal(move.to, 8);
    }
  });

  await t.test('Player may choose any legal jump when multiple jumps are available', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;
    board[13] = BLACK_MAN; // jump to 8
    board[14] = BLACK_MAN; // jump to 10

    const legalMoves = getLegalMoves(board, PLAYER_RED);
    assert.equal(legalMoves.length, 2);
    const targets = legalMoves.map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(targets, [8, 10]);
  });

  await t.test('Men cannot jump backward', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;
    board[21] = BLACK_MAN; // behind Red man at row 5, col 2

    const jumps = getPieceJumps(board, 17, PLAYER_RED);
    assert.equal(jumps.length, 0);
  });

  await t.test('Kings can jump backward and forward', () => {
    const board = new Int8Array(32);
    board[17] = RED_KING;
    board[21] = BLACK_MAN; // behind at row 5, col 2 -> landing on row 6, col 1 = idx 24
    board[13] = BLACK_MAN; // forward at row 3, col 2 -> landing on row 2, col 1 = idx 8

    const jumps = getPieceJumps(board, 17, PLAYER_RED);
    assert.equal(jumps.length, 2);
    const dests = jumps.map(m => m.to).sort((a, b) => a - b);
    assert.deepEqual(dests, [8, 24]);
  });
});

test('Multi-Jump Sequences & Continuation', async (t) => {
  await t.test('applyMove signals canContinueJump when further jumps exist', () => {
    const board = new Int8Array(32);
    // Double jump setup for Red man:
    // Start at 22 (row 5, col 4)
    // Jump 1: over 18 (row 4, col 5) -> lands on 15 (row 3, col 6)
    // Jump 2: over 10 (row 2, col 5) -> lands on 6 (row 1, col 4)
    board[22] = RED_MAN;
    board[18] = BLACK_MAN;
    board[10] = BLACK_MAN;

    const firstMove = { from: 22, to: 15, isJump: true, captured: 18 };
    const { nextBoard, crowned, canContinueJump } = applyMove(board, firstMove);

    assert.equal(crowned, false);
    assert.equal(canContinueJump, true);
    assert.equal(nextBoard[22], EMPTY);
    assert.equal(nextBoard[18], EMPTY); // captured piece removed immediately
    assert.equal(nextBoard[15], RED_MAN);
    assert.equal(nextBoard[10], BLACK_MAN); // second opponent still in place

    // When constrained by requiredPieceIndex, only jumps from 15 are legal:
    const continuationMoves = getLegalMoves(nextBoard, PLAYER_RED, 15);
    assert.equal(continuationMoves.length, 1);
    assert.equal(continuationMoves[0].from, 15);
    assert.equal(continuationMoves[0].to, 6);
    assert.equal(continuationMoves[0].captured, 10);

    // Apply second jump
    const secondResult = applyMove(nextBoard, continuationMoves[0]);
    assert.equal(secondResult.canContinueJump, false);
    assert.equal(secondResult.nextBoard[15], EMPTY);
    assert.equal(secondResult.nextBoard[10], EMPTY);
    assert.equal(secondResult.nextBoard[6], RED_MAN);
  });
});

test('Crowning Rules & Immediate Turn Termination', async (t) => {
  await t.test('Red man reaching row 0 is crowned a King on simple move', () => {
    const board = new Int8Array(32);
    board[5] = RED_MAN; // row 1, col 2 -> can step to row 0, col 1 (idx 0)
    const move = { from: 5, to: 0, isJump: false, captured: null };
    const { nextBoard, crowned, canContinueJump } = applyMove(board, move);

    assert.equal(crowned, true);
    assert.equal(canContinueJump, false);
    assert.equal(nextBoard[0], RED_KING);
  });

  await t.test('Black man reaching row 7 is crowned a King on simple move', () => {
    const board = new Int8Array(32);
    board[25] = BLACK_MAN; // row 6, col 3 -> can step to row 7, col 2 (idx 29)
    const move = { from: 25, to: 29, isJump: false, captured: null };
    const { nextBoard, crowned, canContinueJump } = applyMove(board, move);

    assert.equal(crowned, true);
    assert.equal(canContinueJump, false);
    assert.equal(nextBoard[29], BLACK_KING);
  });

  await t.test('Crowning during a jump immediately halts turn even if backward jump exists', () => {
    // Standard English Draughts Rule:
    // A man reaching the kings row becomes a king and immediately stops.
    // Even if the new King has an immediate jump backwards, turn terminates.
    const board = new Int8Array(32);
    board[9] = RED_MAN;   // row 2, col 3
    board[5] = BLACK_MAN; // row 1, col 2 -> jumped to row 0, col 1 (idx 0)
    board[6] = BLACK_MAN; // row 1, col 4 -> which would be jumpable backwards from idx 0 to idx 11

    const crowningJump = { from: 9, to: 0, isJump: true, captured: 5 };
    const { nextBoard, crowned, canContinueJump } = applyMove(board, crowningJump);

    assert.equal(crowned, true);
    assert.equal(nextBoard[0], RED_KING);
    // Crucial check: canContinueJump MUST be false!
    assert.equal(canContinueJump, false, 'Turn must end immediately when crowned');
  });
});

test('In-Place Move Mutation and Backtracking for Minimax AI', async (t) => {
  await t.test('applyMoveInPlace and undoMoveInPlace accurately restore board state', () => {
    const board = new Int8Array(32);
    board[17] = RED_MAN;
    board[13] = BLACK_MAN;

    const initialCopy = cloneBoard(board);
    const move = { from: 17, to: 8, isJump: true, captured: 13 };

    const undoInfo = applyMoveInPlace(board, move);
    assert.equal(board[17], EMPTY);
    assert.equal(board[13], EMPTY);
    assert.equal(board[8], RED_MAN);

    undoMoveInPlace(board, move, undoInfo.prevPiece, undoInfo.capturedPiece);
    assert.deepEqual(board, initialCopy);
  });

  await t.test('applyMoveInPlace handles crowning and undo restores original man', () => {
    const board = new Int8Array(32);
    board[5] = RED_MAN;

    const initialCopy = cloneBoard(board);
    const move = { from: 5, to: 0, isJump: false, captured: null };

    const undoInfo = applyMoveInPlace(board, move);
    assert.equal(board[0], RED_KING);
    assert.equal(undoInfo.crowned, true);

    undoMoveInPlace(board, move, undoInfo.prevPiece, undoInfo.capturedPiece);
    assert.deepEqual(board, initialCopy);
    assert.equal(board[5], RED_MAN);
  });
});

test('Game Over & Victory Detection', async (t) => {
  await t.test('detects victory when opponent pieces are completely eliminated', () => {
    const board = new Int8Array(32);
    board[10] = RED_MAN;
    // Black has 0 pieces
    const winner = checkGameOver(board, PLAYER_BLACK);
    assert.equal(winner, PLAYER_RED);
  });

  await t.test('detects victory when current player has pieces but no legal moves (trapped)', () => {
    const board = new Int8Array(32);
    // Black man trapped in corner
    board[0] = BLACK_MAN; // at row 0, col 1
    // Red pieces blocking both diagonal steps (idx 4 and 5)
    board[4] = RED_MAN; // row 1, col 0
    board[5] = RED_MAN; // row 1, col 2
    // Place pieces behind to block jumps:
    board[9] = RED_MAN; // row 2, col 3 blocks jump over 5 (jump to (2,-1) is off board)

    const legalMoves = getLegalMoves(board, PLAYER_BLACK);
    assert.equal(legalMoves.length, 0);

    const winner = checkGameOver(board, PLAYER_BLACK);
    assert.equal(winner, PLAYER_RED, 'Red wins because Black is completely trapped');
  });

  await t.test('returns null when game is ongoing with valid moves available', () => {
    const state = createInitialState();
    const winner = checkGameOver(state.board, state.turn);
    assert.equal(winner, null);
  });
});
