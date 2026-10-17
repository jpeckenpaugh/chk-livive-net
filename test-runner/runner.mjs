import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const rootDir = process.env.WORKSPACE_DIR || "/game";
const artifactsDir = process.env.ARTIFACTS_DIR || "/artifacts";
const galleryDir = path.join(artifactsDir, "gallery");

fs.mkdirSync(galleryDir, { recursive: true });

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  const relPath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.join(rootDir, relPath);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(4173, "127.0.0.1", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: artifactsDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  const startTime = Date.now();

  try {
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await page.waitForSelector("#screen-title", { timeout: 10000 });
    await sleep(1600);
    await page.screenshot({ path: path.join(galleryDir, "01-title-minimax-setup.png") });

    // Show AI vs AI Arena matchup card
    await page.click("#title-card-arena");
    await sleep(1800);
    await page.screenshot({ path: path.join(galleryDir, "02-arena-matchup-setup.png") });

    // Launch Player vs Minimax match
    await page.click("#title-card-minimax");
    await sleep(600);
    await page.click("#btn-launch-match");
    await sleep(1600);

    // Toggle 1-32 square notation
    await page.click("#btn-notation").catch(() => {});
    await sleep(1400);
    await page.screenshot({ path: path.join(galleryDir, "03-board-and-opening.png") });

    // Play 3 human Red moves against Minimax
    for (let turn = 0; turn < 3; turn++) {
      await page.evaluate(() => {
        const redPieces = Array.from(document.querySelectorAll(".piece.red, .checker.red, [data-piece='red'], .square .red"));
        const candidates = redPieces.length
          ? redPieces
          : Array.from(document.querySelectorAll("#board .square, .board .square, .square")).filter((el) =>
              el.innerHTML.includes("red") || el.className.includes("red")
            );
        for (const el of candidates) {
          el.click();
          const valid = document.querySelector(".valid-move, .legal-move, .highlight, .move-hint, .square.valid");
          if (valid) break;
        }
      });
      await sleep(800);
      await page.evaluate(() => {
        const target = document.querySelector(".valid-move, .legal-move, .highlight, .move-hint, .square.valid");
        if (target) target.click();
      });
      await sleep(2200);
    }

    await page.screenshot({ path: path.join(galleryDir, "04-midgame-minimax-battle.png") });

    // Open WebGPU LLM Hardware & Model Manager
    await page.click("#btn-open-llm-dashboard").catch(() => {});
    await sleep(1800);
    await page.screenshot({ path: path.join(galleryDir, "05-webgpu-llm-manager.png") });
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      const closeBtn = document.querySelector("#btn-close-llm-dashboard, .modal-close, .close-btn");
      if (closeBtn) closeBtn.click();
    });
    await sleep(900);

    // Open Debug Inspector or Arena Matchup setup
    await page.click("#btn-debug-inspector").catch(() => {});
    await sleep(1800);
    await page.screenshot({ path: path.join(galleryDir, "06-ai-arena-spectator.png") });
    await page.keyboard.press("Escape").catch(() => {});

    const elapsed = Date.now() - startTime;
    if (elapsed < 30500) {
      await sleep(30500 - elapsed);
    }
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();
    server.close();
    if (video) {
      const vPath = await video.path();
      const dest = path.join(artifactsDir, "demo.webm");
      fs.copyFileSync(vPath, dest);
      if (vPath !== dest) fs.unlinkSync(vPath);
    }
  }
});
