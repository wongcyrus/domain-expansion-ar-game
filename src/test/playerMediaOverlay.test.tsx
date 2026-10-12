import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerMediaOverlay } from '../components/PlayerMediaOverlay';

const blocked = () => new DOMException('A user gesture is required', 'NotAllowedError');

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function mount(muted = false) {
  const onClose = vi.fn();
  const view = render(<PlayerMediaOverlay src="/clip.mp4" muted={muted} language="en" onClose={onClose} />);
  return { ...view, onClose, video: view.container.querySelector('video')! };
}

describe('PlayerMediaOverlay', () => {
  it('starts inline playback, preserves silence, and supports ending and dismissal', () => {
    const { video, onClose } = mount(true);
    expect(video.play).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    fireEvent.ended(video);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('retries blocked sound autoplay muted and enables sound with a tap', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(blocked());
    const { video } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(video.play).toHaveBeenCalledTimes(3);
    expect(video.muted).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('shows Play video if both automatic attempts are blocked', async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(blocked()).mockRejectedValueOnce(blocked());
    const { video } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Play video' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(video.play).toHaveBeenCalledTimes(3);
    expect(video.muted).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('keeps silent mode on a gesture retry and reports another blocked retry', async () => {
    vi.mocked(HTMLMediaElement.prototype.play)
      .mockRejectedValueOnce(blocked()).mockRejectedValueOnce(blocked());
    const { video } = mount(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Play video' }));
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(2));
    expect(video.muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it.each(['Unsupported codec', ''])('reports playback errors even with an empty reason (%s)', async (message) => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error(message));
    const { video, onClose } = mount();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Video playback failed');
    expect(alert.textContent).toContain(message);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('reports native media errors and reloads before retrying', async () => {
    const { video } = mount();
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4, message: 'Media unavailable' } });
    fireEvent.error(video);
    expect(screen.getByRole('alert').textContent).toContain('Media unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }));
    expect(video.load).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('reports media errors even when the browser supplies no details', () => {
    const { video } = mount();
    fireEvent.error(video);
    expect(screen.getByRole('alert').textContent).toContain('Video playback failed');
  });

  it('reports non-Error playback rejections', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce('Decoder unavailable');
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('Decoder unavailable');
  });

  it('does not retry a dismissed clip when its initial attempt rejects late', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    const { unmount } = mount();
    unmount();
    await act(async () => reject(blocked()));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it.each([true, false])('ignores a settled muted retry after dismissal (success: %s)', async (success) => {
    let resolve!: () => void, reject!: (reason: unknown) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(blocked())
      .mockReturnValueOnce(new Promise((pass, fail) => { resolve = pass; reject = fail; }));
    const { unmount } = mount();
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    unmount();
    await act(async () => success ? resolve() : reject(new Error('Late failure')));
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([true, false])('ignores a settled manual retry after dismissal (success: %s)', async (success) => {
    let resolve!: () => void, reject!: (reason: unknown) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(blocked())
      .mockReturnValueOnce(new Promise((pass, fail) => { resolve = pass; reject = fail; }));
    const { unmount } = mount(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Play video' }));
    unmount();
    await act(async () => success ? resolve() : reject(new Error('Late failure')));
    expect(console.error).not.toHaveBeenCalled();
  });
});
