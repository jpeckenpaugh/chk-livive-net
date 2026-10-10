/**
 * @file prompts.js
 * Prompt generation for Session A (Tactical Move Selection) and Session B (Personality Banter).
 */

import {
  EMPTY,
  RED_MAN,
  RED_KING,
  BLACK_MAN,
  BLACK_KING,
  PLAYER_RED,
  isRed,
  isBlack,
  isKing,
  indexToNotation,
  indexToCoord
} from '../state.js';

/**
 * Formats a single move object into human/LLM-readable Draughts notation.
 * @param {Object} move
 * @returns {string}
 */
export function formatMoveDescription(move) {
  const fromNot = indexToNotation(move.from);
  const toNot = indexToNotation(move.to);

  if (move.isJump) {
    const capNot = move.captured !== null && move.captured !== undefined
      ? indexToNotation(move.captured)
      : '?';
    return `JUMP square ${fromNot} -> ${toNot} (captures square ${capNot})`;
  }
  return `MOVE square ${fromNot} -> ${toNot}`;
}

/**
 * Generates an ASCII / Draughts notation layout of the 8x8 checkers board.
 * @param {Int8Array} board
 * @returns {string}
 */
export function renderBoardToText(board) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    const rowSquares = [];
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        const index = r * 4 + Math.floor(c / 2);
        const piece = board[index];
        const notation = indexToNotation(index);
        let symbol = `.${notation}`;
        if (piece === RED_MAN) symbol = `r${notation}`;
        else if (piece === RED_KING) symbol = `R${notation}`;
        else if (piece === BLACK_MAN) symbol = `b${notation}`;
        else if (piece === BLACK_KING) symbol = `B${notation}`;
        rowSquares.push(symbol.padStart(4, ' '));
      } else {
        rowSquares.push(' ---');
      }
    }
    rows.push(`Row ${r}: ` + rowSquares.join(' '));
  }
  return rows.join('\n');
}

/**
 * Counts piece statistics on board.
 * @param {Int8Array} board
 * @returns {{ redMen: number, redKings: number, blackMen: number, blackKings: number }}
 */
export function countPieces(board) {
  let redMen = 0, redKings = 0, blackMen = 0, blackKings = 0;
  for (let i = 0; i < 32; i++) {
    const p = board[i];
    if (p === RED_MAN) redMen++;
    else if (p === RED_KING) redKings++;
    else if (p === BLACK_MAN) blackMen++;
    else if (p === BLACK_KING) blackKings++;
  }
  return { redMen, redKings, blackMen, blackKings };
}

/**
 * Builds the prompt messages for Session A: Tactical Move Selection.
 * @param {Object} options
 * @param {Int8Array} options.board
 * @param {number} options.turn - PLAYER_RED (1) or PLAYER_BLACK (-1)
 * @param {Array<Object>} options.legalMoves
 * @param {'wild'|'grandmaster'} [options.tacticalMode='wild']
 * @param {Array<{ move: Object, rating: string }>} [options.evaluatedCandidates=null]
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildTacticalPrompt({
  board,
  turn,
  legalMoves,
  tacticalMode = 'wild',
  evaluatedCandidates = null
}) {
  const isPlayerRed = turn === PLAYER_RED;
  const colorName = isPlayerRed ? 'RED' : 'BLACK';
  const direction = isPlayerRed ? 'UP towards row 0 (squares 1-4)' : 'DOWN towards row 7 (squares 29-32)';
  const counts = countPieces(board);

  const movesText = legalMoves.map((m, idx) => {
    let extra = '';
    if (tacticalMode === 'grandmaster' && evaluatedCandidates) {
      const match = evaluatedCandidates.find((c) => c.move.from === m.from && c.move.to === m.to);
      if (match) {
        extra = ` [Tactical Rating: ${match.rating}]`;
      }
    }
    return `[${idx}] ${formatMoveDescription(m)}${extra}`;
  }).join('\n');

  const systemContent = `You are an expert English Draughts (Checkers) tactical move selector.
Your objective is to pick the single best legal move from the provided enumerated list.
Rules:
1. English Draughts standard rules apply.
2. If any jumps exist, mandatory capture rule requires picking a jump move.
3. You MUST respond with ONLY a valid JSON object in this exact schema:
{"moveIndex": <integer>, "tacticalReason": "<short explanation under 15 words>"}
4. Do NOT output any preamble, commentary, or markdown formatting outside the JSON block.`;

  const userContent = `Current Match State:
You play as: ${colorName} (moving ${direction}).
Piece Counts:
- RED: ${counts.redMen} men, ${counts.redKings} kings (Total: ${counts.redMen + counts.redKings})
- BLACK: ${counts.blackMen} men, ${counts.blackKings} kings (Total: ${counts.blackMen + counts.blackKings})

Board Map (Draughts notation 1-32, lowercase=man, UPPERCASE=King):
${renderBoardToText(board)}

Legal Moves for your turn (total: ${legalMoves.length}):
${movesText}

Choose the best tactical move index (0 to ${legalMoves.length - 1}).
Respond with ONLY: {"moveIndex": <integer>, "tacticalReason": "..."}`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ];
}

/**
 * Builds corrective retry prompt for Session A if previous output was invalid.
 * @param {number} legalMovesCount
 * @param {string} errorDetails
 * @returns {{ role: string, content: string }}
 */
export function buildTacticalRetryPrompt(legalMovesCount, errorDetails) {
  return {
    role: 'user',
    content: `ERROR: ${errorDetails}
You must select a valid index from 0 to ${legalMovesCount - 1}.
Respond strictly with ONLY a JSON object:
{"moveIndex": <valid_integer_between_0_and_${legalMovesCount - 1}>, "tacticalReason": "..."}`
  };
}

/**
 * Builds messages for Session B: Personality Banter & Taunt Streamer.
 * @param {Object} options
 * @param {Object} options.persona
 * @param {Object} options.move - Move just executed
 * @param {Int8Array} options.board
 * @param {number} options.turn - Player who just moved
 * @param {boolean} options.crowned - Whether the piece became a King
 * @param {string|null} [options.opponentBanter=null]
 * @returns {Array<{ role: string, content: string }>}
 */
export function buildBanterPrompt({
  persona,
  move,
  board,
  turn,
  crowned = false,
  opponentBanter = null
}) {
  const isPlayerRed = turn === PLAYER_RED;
  const colorName = isPlayerRed ? 'Red' : 'Black';
  const moveDesc = formatMoveDescription(move);
  const counts = countPieces(board);

  let eventHighlight = '';
  if (move.isJump) {
    eventHighlight = 'You just CAPTURED an opposing piece!';
  }
  if (crowned) {
    eventHighlight += ' You just reached the back rank and were CROWNED KING!';
  }

  let dialogHistory = '';
  if (opponentBanter) {
    dialogHistory = `Opponent recently said: "${opponentBanter}"\n`;
  }

  const prompt = `You are playing ${colorName}.
Action just taken: ${moveDesc}.
${eventHighlight}
Current Board: Red has ${counts.redMen + counts.redKings} pieces, Black has ${counts.blackMen + counts.blackKings} pieces.
${dialogHistory}
Give a 1-sentence in-character taunt, celebration, or reaction to this move.
Keep it strictly under 25 words. Speak directly to your opponent.`;

  return [
    { role: 'system', content: persona.systemPrompt },
    { role: 'user', content: prompt }
  ];
}
