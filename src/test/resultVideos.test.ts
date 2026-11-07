import { describe, expect, it, vi } from 'vitest';
import { selectResultVideo } from '../core/resultVideos';

describe('result videos', () => {
  it.each([true, false])('uses all nine clips for won=%s', (won) => {
    const random = vi.spyOn(Math, 'random');
    const clips = Array.from({ length: 9 }, (_, index) => {
      random.mockReturnValue((index + 0.5) / 9);
      return selectResultVideo(won);
    });
    expect(new Set(clips).size).toBe(9);
    expect(clips.every((src) => src.startsWith(`/static/video/${won ? 'win' : 'lose'}/`))).toBe(true);
  });

  it.each([true, false])('avoids the previous clip even when random repeats for won=%s', (won) => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = selectResultVideo(won);
    const next = selectResultVideo(won, first);
    expect(next).not.toBe(first);
    expect(selectResultVideo(won, next)).not.toBe(next);
  });
});
