const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(1500);
  console.log('Page loaded, errors:', errors.length);

  // Set up single elimination
  const seBtn = page.locator('button:has-text("单败淘汰")').first();
  if (await seBtn.isVisible()) {
    await seBtn.click();
    await page.waitForTimeout(500);
    console.log('Selected single elimination');
  }

  // Start tournament
  const startBtn = page.locator('button:has-text("开始本组比赛")').first();
  if (await startBtn.isVisible()) {
    await startBtn.click();
    await page.waitForTimeout(1000);
    console.log('Tournament started');
  }

  // Click reset
  const resetBtn = page.locator('button:has-text("重置比赛")').first();
  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    await page.waitForTimeout(500);
    
    const confirmBtn = page.locator('button:has-text("确认重置")').first();
    if (await confirmBtn.isVisible()) {
      console.log('Clicking confirm reset...');
      await confirmBtn.click();
      await page.waitForTimeout(2000);
      
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
      console.log('Page after reset:', bodyText.replace(/\n/g, ' ').substring(0, 100));
      console.log('Errors after reset:', errors.length ? errors : 'NONE');
    } else {
      console.log('Confirm button not found');
    }
  } else {
    console.log('Reset button not found');
  }

  await browser.close();
})();
