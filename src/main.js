/**
 * @file main.js
 * Application entry point for English Draughts.
 * Bootstraps renderer, controller, LLM dashboard, and debug inspector upon DOM load.
 */

import { CheckersRenderer } from './renderer.js';
import { CheckersController } from './controller.js';
import { LLMDashboard } from './llm/dashboard.js';
import { debugInspector } from './llm/debug_inspector.js';

window.addEventListener('DOMContentLoaded', () => {
  const boardElement = document.getElementById('board');
  if (!boardElement) {
    console.error('Board element #board not found in DOM.');
    return;
  }

  const renderer = new CheckersRenderer(boardElement);
  const controller = new CheckersController(renderer);
  controller.init();

  const dashboard = new LLMDashboard();
  dashboard.init();

  debugInspector.init();

  // Expose components globally for debugging or automated testing
  window.__checkers = {
    renderer,
    controller,
    dashboard,
    debugInspector
  };
});
