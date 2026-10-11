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

export const DEFAULT_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export const STORAGE_KEY_PREFERRED_MODEL = 'godot_checkers_preferred_model';

/**
 * Returns metadata for a model ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getModelInfo(id) {
  return SUPPORTED_MODELS.find((m) => m.id === id) || null;
}

/**
 * Gets the preferred model ID from localStorage, falling back to DEFAULT_MODEL_ID.
 * @returns {string}
 */
export function getPreferredModelId() {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREFERRED_MODEL);
      if (saved && SUPPORTED_MODELS.some((m) => m.id === saved)) {
        return saved;
      }
    } catch (e) {
      // localStorage may be inaccessible in certain sandbox / privacy modes
    }
  }
  return DEFAULT_MODEL_ID;
}

/**
 * Saves the preferred model ID to localStorage.
 * @param {string} modelId
 */
export function setPreferredModelId(modelId) {
  if (typeof localStorage !== 'undefined') {
    try {
      if (SUPPORTED_MODELS.some((m) => m.id === modelId)) {
        localStorage.setItem(STORAGE_KEY_PREFERRED_MODEL, modelId);
      }
    } catch (e) {
      // localStorage may be inaccessible
    }
  }
}
