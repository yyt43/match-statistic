import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import * as XLSX from 'xlsx';
import { findBrowser } from './browserPath.mjs';

const root = resolve(import.meta.dirname, '..');
const appPort = 4173;
const appUrl = `http://127.0.0.1:${appPort}/`;
const browserPath = findBrowser();

if (!browserPath) {
  console.log('Browser smoke test skipped: set BROWSER_PATH to Chrome or Edge.');
  process.exit(0);
}

if (!existsSync(join(root, 'dist', 'index.html'))) {
  throw new Error('dist/index.html not found. Run npm run build first.');
}

const browserDataDir = mkdtempSync(join(tmpdir(), 'match-statistic-smoke-'));
const rosterFile = join(browserDataDir, 'roster.xlsx');
const rosterWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  rosterWorkbook,
  XLSX.utils.aoa_to_sheet([
    ['游戏昵称', '选手编号', 'UID', 'QQ'],
    ['Alice', 'A01', '180748058', '2957815893'],
    ['Bob', 'A02', '338916899', '1615852778'],
    ['Charlie', 'A03', '346732256', '2133152813'],
    ['Diana', 'A04', '283093920', '639177928'],
  ]),
  '小组01'
);
writeFileSync(
  rosterFile,
  XLSX.write(rosterWorkbook, { type: 'buffer', bookType: 'xlsx' })
);
const server = spawn(process.execPath, [
  join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  'preview',
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
  page.on('pageerror', error => console.error('[browser error]', error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('[browser console]', message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem('tournament-onboarding-v1', '1');
    window.__capturedDownloads = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__capturedDownloads.push({ name: this.download, href: this.href });
        return;
      }
      originalClick.call(this);
    };
  });

  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByTitle('Switch to English').click();
  await page.waitForTimeout(300);
  const switchedTitle = await page.locator('h1').first().textContent();
  if (!switchedTitle?.includes('Poetic')) {
    throw new Error(`Language switch failed; current title: ${switchedTitle ?? '<empty>'}`);
  }
  await waitForText(page, 'Poetic · Tournament Results System');

  await page.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').last().setInputFiles(rosterFile);
  await waitForText(page, 'Imported 4 player profiles across 1 group.');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === 'Alice'));
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input')).some(input => input.value === '180748058'));
  if (
    await page.getByText('Leaderboard', { exact: true }).count() > 0
    || await page.getByText('Match list', { exact: true }).count() > 0
  ) {
    throw new Error('The pre-start screen still renders ranking or match-table content.');
  }
  const formatManagement = page.getByRole('button', { name: /^Format/ });
  const playerManagement = page.getByRole('button', { name: /^Players/ });
  await formatManagement.waitFor({ state: 'visible' });
  await playerManagement.waitFor({ state: 'visible' });
  const [formatBox, playerBox] = await Promise.all([
    formatManagement.boundingBox(),
    playerManagement.boundingBox(),
  ]);
  if (!formatBox || !playerBox) {
    throw new Error('A management heading disappeared after roster import.');
  }
  if (playerBox.y - formatBox.y > 60) {
    throw new Error('Management headings have an excessive gap after roster import.');
  }
  const firstPlayerBox = await page
    .locator('input')
    .evaluateAll(inputs => {
      const input = inputs.find(element => element.value === 'Alice');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
  if (!firstPlayerBox || firstPlayerBox.top < playerBox.y + playerBox.height) {
    throw new Error('Player rows are not positioned below the player management heading.');
  }
  const settingsScrollerHeight = await page
    .getByTestId('player-management-scroll')
    .first()
    .evaluate(scroller => scroller.clientHeight);
  if (settingsScrollerHeight < 180) {
    throw new Error(`Player list area is too short: ${settingsScrollerHeight}px`);
  }
  const startGroupButton = page.getByRole('button', { name: /^Start group/ });
  const startButtonInScroller = await startGroupButton.evaluate(button =>
    Boolean(button.closest('.overflow-y-auto.p-4.space-y-4'))
  );
  if (startButtonInScroller) {
    throw new Error('The start button is still inside the scrolling settings area.');
  }

  await page.getByRole('button', { name: 'BO3', exact: true }).click();
  const applyCurrent = page.getByRole('button', { name: 'Apply to this group' });
  const applyAll = page.getByRole('button', { name: 'Apply to all groups' });
  await applyCurrent.waitFor({ state: 'visible' });
  await applyAll.waitFor({ state: 'visible' });
  await applyCurrent.click();

  await startGroupButton.click();
  await waitForText(page, 'Confirm tournament information');
  const startDialog = page.getByRole('dialog').filter({ hasText: 'Confirm tournament information' });
  if (!(await startDialog.innerText()).includes('BO3')) {
    throw new Error('The applied BO3 format is missing from the start confirmation.');
  }
  await startDialog.getByRole('button', { name: 'Confirm and start' }).click();
  await waitForText(page, 'Round 1 match list');
  if (await page.getByRole('button', { name: /^Groups/ }).count() > 0) {
    throw new Error('Group management is still visible after the event starts.');
  }
  await page.getByRole('button', { name: /^Round 1/ }).waitFor();
  await waitForText(page, 'W = Win');

  const importResultsButton = page.getByRole('button', { name: 'Import results' });
  const quickScoreButton = page.getByRole('button', { name: 'Quick score entry' });
  for (const button of [importResultsButton, quickScoreButton]) {
    const isInsideScroller = await button.evaluate(element =>
      Boolean(element.closest('.overflow-y-auto.p-4.space-y-4'))
    );
    if (isInsideScroller) {
      throw new Error('A match action button is still inside the scrolling settings area.');
    }
  }

  await importResultsButton.click();
  await waitForText(page, 'Import and verify match results');
  const importResultDialog = page.getByRole('dialog').filter({ hasText: 'Import and verify match results' });
  await importResultDialog.getByRole('button', { name: 'Close' }).click();

  await quickScoreButton.click();
  await waitForText(page, 'Quick score entry');
  await waitForText(page, '1 groups');
  await page.keyboard.press('1');
  await waitForText(page, '1 pending');
  const quickScoreDialog = page.getByRole('dialog').filter({ hasText: 'Quick score entry' });
  await quickScoreDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Storage health' }).click();
  await waitForText(page, 'Storage health');
  const healthDialog = page.getByRole('dialog').filter({ hasText: 'Storage health' });
  await healthDialog.getByRole('button', { name: 'Rewrite storage' }).click();
  await waitForText(page, 'Healthy');
  await healthDialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Export Excel' }).click();
  await page.getByRole('button', { name: 'Match table' }).click();
  await page.getByRole('button', { name: 'Download Excel' }).click();
  const excel = await readCapturedBlob(page, 0);
  if (
    excel.size === 0
    || !excel.fileName.endsWith('.xlsx')
    || !excel.signature.startsWith('504b0304')
  ) {
    throw new Error(`Excel export produced an invalid file: ${JSON.stringify(excel)}`);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Export image' }).click();
  await page.getByRole('button', { name: 'Match table' }).click();
  await page.getByRole('button', { name: 'Download image' }).click();
  const image = await readCapturedBlob(page, 1);
  if (image.size === 0 || !image.fileName.endsWith('.png') || image.signature !== '89504e470d0a1a0a') {
    throw new Error(`Image export produced an invalid file: ${JSON.stringify(image)}`);
  }
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.reload({ waitUntil: 'networkidle' });
  await waitForText(page, 'Round 1 match list');

  const undoButton = page.getByTitle('Undo last action');
  if (await undoButton.isDisabled()) {
    throw new Error('Persistent history was not restored after reload.');
  }
  await page.getByRole('button', { name: 'Operation history' }).click();
  const historyDialog = page.getByRole('dialog').filter({ hasText: 'Operation history' });
  await historyDialog.getByRole('button', { name: 'Restore before' }).first().waitFor();
  await historyDialog.getByRole('button', { name: 'Close' }).click();

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

  const secondPage = await context.newPage();
  await secondPage.addInitScript(() => localStorage.setItem('tournament-onboarding-v1', '1'));
  await secondPage.goto(appUrl, { waitUntil: 'networkidle' });
  await waitForText(secondPage, 'This tab is read-only');
  await secondPage.close();

  await page.getByTitle('Switch to Chinese').click();
  await waitForText(page, '诗意 · 比赛战绩统计系统');

  console.log('Browser smoke test passed: import player profiles with UID/QQ, start event, open result import, export Excel and PNG, reload persistence, switch language.');
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

async function waitForText(page, text) {
  await page.waitForFunction(
    value => document.body.textContent?.includes(value),
    text,
    { timeout: 10000 }
  );
}

async function readCapturedBlob(page, index) {
  await page.waitForFunction(
    expected => (window.__capturedDownloads?.length ?? 0) > expected,
    index,
    { timeout: 30000 }
  );
  return page.evaluate(async capturedIndex => {
    const captured = window.__capturedDownloads[capturedIndex];
    const response = await fetch(captured.href);
    const buffer = await response.arrayBuffer();
    const signature = Array.from(new Uint8Array(buffer).slice(0, 8))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return { fileName: captured.name, size: buffer.byteLength, signature };
  }, index);
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
