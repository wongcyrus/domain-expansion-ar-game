import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { browserMocks, queueGesture } from './browserHarness';

async function preparePractice(context: BrowserContext, page: Page, overrides: Record<string, unknown> = {}) {
  await context.addInitScript(browserMocks, {
    role: 'player1', room: 'PRAC', tokenExpiry: 0,
    settings: { playerMode: 'battle', role: 'player2', robotId: 'robot_6' }
  });
  await context.addInitScript(settings => {
    localStorage.setItem('domain-expansion.practice.settings', JSON.stringify(settings));
    delete (window as typeof window & { DomainExpansionGame?: unknown }).DomainExpansionGame;
  }, {
    language: 'en', playerMode: 'battle', disableRobotApi: false,
    difficulty: 3, gestureCount: 1, videoMode: 'integrated_silent', ...overrides
  });
  await context.route('https://cdn.jsdelivr.net/npm/@mediapipe/**', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' })
  );
  const backend: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on('request', request => {
    const url = request.url();
    if (/\/config\.json|\/api\/|amazonaws\.com/.test(url)) backend.push(url);
  });
  await context.route(/\/config\.json|\/api\/|amazonaws\.com/, route => route.abort());
  page.on('websocket', socket => sockets.push(socket.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Player settings' }).click();
  await expect(page.locator('.status-message')).toContainText('Camera + MediaPipe active');
  const cloud = await page.evaluate(() => localStorage.getItem('domain-expansion.settings'));
  await page.getByRole('button', { name: 'Save & hide' }).click();
  return { backend, sockets, errors, cloud };
}

test('static practice scores, plays video, restarts, and times out with no backend', async ({ context, page }) => {
  const observed = await preparePractice(context, page);
  const basePath = new URL(page.url()).pathname;
  await expect(page.locator('.auth-page')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start round' }).click();
  const target = (await page.locator('.hud strong').textContent())!.trim();
  await queueGesture(page, target, 20);
  await expect(page.locator('.hud')).toContainText('Score 1/1');
  await expect.poll(() => page.locator('.player-media-overlay video').getAttribute('src')).toContain(`${basePath}static/video/`);
  await expect(page.getByRole('heading', { name: 'PERFECT!' })).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.hud')).toContainText('Score 0/1');
  await expect(page.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeVisible();
  await expect(page.locator('.result')).toContainText('Final score: 0/1');
  await expect.poll(() => page.locator('.brand-left').evaluate(image =>
    image instanceof HTMLImageElement ? image.naturalWidth : 0
  )).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('domain-expansion.settings'))).toBe(observed.cloud);
  expect(observed.backend).toEqual([]);
  expect(observed.sockets).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test('practice popup and assets stay under the Pages project path', async ({ context, page }) => {
  const observed = await preparePractice(context, page, { videoMode: 'popup' });
  const basePath = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Player settings' }).click();
  await expect(page.getByLabel('Mode')).toHaveCount(0);
  await expect(page.getByLabel('Robot', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open battle viewer' })).toHaveCount(0);
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open media popup' }).click();
  const popup = await opened;
  await popup.waitForURL(url => url.pathname === `${basePath}player.html`);
  await popup.locator('video').click();
  await expect(popup.getByText('Waiting for technique')).toBeVisible();
  await page.getByRole('button', { name: 'Save & hide' }).click();
  await page.getByRole('button', { name: 'Start round' }).click();
  const target = (await page.locator('.hud strong').textContent())!.trim();
  await queueGesture(page, target, 20);
  await expect.poll(() => popup.locator('video').getAttribute('src')).toContain(`${basePath}static/video/`);
  await popup.close();
  expect(observed.backend).toEqual([]);
  expect(observed.sockets).toEqual([]);
  expect(observed.errors).toEqual([]);
});
