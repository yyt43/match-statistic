import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const outputDir = join(root, 'public', 'icons');
const browserPath = findBrowser();

if (!browserPath) {
  throw new Error('Chrome or Edge is required to generate PWA icons.');
}

mkdirSync(outputDir, { recursive: true });
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  for (const icon of [
    { size: 180, file: 'apple-touch-icon.png' },
    { size: 192, file: 'icon-192.png' },
    { size: 512, file: 'icon-512.png' },
  ]) {
    await page.setViewportSize({ width: icon.size, height: icon.size });
    await page.setContent(`
      <style>
        html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
        img { display: block; width: 100%; height: 100%; }
      </style>
      <img src="${dataUrl}" alt="" />
    `);
    await page.screenshot({
      path: join(outputDir, icon.file),
      omitBackground: true,
    });
  }
} finally {
  await browser.close();
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
