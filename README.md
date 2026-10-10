# Browser-Based Checkers (English Draughts)

A minimalist, zero-dependency, client-side implementation of English Draughts (Checkers) designed for modern web browsers.

## Features
- **Zero External Dependencies**: Pure vanilla JavaScript (ES Modules), HTML5, and CSS Grid.
- **Offline & Static**: Runs purely client-side; hostable on GitHub Pages, Cloudflare Pages, S3, or locally.
- **Full Rules Engine**: Standard English Draughts rules including mandatory captures, multi-jump sequences, and king promotions.
- **Single-Player AI**: Minimax search with Alpha-Beta pruning for responsive offline play.
- **Pass-and-Play**: Local two-player support.

## Project Structure
```text
.
├── index.html          # Board markup and module entry
├── styles.css          # CSS Grid board and animations
├── README.md
└── src/
    ├── main.js         # Entry bootstrap
    ├── state.js        # State representation & initialization
    ├── rules.js        # Pure rules engine & legal move generation
    ├── ai.js           # Minimax AI with Alpha-Beta pruning
    ├── renderer.js     # DOM rendering & UI highlight management
    └── controller.js   # Game orchestration & turn loop
```

## Running Locally
Simply open `index.html` in any modern web browser or serve via a static local server:
```bash
python3 -m http.server 8000
# or
npx serve
```
