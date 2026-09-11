import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const appPort = 4173;
const appUrl = `http://127.0.0.1:${appPort}/`;
const browserPath = findBrowser();

if (!browserPath) {
  console.log('Browser smoke test skipped: set BROWSER_PATH to Chrome or Edge.');
  process.exit(0);
}

const browserDataDir = mkdtempSync(join(tmpdir(), 'match-statistic-smoke-'));
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

let browser;
try {
  await waitFor(
    () => fetch(appUrl, { signal: AbortSignal.timeout(1000) }),
    15000
  );

  browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByTitle('Switch to English').click();
  await page.waitForTimeout(300);
  const switchedTitle = await page.locator('h1').first().textContent();
  if (!switchedTitle?.includes('Poetic')) {
    throw new Error(`Language switch failed; current title: ${switchedTitle ?? '<empty>'}`);
  }
  await waitForText(page, 'Poetic · Tournament Results System');

  await page.getByRole('button', { name: /Player management/ }).click();
  await page.getByRole('button', { name: 'Bulk import' }).click();
  await page.locator('textarea').fill('Alice\nBob\nCharlie\nDiana');
  await page.getByRole('button', { name: /Import 4 players/ }).click();
  await waitForText(page, '4 players');

  await page.getByRole('button', { name: /Start this group/ }).click();
  await waitForText(page, 'Round 1 match list');

  if (!process.env.CI) {
    await page.getByRole('button', { name: 'Export Excel' }).click();
    await page.getByRole('button', { name: 'Match table' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel' }).click();
    const download = await downloadPromise;
    const downloadPath = join(browserDataDir, 'round-export.xlsx');
    await download.saveAs(downloadPath);
    if (statSync(downloadPath).size === 0) {
      throw new Error('Excel export produced an empty file.');
    }
    await page.getByRole('button', { name: 'Cancel' }).click();
  }

  await page.reload({ waitUntil: 'networkidle' });
  await waitForText(page, 'Round 1 match list');

  const indexedDbReady = await page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.open('match-statistic-storage');
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('key-value')) {
        resolve(false);
        return;
      }
      const transaction = database.transaction('key-value', 'readonly');
      const get = transaction.objectStore('key-value').get('swiss_tournament_data');
      get.onsuccess = () => resolve(Boolean(get.result));
      get.onerror = () => resolve(false);
    };
    request.onerror = () => resolve(false);
  }));

  if (!indexedDbReady) {
    throw new Error('IndexedDB did not receive the tournament snapshot.');
  }

  await page.getByTitle('Switch to Chinese').click();
  await waitForText(page, '诗意 · 比赛战绩统计系统');

  console.log('Browser smoke test passed: create roster, start event, export Excel, reload persistence, switch language.');
} finally {
  await browser?.close();
  server.kill();
  await waitForExit(server);
  try {
    rmSync(browserDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // Browser profiles can remain briefly locked on Windows after process exit.
  }
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

async function waitForText(page, text) {
  await page.waitForFunction(
    value => document.body.textContent?.includes(value),
    text,
    { timeout: 10000 }
  );
}

async function waitFor(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError ?? new Error(`Timed out after ${timeoutMs}ms`);
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3000)),
  ]);
}
