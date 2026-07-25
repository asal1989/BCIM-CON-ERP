// src/utils/chromium-resolver.js
// Resolves a real Chromium executable path for Puppeteer.
//
// Railway builds this app via Nixpacks, not a standard Docker image with the
// full apt library set Puppeteer's bundled Chromium expects — launching the
// bundled binary there commonly fails with missing .so errors. nixpacks.toml
// adds the Nix "chromium" package (statically linked against everything it
// needs), which lands somewhere under /nix/store — a hash-based path we can't
// hardcode. Resolve it via `which` at runtime instead, and fall back to
// Puppeteer's own bundled Chromium (fine for local dev on Windows/Mac).
const { execSync } = require('child_process');

let cachedPath;
let resolved = false;

function resolveChromiumPath() {
  if (resolved) return cachedPath;
  resolved = true;
  for (const cmd of ['which chromium', 'which chromium-browser', 'which google-chrome-stable']) {
    try {
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (out) { cachedPath = out; return cachedPath; }
    } catch (_) { /* not found, try next */ }
  }
  cachedPath = null; // let Puppeteer use its own bundled Chromium
  return cachedPath;
}

module.exports = { resolveChromiumPath };
