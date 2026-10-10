/**
 * @file main.js
 * Application entry point for English Draughts.
 * Bootstraps renderer and controller upon DOM load.
 */

import { CheckersRenderer } from './renderer.js';
import { CheckersController } from './controller.js';

window.addEventListener('DOMContentLoaded', () => {
  const boardElement = document.getElementById('board');
  if (!boardElement) {
    console.error('Board element #board not found in DOM.');
    return;
  }

  const renderer = new CheckersRenderer(boardElement);
  const controller = new CheckersController(renderer);
  controller.init();

  // Expose controller globally for debugging or automated testing if needed
  window.__checkers = {
    renderer,
    controller
  };
});
