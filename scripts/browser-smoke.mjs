import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

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

try {
  await waitFor(
    () => fetch(appUrl, { signal: AbortSignal.timeout(1000) }),
    15000
  );

  const result = await runBrowser([
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-software-rasterizer',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `--user-data-dir=${browserDataDir}`,
    appUrl,
  ]);

  if (result.code !== 0 || !result.stdout.includes('诗意 · 比赛战绩统计系统')) {
    throw new Error(`Browser render check failed.\n${result.stderr || result.stdout}`);
  }

  console.log('Browser smoke test passed.');
} finally {
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

function runBrowser(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
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
