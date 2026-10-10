/**
 * @file model_registry.js
 * Registry of tested WebLLM model identifiers, sizes, and metadata.
 */

export const SUPPORTED_MODELS = [
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M (Ultra Fast)',
    vram: '~380 MB',
    size: '190 MB download',
    recommended: false,
    description: 'Fastest initialization, ideal for mobile or low-spec devices.'
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B (Balanced)',
    vram: '~1.1 GB',
    size: '950 MB download',
    recommended: true,
    description: 'Great tactical move reasoning and sharp, lively banter.'
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B (Fast)',
    vram: '~900 MB',
    size: '880 MB download',
    recommended: false,
    description: 'Strong general reasoning with quick token generation.'
  },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 3B (Grandmaster)',
    vram: '~2.2 GB',
    size: '1.9 GB download',
    recommended: false,
    description: 'Highest quality move selection and rich theatrical banter.'
  }
];

export const DEFAULT_MODEL_ID = 'SmolLM2-1.7B-Instruct-q4f16_1-MLC';

/**
 * Returns metadata for a model ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getModelInfo(id) {
  return SUPPORTED_MODELS.find((m) => m.id === id) || null;
}
