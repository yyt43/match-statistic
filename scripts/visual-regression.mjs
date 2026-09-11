import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const baselinePath = join(root, 'visual-baselines', 'help-page.png');
const currentPath = join(root, 'test-results', 'visual', 'help-page-current.png');
const diffPath = join(root, 'test-results', 'visual', 'help-page-diff.png');
const appPort = 4176;
const appUrl = `http://127.0.0.1:${appPort}/`;
const browserPath = findBrowser();

if (!browserPath) {
  console.log('Visual regression skipped: set BROWSER_PATH to Chrome or Edge.');
  process.exit(0);
}

mkdirSync(join(root, 'visual-baselines'), { recursive: true });
mkdirSync(join(root, 'test-results', 'visual'), { recursive: true });
const server = spawn(process.execPath, [
  join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  '--host',
  '127.0.0.1',
  '--port',
  String(appPort),
  '--strictPort',
], {
  cwd: root,
  stdio: 'ignore',
});

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  await waitFor(() => fetch(appUrl, { signal: AbortSignal.timeout(1000) }), 15000);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByTitle('帮助与说明').click();
  await page.getByText('功能概览').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: currentPath, fullPage: false });

  if (process.argv.includes('--update') || !existsSync(baselinePath)) {
    copyFileSync(currentPath, baselinePath);
    console.log('Visual baseline updated:', baselinePath);
  } else {
    const baseline = PNG.sync.read(readFileSync(baselinePath));
    const current = PNG.sync.read(readFileSync(currentPath));
    if (baseline.width !== current.width || baseline.height !== current.height) {
      throw new Error(`Visual size mismatch: ${baseline.width}x${baseline.height} vs ${current.width}x${current.height}`);
    }

    const diff = new PNG({ width: current.width, height: current.height });
    const diffPixels = pixelmatch(
      baseline.data,
      current.data,
      diff.data,
      current.width,
      current.height,
      { threshold: 0.1, includeAA: false }
    );
    const diffRatio = diffPixels / (current.width * current.height);
    writeFileSync(diffPath, PNG.sync.write(diff));

    if (diffRatio > 0.03) {
      throw new Error(`Visual regression detected: ${(diffRatio * 100).toFixed(2)}% pixels changed.`);
    }
    console.log(`Visual regression passed: ${(diffRatio * 100).toFixed(2)}% pixels changed.`);
  }
} finally {
  await browser.close();
  server.kill();
  await waitForExit(server);
}

function findBrowser() {
  if (process.env.BROWSER_PATH && existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
      ];
  return candidates.find(existsSync);
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch {
      // Retry while the dev server starts.
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
}
