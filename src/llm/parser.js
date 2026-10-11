/**
 * @file parser.js
 * Robust JSON & regex extraction, corrective retry loop, and heuristic fallback for LLM moves.
 */

import { buildTacticalRetryPrompt } from './prompts.js';

/**
 * Parses a move index from LLM text output.
 * @param {string} rawText
 * @param {number} legalMovesCount
 * @returns {{ success: boolean, index?: number, reasoning?: string, error?: string }}
 */
export function parseMoveIndex(rawText, legalMovesCount) {
  if (!rawText || typeof rawText !== 'string') {
    return { success: false, error: 'Empty or non-string model response.' };
  }

  const trimmed = rawText.trim();

  // Attempt 1: Direct JSON parsing or extraction from markdown ```json ``` blocks
  const jsonMatch = trimmed.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const candidateIndex = parsed.moveIndex !== undefined ? parsed.moveIndex : parsed.index;
      const num = parseInt(candidateIndex, 10);
      if (!Number.isNaN(num)) {
        if (num >= 0 && num < legalMovesCount) {
          return {
            success: true,
            index: num,
            reasoning: parsed.tacticalReason || parsed.reasoning || ''
          };
        }
        return {
          success: false,
          error: `Index ${num} is out of bounds (allowed range: 0 to ${legalMovesCount - 1}).`
        };
      }
    } catch (e) {
      // Continue to regex fallbacks
    }
  }

  // Attempt 2: Targeted regex patterns for key-value formats
  const regexPatterns = [
    /"moveIndex"\s*:\s*(\d+)/i,
    /moveIndex\s*[:=]\s*(\d+)/i,
    /"index"\s*:\s*(\d+)/i,
    /index\s*[:=]\s*(\d+)/i,
    /\bmove\s*[:#]?\s*(\d+)\b/i,
    /\[(\d+)\]/
  ];

  for (const pattern of regexPatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num)) {
        if (num >= 0 && num < legalMovesCount) {
          return {
            success: true,
            index: num,
            reasoning: 'Extracted via fallback pattern'
          };
        }
        return {
          success: false,
          error: `Extracted index ${num} is out of bounds (allowed range: 0 to ${legalMovesCount - 1}).`
        };
      }
    }
  }

  // Attempt 3: Isolated single integer response
  const isolatedNumber = trimmed.match(/^\s*(\d+)\s*$/);
  if (isolatedNumber) {
    const num = parseInt(isolatedNumber[1], 10);
    if (num >= 0 && num < legalMovesCount) {
      return { success: true, index: num, reasoning: 'Direct integer response' };
    }
    return {
      success: false,
      error: `Number ${num} is out of bounds (allowed range: 0 to ${legalMovesCount - 1}).`
    };
  }

  return {
    success: false,
    error: `Could not extract a valid move index between 0 and ${legalMovesCount - 1} from response.`
  };
}

/**
 * Executes tactical move selection with up to maxRetries attempts before invoking fallback.
 * @param {Object} options
 * @param {Function} options.queryFn - Async function (messages) => Promise<string>
 * @param {Array<Object>} options.initialMessages - Chat prompt messages
 * @param {Array<Object>} options.legalMoves - Enumerated legal moves
 * @param {number} [options.maxRetries=2] - Max corrective retries
 * @param {Function} [options.fallbackFn] - Function returning fallback move
 * @returns {Promise<{ move: Object, reasoning: string, isFallback: boolean, attempts: number }>}
 */
export async function executeMoveSelectionWithRetries({
  queryFn,
  initialMessages,
  legalMoves,
  maxRetries = 2,
  fallbackFn = null
}) {
  const messages = initialMessages.slice();
  let attempts = 0;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const responseText = await queryFn(messages);
      const parsed = parseMoveIndex(responseText, legalMoves.length);

      if (parsed.success) {
        return {
          move: legalMoves[parsed.index],
          reasoning: parsed.reasoning,
          isFallback: false,
          attempts
        };
      }

      // If failed and retries remain, append corrective retry prompt
      if (attempts <= maxRetries) {
        messages.push({ role: 'assistant', content: responseText });
        messages.push(buildTacticalRetryPrompt(legalMoves.length, parsed.error));
      }
    } catch (err) {
      if (err && err.message && (err.message.includes('aborted') || err.message.includes('timed out'))) {
        break;
      }
      if (attempts > maxRetries) break;
      // On network / format error during retry, allow loop or break
    }
  }

  // Fallback if all attempts failed
  const fallbackMove = (fallbackFn && typeof fallbackFn === 'function')
    ? fallbackFn()
    : legalMoves[0];

  return {
    move: fallbackMove || legalMoves[0],
    reasoning: 'Fallback heuristic engaged after LLM move selection error.',
    isFallback: true,
    attempts
  };
}
