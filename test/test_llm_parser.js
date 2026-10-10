/**
 * @file test_llm_parser.js
 * Unit tests for LLM output parsing, regex extraction, corrective retry loop, and fallback.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMoveIndex, executeMoveSelectionWithRetries } from '../src/llm/parser.js';

test('LLM Parser - Clean JSON Extraction', (t) => {
  const raw = '{"moveIndex": 2, "tacticalReason": "Securing key center diagonal"}';
  const result = parseMoveIndex(raw, 5);

  assert.equal(result.success, true);
  assert.equal(result.index, 2);
  assert.equal(result.reasoning, 'Securing key center diagonal');
});

test('LLM Parser - Markdown Fenced JSON Code Blocks', (t) => {
  const raw = 'Based on the board state, here is my move:\n```json\n{\n  "moveIndex": 0,\n  "tacticalReason": "Mandatory jump"\n}\n```\nHope this helps.';
  const result = parseMoveIndex(raw, 4);

  assert.equal(result.success, true);
  assert.equal(result.index, 0);
  assert.equal(result.reasoning, 'Mandatory jump');
});

test('LLM Parser - Regex Key-Value Fallbacks', (t) => {
  const testCases = [
    { input: 'I select "moveIndex": 3 because it jumps.', expected: 3 },
    { input: 'moveIndex: 1 is the best move here.', expected: 1 },
    { input: 'Move: [2] is recommended.', expected: 2 },
    { input: '   4   ', expected: 4 }
  ];

  for (const tc of testCases) {
    const res = parseMoveIndex(tc.input, 6);
    assert.equal(res.success, true, `Failed on: ${tc.input}`);
    assert.equal(res.index, tc.expected, `Wrong index on: ${tc.input}`);
  }
});

test('LLM Parser - Out of Bounds and Invalid Responses', (t) => {
  // Index out of bounds
  const outOfBounds = parseMoveIndex('{"moveIndex": 10}', 4);
  assert.equal(outOfBounds.success, false);
  assert.match(outOfBounds.error, /out of bounds/i);

  // Negative index
  const negative = parseMoveIndex('{"moveIndex": -1}', 4);
  assert.equal(negative.success, false);

  // Pure hallucinations without numbers
  const noNumbers = parseMoveIndex('I think red should advance boldly!', 4);
  assert.equal(noNumbers.success, false);
  assert.match(noNumbers.error, /Could not extract a valid move index/i);
});

test('LLM Parser - Retry Recovery Loop', async (t) => {
  const legalMoves = [
    { from: 21, to: 17 },
    { from: 22, to: 18 }
  ];

  let queryAttempts = 0;
  // Simulates model failing on attempt 1 with bad response, then succeeding on attempt 2
  const queryFn = async (messages) => {
    queryAttempts++;
    if (queryAttempts === 1) {
      return 'I would like to move my king piece!';
    }
    // Attempt 2 after retry prompt
    return '{"moveIndex": 1, "tacticalReason": "Corrected"}';
  };

  const initialMessages = [{ role: 'system', content: 'test' }];
  const result = await executeMoveSelectionWithRetries({
    queryFn,
    initialMessages,
    legalMoves,
    maxRetries: 2
  });

  assert.equal(result.isFallback, false);
  assert.deepEqual(result.move, legalMoves[1]);
  assert.equal(result.attempts, 2);
});

test('LLM Parser - Graceful Fallback on Exhausted Retries', async (t) => {
  const legalMoves = [
    { from: 21, to: 17 },
    { from: 22, to: 18 }
  ];

  // Simulates persistent failure
  const queryFn = async () => 'Totally gibberish text without numbers';

  const fallbackMove = { from: 22, to: 18, isFallbackMinimax: true };
  const fallbackFn = () => fallbackMove;

  const result = await executeMoveSelectionWithRetries({
    queryFn,
    initialMessages: [{ role: 'system', content: 'test' }],
    legalMoves,
    maxRetries: 1,
    fallbackFn
  });

  assert.equal(result.isFallback, true);
  assert.deepEqual(result.move, fallbackMove);
  assert.match(result.reasoning, /Fallback heuristic engaged/i);
});
