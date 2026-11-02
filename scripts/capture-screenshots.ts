import { chromium } from '@playwright/test';
import { buildApp } from '../apps/server/src/app.js';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  console.info('Starting RaidRelay screenshot capture utility...');

  const outputDir = path.resolve(process.cwd(), 'docs/screenshots');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Spin up temporary in-memory server
  const { app, startSimulatedRaid } = await buildApp({
    databasePath: ':memory:',
    enableEventSubAutoConnect: false,
  });

  const address = await app.listen({ port: 4123, host: '127.0.0.1' });
  console.info(`Server running at ${address} for screenshot capture.`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // HiDPI crisp capture
  });

  const page = await context.newPage();

  // 1. Home / Landing Page
  console.info('Capturing 01-landing-page.png...');
  await page.goto('http://127.0.0.1:4123/');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, '01-landing-page.png'), fullPage: false });

  // 2. Broadcaster Console Page
  console.info('Capturing 02-broadcaster-console.png...');
  await page.goto('http://127.0.0.1:4123/console');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, '02-broadcaster-console.png'), fullPage: false });

  // 3. Demo Lab with Simulation Active
  console.info('Capturing 06-demo-lab-judges.png...');
  await page.goto('http://127.0.0.1:4123/lab');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, '06-demo-lab-judges.png'), fullPage: false });

  // 4. OBS Overlay in 1920x1080 during active states
  console.info('Capturing OBS Overlay states at 1920x1080...');
  const overlayPage = await context.newPage();
  await overlayPage.setViewportSize({ width: 1920, height: 1080 });

  // Trigger simulated raid (1x speed)
  startSimulatedRaid({ speedMultiplier: 1 });
  await overlayPage.goto('http://127.0.0.1:4123/overlay/demo-channel-key-12345');

  // Landing state (first 2 seconds)
  await overlayPage.waitForTimeout(1500);
  await overlayPage.screenshot({ path: path.join(outputDir, '03-incoming-raid-overlay.png') });

  // Voting state (after 10s or trigger 10x)
  await app.inject({ method: 'POST', url: '/api/demo/run', payload: { speedMultiplier: 10 } });
  await overlayPage.waitForTimeout(1500); // 1.5s at 10x = 15s in ritual -> VOTING state
  await overlayPage.screenshot({ path: path.join(outputDir, '04-voting-overlay.png') });

  // Result state: trigger approval
  await app.inject({ method: 'POST', url: '/api/ritual/current' }).then(async (res) => {
    const snap = JSON.parse(res.body);
    if (snap.id && snap.id !== 'idle') {
      await app.inject({ method: 'POST', url: `/api/ritual/${snap.id}/approve` });
    }
  });
  await overlayPage.waitForTimeout(500);
  await overlayPage.screenshot({ path: path.join(outputDir, '05-result-relay-card.png') });

  // 5. 1280x720 Thumbnail
  console.info('Capturing thumbnail.png (1280x720)...');
  const thumbPage = await context.newPage();
  await thumbPage.setViewportSize({ width: 1280, height: 720 });
  await thumbPage.goto('http://127.0.0.1:4123/');
  await thumbPage.waitForTimeout(500);
  await thumbPage.screenshot({ path: path.join(outputDir, 'thumbnail.png') });

  await browser.close();
  await app.close();
  console.info('✓ All screenshots captured successfully in docs/screenshots/');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});

