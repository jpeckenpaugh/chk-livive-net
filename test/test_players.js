/**
 * @file test_players.js
 * Unit tests verifying BasePlayer contracts, HumanPlayer, MinimaxPlayer,
 * and LLMPlayer lifecycle and decision execution.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { HumanPlayer } from '../src/players/human_player.js';
import { MinimaxPlayer } from '../src/players/minimax_player.js';
import { LLMPlayer } from '../src/players/llm_player.js';
import { WebLLMService } from '../src/llm/web_llm_service.js';
import {
  PLAYER_RED,
  PLAYER_BLACK,
  createInitialBoard,
  createInitialState
} from '../src/state.js';
import { getLegalMoves } from '../src/rules.js';

test('Player Architecture - HumanPlayer Lifecycle', async (t) => {
  const human = new HumanPlayer({ id: 'human-1', name: 'Test Human', color: PLAYER_RED });

  assert.equal(human.id, 'human-1');
  assert.equal(human.name, 'Test Human');
  assert.equal(human.color, PLAYER_RED);
  assert.equal(human.type, 'human');
  assert.equal(human.isInteractive, true);

  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_RED);

  // Request move asynchronously
  const movePromise = human.requestMove({
    board,
    turn: PLAYER_RED,
    mustContinueJumpFrom: null,
    legalMoves
  });

  // Submit valid move
  human.submitMove(legalMoves[0]);

  const result = await movePromise;
  assert.deepEqual(result.move, legalMoves[0]);
});

test('Player Architecture - HumanPlayer Abort Signal', async (t) => {
  const human = new HumanPlayer({ id: 'human-2', name: 'Test Human', color: PLAYER_RED });
  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_RED);

  const abortController = new AbortController();
  const movePromise = human.requestMove({
    board,
    turn: PLAYER_RED,
    mustContinueJumpFrom: null,
    legalMoves,
    signal: abortController.signal
  });

  abortController.abort();

  await assert.rejects(movePromise, /aborted/i);
});

test('Player Architecture - MinimaxPlayer Move Generation & Difficulty', async (t) => {
  const minimax = new MinimaxPlayer({
    id: 'ai-1',
    name: 'Bot Minimax',
    color: PLAYER_BLACK,
    difficulty: 'easy'
  });

  assert.equal(minimax.type, 'minimax');
  assert.equal(minimax.isInteractive, false);
  assert.equal(minimax.difficulty, 'easy');

  minimax.setDifficulty('hard');
  assert.equal(minimax.difficulty, 'hard');

  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_BLACK);

  const result = await minimax.requestMove({
    board,
    turn: PLAYER_BLACK,
    mustContinueJumpFrom: null,
    legalMoves
  });

  assert.ok(result.move);
  assert.equal(result.meta.difficulty, 'hard');
  assert.ok(legalMoves.some((m) => m.from === result.move.from && m.to === result.move.to));
});

test('Player Architecture - LLMPlayer with Mock WebLLM Engine', async (t) => {
  const mockService = new WebLLMService();

  // Mock engine that produces valid tactical JSON and streaming banter
  const mockEngine = {
    chat: {
      completions: {
        create: async (params) => {
          if (params.stream) {
            // Streaming banter simulation
            return (async function* () {
              const tokens = ['Shiver ', 'me ', 'timbers, ', 'take ', 'that!'];
              for (const tok of tokens) {
                yield { choices: [{ delta: { content: tok } }] };
              }
            })();
          }
          // Tactical move selection: Pick move index 1
          return {
            choices: [{
              message: { content: '```json\n{"moveIndex": 1, "tacticalReason": "Flank advancement"}\n```' }
            }]
          };
        }
      }
    }
  };

  mockService.setCustomEngine(mockEngine);

  const llmPlayer = new LLMPlayer({
    id: 'llm-pirate',
    color: PLAYER_RED,
    personaId: 'pirate',
    service: mockService,
    tacticalMode: 'wild'
  });

  assert.equal(llmPlayer.type, 'llm');
  assert.equal(llmPlayer.isInteractive, false);
  assert.match(llmPlayer.name, /Captain Redbeard/i);

  const board = createInitialBoard();
  const legalMoves = getLegalMoves(board, PLAYER_RED);

  // Request move
  const result = await llmPlayer.requestMove({
    board,
    turn: PLAYER_RED,
    mustContinueJumpFrom: null,
    legalMoves
  });

  assert.deepEqual(result.move, legalMoves[1]);
  assert.equal(result.isFallback, false);
  assert.equal(result.reasoning, 'Flank advancement');

  // Test streaming banter
  let streamed = '';
  const banter = await llmPlayer.streamBanter({
    move: result.move,
    board,
    turn: PLAYER_RED,
    onToken: (tok) => { streamed += tok; }
  });

  assert.equal(banter, 'Shiver me timbers, take that!');
  assert.equal(streamed, 'Shiver me timbers, take that!');
});

test('Player Architecture - LLMPlayer Forced Move Optimization', async (t) => {
  const mockService = new WebLLMService();
  let queryCount = 0;
  mockService.setCustomEngine({
    chat: {
      completions: {
        create: async () => {
          queryCount++;
          return { choices: [{ message: { content: '{"moveIndex": 0}' } }] };
        }
      }
    }
  });

  const llmPlayer = new LLMPlayer({
    id: 'llm-forced',
    color: PLAYER_RED,
    personaId: 'coach',
    service: mockService
  });

  const singleMove = [{ from: 21, to: 17, isJump: false, captured: null }];
  const result = await llmPlayer.requestMove({
    board: createInitialBoard(),
    turn: PLAYER_RED,
    mustContinueJumpFrom: null,
    legalMoves: singleMove
  });

  assert.deepEqual(result.move, singleMove[0]);
  assert.equal(queryCount, 0, 'Should bypass LLM query for single forced move');
});
