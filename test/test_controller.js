/**
 * @file test_controller.js
 * Unit tests for CheckersController selection, mandatory jumps,
 * multi-jump locks, turn switching, and reset flow.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CheckersController } from '../src/controller.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  RED_MAN,
  BLACK_MAN,
  RED_KING,
  BLACK_KING,
  EMPTY
} from '../src/state.js';

/**
 * Creates a mock renderer for testing the controller in Node.js without browser DOM.
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
    render(args) {
      this.lastRenderArgs = args;
    },
    setBoardFlipped() {},
    setShowNotation() {},
    setMuted() {}
  };
}

test('Controller - Initialization & Initial Legal Selections', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  assert.equal(controller.state.turn, PLAYER_RED);
  assert.equal(controller.state.selectedSquare, null);
  assert.equal(controller.state.winner, null);

  // Initial position: Red has 7 opening moves from squares 20, 21, 22, 23
  const selectable = mockRenderer.lastRenderArgs.selectableIndices;
  assert.ok(selectable.has(20));
  assert.ok(selectable.has(21));
  assert.ok(selectable.has(22));
  assert.ok(selectable.has(23));
  // Back rank pieces should not be selectable
  assert.ok(!selectable.has(28));
  assert.ok(!selectable.has(29));
});

test('Controller - Selection and Move Execution', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // Click square 21 (Red piece) to select
  controller.handleSquareClick(21);
  assert.equal(controller.state.selectedSquare, 21);
  assert.ok(mockRenderer.lastRenderArgs.legalMovesForSelected.length > 0);

  // Click destination square 17 (valid step)
  controller.handleSquareClick(17);

  // Move should have executed, square 21 is now EMPTY, square 17 is RED_MAN
  assert.equal(controller.state.board[21], EMPTY);
  assert.equal(controller.state.board[17], RED_MAN);
  assert.equal(controller.state.selectedSquare, null);
  // Turn passes to Black
  assert.equal(controller.state.turn, PLAYER_BLACK);
  assert.deepEqual(controller.lastMove, { from: 21, to: 17 });
});

test('Controller - Deselection on Click Again', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // Select square 22
  controller.handleSquareClick(22);
  assert.equal(controller.state.selectedSquare, 22);

  // Click square 22 again -> deselects
  controller.handleSquareClick(22);
  assert.equal(controller.state.selectedSquare, null);
});

test('Controller - Mandatory Capture Restriction', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  // Set up board where Red piece at 18 must jump Black piece at 14 to square 9
  // Red also has another piece at 23 which has normal step moves
  controller.state.board.fill(EMPTY);
  controller.state.board[18] = RED_MAN;
  controller.state.board[14] = BLACK_MAN;
  controller.state.board[23] = RED_MAN;
  controller.state.turn = PLAYER_RED;
  controller.updateView();

  // Trying to click piece at 23 (which cannot jump) should fail to select
  controller.handleSquareClick(23);
  assert.equal(controller.state.selectedSquare, null);
  assert.match(controller.statusMessage, /Mandatory capture/i);

  // Clicking piece at 18 should succeed
  controller.handleSquareClick(18);
  assert.equal(controller.state.selectedSquare, 18);

  // Executing jump to square 9
  controller.handleSquareClick(9);
  assert.equal(controller.state.board[18], EMPTY);
  assert.equal(controller.state.board[14], EMPTY); // Captured
  assert.equal(controller.state.board[9], RED_MAN);
});

test('Controller - Multi-Jump Lock Flow', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  // Double jump setup:
  // Red piece at 27 jumps over Black at 23 to 18, then jumps over Black at 14 to 9.
  controller.state.board.fill(EMPTY);
  controller.state.board[27] = RED_MAN;
  controller.state.board[23] = BLACK_MAN;
  controller.state.board[14] = BLACK_MAN;
  controller.state.turn = PLAYER_RED;
  controller.updateView();

  // First jump: 27 -> 18
  controller.handleSquareClick(27);
  controller.handleSquareClick(18);

  // In multi-jump continuation:
  assert.equal(controller.state.mustContinueJumpFrom, 18);
  assert.equal(controller.state.selectedSquare, 18);
  assert.equal(controller.state.turn, PLAYER_RED); // Turn must NOT switch yet

  // Attempting to click another square should be rejected
  controller.handleSquareClick(27);
  assert.equal(controller.state.mustContinueJumpFrom, 18);

  // Complete second jump: 18 -> 9
  controller.handleSquareClick(9);
  assert.equal(controller.state.board[9], RED_MAN);
  assert.equal(controller.state.board[14], EMPTY);
  assert.equal(controller.state.mustContinueJumpFrom, null);
  assert.equal(controller.state.selectedSquare, null);
  assert.equal(controller.state.turn, PLAYER_BLACK); // Now turn switches to Black
});

test('Controller - Reset Game', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // Make a move
  controller.handleSquareClick(21);
  controller.handleSquareClick(17);
  assert.equal(controller.state.turn, PLAYER_BLACK);

  // Reset game
  controller.resetGame();
  assert.equal(controller.state.turn, PLAYER_RED);
  assert.equal(controller.state.board[21], RED_MAN);
  assert.equal(controller.state.board[17], EMPTY);
  assert.equal(controller.lastMove, null);
});

test('Controller - AI Mode & Difficulty Configuration', (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);

  // Initial mode is minimax (or legacy ai)
  assert.ok(controller.gameMode === 'minimax' || controller.gameMode === 'ai');
  assert.equal(controller.playerTypes[PLAYER_RED], 'human');
  assert.equal(controller.playerTypes[PLAYER_BLACK], 'ai');
  assert.equal(controller.difficulty, 'medium');

  // Change difficulty
  controller.setDifficulty('hard');
  assert.equal(controller.difficulty, 'hard');
  assert.equal(controller.aiAgent.difficulty, 'hard');

  // Switch to LLM mode
  controller.setGameMode('llm');
  assert.equal(controller.gameMode, 'llm');
  assert.equal(controller.players[PLAYER_BLACK].type, 'llm');

  // Switch to Pass & Play
  controller.setGameMode('pvp');
  assert.equal(controller.gameMode, 'pvp');
  assert.equal(controller.playerTypes[PLAYER_RED], 'human');
  assert.equal(controller.playerTypes[PLAYER_BLACK], 'human');

  // Switch back to Minimax mode
  controller.setGameMode('minimax');
  assert.equal(controller.gameMode, 'minimax');
  assert.equal(controller.playerTypes[PLAYER_BLACK], 'ai');

  // Legacy 'ai' mode alias
  controller.setGameMode('ai');
  assert.ok(controller.gameMode === 'ai' || controller.gameMode === 'minimax');
  assert.equal(controller.playerTypes[PLAYER_BLACK], 'ai');
});

test('Controller - AI Auto Move Scheduling and Execution', async (t) => {
  const mockRenderer = createMockRenderer();
  const controller = new CheckersController(mockRenderer);
  controller.init();

  // Red makes first opening move: 21 -> 17
  controller.handleSquareClick(21);
  controller.handleSquareClick(17);

  assert.equal(controller.state.turn, PLAYER_BLACK);
  assert.match(controller.statusMessage, /AI is thinking/i);
  assert.ok(controller.aiTimeoutId !== null, 'AI move should be scheduled with a timeout');

  // Wait for AI to execute move (300ms delay + small margin)
  await new Promise((resolve) => setTimeout(resolve, 380));

  // AI (Black) should have completed its move and passed turn back to Red
  assert.equal(controller.state.turn, PLAYER_RED);
  assert.ok(controller.lastMove !== null);
  // One of Black's row 2 pieces (8, 9, 10, 11) should have moved
  assert.ok([8, 9, 10, 11].includes(controller.lastMove.from));
});
