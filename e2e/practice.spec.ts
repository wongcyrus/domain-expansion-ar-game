import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { browserMocks, queueGesture } from './browserHarness';

async function preparePractice(context: BrowserContext, page: Page, overrides: Record<string, unknown> = {}) {
  await context.addInitScript(browserMocks, {
    role: 'player1', room: 'PRAC', tokenExpiry: 0, realMediaPlayback: true,
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
  const backend: string[] = [], sockets: string[] = [], errors: string[] = [], assets: string[] = [];
  context.on('request', request => {
    const url = request.url();
    if (/\/config\.json|\/api\/|amazonaws\.com|cloudfront\.net/.test(url)) backend.push(url);
    if (['image', 'media'].includes(request.resourceType())) assets.push(url);
  });
  await context.route(/\/config\.json|\/api\/|amazonaws\.com|cloudfront\.net/, route => route.abort());
  page.on('websocket', socket => sockets.push(socket.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Player settings' }).click();
  await expect(page.locator('.status-message')).toContainText('Camera + MediaPipe active');
  const cloud = await page.evaluate(() => localStorage.getItem('domain-expansion.settings'));
  await page.getByRole('button', { name: 'Save & hide' }).click();
  return { backend, sockets, errors, cloud, assets };
}

function expectLocalAssets(page: Page, assets: string[]) {
  const base = new URL(page.url());
  expect(assets.some(url => new URL(url).pathname.endsWith('.mp4'))).toBe(true);
  expect(assets.some(url => new URL(url).pathname.endsWith('.png'))).toBe(true);
  for (const asset of assets) {
    const url = new URL(asset);
    expect(url.origin).toBe(base.origin);
    expect(url.pathname.startsWith(`${base.pathname}static/`)).toBe(true);
  }
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
  await expect.poll(() => page.locator('.player-media-overlay video').evaluate((video: HTMLVideoElement) =>
    video.currentTime
  )).toBeGreaterThan(.15);
  expect(await page.locator('.player-media-overlay video').evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  await page.locator('.player-media-overlay').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.player-media-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.hud')).toContainText('Score 0/1');
  await expect(page.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeVisible();
  await expect(page.locator('.result')).toContainText('Final score: 0/1');
  await expect.poll(() => page.locator('.player-media-overlay video').evaluate((video: HTMLVideoElement) =>
    video.currentTime
  )).toBeGreaterThan(.15);
  await page.locator('.player-media-overlay video').evaluate((video: HTMLVideoElement) => {
    video.playbackRate = 16;
  });
  await expect(page.locator('.player-media-overlay')).toHaveCount(0);
  await expect.poll(() => page.locator('.brand-left').evaluate(image =>
    image instanceof HTMLImageElement ? image.naturalWidth : 0
  )).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('domain-expansion.settings'))).toBe(observed.cloud);
  expect(observed.backend).toEqual([]);
  expect(observed.sockets).toEqual([]);
  expect(observed.errors).toEqual([]);
  expectLocalAssets(page, observed.assets);
});

test('blocked sound autoplay starts muted and result playback dismisses on a mobile-sized screen', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.matches('.integrated-media') && !this.muted) {
        return Promise.reject(new DOMException('Autoplay requires a gesture', 'NotAllowedError'));
      }
      return play.call(this);
    };
  });
  const observed = await preparePractice(context, page, { videoMode: 'integrated' });
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(page.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  await expect.poll(() => page.locator('.player-media-overlay video').evaluate((video: HTMLVideoElement) =>
    video.currentTime
  )).toBeGreaterThan(.15);
  await page.locator('.player-media-overlay').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.player-media-overlay')).toHaveCount(0);
  await page.locator('.result').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.result')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start round' })).toBeVisible();
  expect(observed.backend).toEqual([]);
  expect(observed.sockets).toEqual([]);
  expect(observed.errors).toEqual([]);
  expectLocalAssets(page, observed.assets);
});

test('a failed video exposes retry and still allows dismissal', async ({ context, page }) => {
  const observed = await preparePractice(context, page);
  await context.route('**/static/video/**/*.mp4', route => route.abort());
  await page.getByRole('button', { name: 'Start round' }).click();
  await expect(page.getByRole('heading', { name: 'ROUND COMPLETE' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Video playback failed');
  await expect(page.getByRole('button', { name: 'Retry video' })).toBeVisible();
  await page.locator('.player-media-overlay').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.player-media-overlay')).toHaveCount(0);
  expect(observed.backend).toEqual([]);
  expect(observed.sockets).toEqual([]);
  expect(observed.errors).toEqual([]);
  expectLocalAssets(page, observed.assets);
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
  expectLocalAssets(page, observed.assets);
});
