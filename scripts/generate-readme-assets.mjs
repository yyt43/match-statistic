import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'docs');
const screenshotDir = join(outputDir, 'screenshots');
const appPort = 4174;
const appUrl = `http://127.0.0.1:${appPort}/`;
const browserPath = findBrowser();

if (!browserPath) {
  throw new Error('Chrome or Edge is required to generate README assets.');
}

mkdirSync(screenshotDir, { recursive: true });
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
  await generateSocialPreview(browser, root);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /选手管理/ }).click();
  await page.getByRole('button', { name: '批量导入' }).click();
  await page.locator('textarea').fill('张三\n李四\n王五\n赵六\n钱七\n孙八\n周九\n吴十');
  await page.getByRole('button', { name: /导入 8 名选手/ }).click();
  await page.getByRole('button', { name: /开始本组比赛/ }).click();
  await page.getByTitle('开启测试模式').click();
  await page.getByRole('button', { name: '随机生成当前轮结果' }).click();
  await page.getByRole('button', { name: '生成下一轮对阵' }).click();
  await page.getByRole('button', { name: '确认' }).last().click();
  await page.getByRole('button', { name: '随机生成当前轮结果' }).click();
  await page.screenshot({ path: join(screenshotDir, 'main-desktop.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: join(screenshotDir, 'main-mobile.png') });
  await context.close();
} finally {
  await browser.close();
  server.kill();
  await waitForExit(server);
}

async function generateSocialPreview(browserInstance, projectRoot) {
  const svg = readFileSync(join(projectRoot, 'public', 'favicon.svg'), 'utf8');
  const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const page = await browserInstance.newPage({ viewport: { width: 1280, height: 640 } });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 1280px;
        height: 640px;
        overflow: hidden;
        color: white;
        font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        background:
          radial-gradient(circle at 82% 24%, rgba(99, 102, 241, 0.35), transparent 35%),
          radial-gradient(circle at 18% 80%, rgba(250, 204, 21, 0.16), transparent 30%),
          linear-gradient(135deg, #111827 0%, #1e1b4b 100%);
        display: flex;
        align-items: center;
        padding: 72px 84px;
      }
      .logo { width: 136px; height: 136px; margin-right: 52px; filter: drop-shadow(0 18px 30px rgba(250,204,21,.2)); }
      h1 { margin: 0 0 18px; font-size: 56px; line-height: 1.08; letter-spacing: 1px; }
      p { margin: 0; color: #cbd5e1; font-size: 25px; line-height: 1.55; }
      .tags { display: flex; gap: 12px; margin-top: 32px; }
      .tag { padding: 8px 16px; border-radius: 999px; color: #fde68a; background: rgba(250,204,21,.1); border: 1px solid rgba(250,204,21,.28); font-size: 17px; }
    </style>
    <img class="logo" src="${logo}" alt="" />
    <div>
      <h1>诗意 · 比赛战绩统计系统</h1>
      <p>瑞士轮与单败淘汰赛事管理、排名统计、Excel 导入导出</p>
      <div class="tags">
        <span class="tag">多小组</span>
        <span class="tag">实时排名</span>
        <span class="tag">中英双语</span>
        <span class="tag">本地优先</span>
      </div>
    </div>
  `);
  await page.screenshot({ path: join(outputDir, 'social-preview.png') });
  await page.close();
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
