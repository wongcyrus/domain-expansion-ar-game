import { afterEach, expect, it, vi } from 'vitest';
import { assetUrl } from '../core/assets';

afterEach(() => vi.unstubAllEnvs());

it('preserves existing AWS root asset paths', () => {
  vi.stubEnv('BASE_URL', '/');
  expect(assetUrl('/static/video/technique_lapse_blue.mp4')).toBe('/static/video/technique_lapse_blue.mp4');
  expect(assetUrl('/legacy/domain_expansion.js')).toBe('/legacy/domain_expansion.js');
  expect(assetUrl('/player.html')).toBe('/player.html');
});

it('resolves Pages assets and popup links under the project base path', () => {
  vi.stubEnv('BASE_URL', '/domain-expansion-ar-game/');
  expect(assetUrl('/static/img/jujutsu-kaisen-logo.png')).toBe('/domain-expansion-ar-game/static/img/jujutsu-kaisen-logo.png');
  expect(assetUrl('/legacy/domain_expansion.js')).toBe('/domain-expansion-ar-game/legacy/domain_expansion.js');
  expect(assetUrl('player.html')).toBe('/domain-expansion-ar-game/player.html');
});
