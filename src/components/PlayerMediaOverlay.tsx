import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { assetUrl } from '../core/assets';
import { uiText, type UiLanguage } from '../core/uiText';

export interface PlayerMediaControls {
  unlockSound: () => Promise<boolean>;
}

function isAutoplayBlocked(failure: unknown) {
  return typeof failure === 'object' && failure !== null && 'name' in failure && failure.name === 'NotAllowedError';
}

export function PlayerMediaOverlay({ src, muted, language, onClose, controlsRef }: {
  src: string | null;
  muted: boolean;
  language: UiLanguage;
  onClose: () => void;
  controlsRef?: Ref<PlayerMediaControls>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const soundAuthorized = useRef(false);
  const unlockRequest = useRef<Promise<boolean> | null>(null);
  const playbackRevision = useRef(0);
  const unlockSrc = assetUrl('/static/audio/audio-unlock.wav');
  const [needsSound, setNeedsSound] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasError = error !== null;
  const text = uiText(language);
  const reportError = useCallback((failure: unknown) => {
    if (isAutoplayBlocked(failure)) {
      console.warn('Solo video autoplay blocked', src, failure);
      setNeedsPlay(true);
      return;
    }
    console.error('Solo video playback failed', src, failure);
    setError(failure instanceof Error ? failure.message : videoRef.current?.error?.message || String(failure));
  }, [src]);

  const unlockSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return Promise.resolve(false);
    if (soundAuthorized.current) return Promise.resolve(true);
    if (unlockRequest.current) return unlockRequest.current;
    const revision = playbackRevision.current;
    video.src = unlockSrc;
    video.muted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Sound authorization timed out')), 5000);
    });
    const request = Promise.race([video.play(), deadline]).then(() => {
      if (videoRef.current !== video || playbackRevision.current !== revision) return false;
      soundAuthorized.current = true;
      if (video.getAttribute('src') === unlockSrc) video.pause();
      return true;
    }).catch((failure: unknown) => {
      if (videoRef.current === video && playbackRevision.current === revision && video.getAttribute('src') === unlockSrc) reportError(failure);
      return false;
    }).finally(() => {
      clearTimeout(timer);
      if (unlockRequest.current === request) unlockRequest.current = null;
    });
    unlockRequest.current = request;
    return request;
  }, [unlockSrc, reportError]);
  useImperativeHandle(controlsRef, () => ({ unlockSound }), [unlockSound]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    playbackRevision.current += 1;
    let active = true;
    const dispose = () => {
      active = false;
      playbackRevision.current += 1;
      video.pause();
    };
    if (!src) {
      video.pause();
      return dispose;
    }
    setNeedsSound(false);
    setNeedsPlay(false);
    setError(null);
    video.muted = muted;
    void video.play().catch(async (failure: unknown) => {
      if (!active) return;
      if (isAutoplayBlocked(failure) && !video.muted) {
        video.muted = true;
        try {
          await video.play();
          if (active) setNeedsSound(true);
        } catch (mutedFailure) {
          if (active) reportError(mutedFailure);
        }
      } else {
        reportError(failure);
      }
    });
    return dispose;
  }, [src, muted, reportError]);

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    const revision = playbackRevision.current;
    const source = video.getAttribute('src');
    video.muted = muted;
    if (video.error) video.load();
    void video.play().then(() => {
      if (videoRef.current !== video || playbackRevision.current !== revision || video.getAttribute('src') !== source) return;
      if (!video.muted) soundAuthorized.current = true;
      setNeedsSound(false);
      setNeedsPlay(false);
      setError(null);
    }).catch((failure: unknown) => {
      if (videoRef.current === video && playbackRevision.current === revision && video.getAttribute('src') === source) reportError(failure);
    });
  };

  return <div className="player-media-overlay" hidden={!src}>
    <video ref={videoRef} className="integrated-media" src={src ?? unlockSrc} muted={muted} playsInline controls preload="auto"
      onEnded={() => { if (src && videoRef.current?.getAttribute('src') === src) onClose(); }}
      onError={() => reportError(videoRef.current?.error ?? new Error(text.videoPlaybackFailed))}
    />
    {(hasError || needsPlay || needsSound) && <div className="player-media-status" role={hasError ? 'alert' : 'status'}>
      <p>{hasError ? `${text.videoPlaybackFailed}: ${error}` : needsPlay ? text.tapPlayVideo : text.videoMutedAutoplay}</p>
      <button onClick={retry}>{hasError ? text.retryVideo : needsPlay ? text.playVideo : text.enableVideoSound}</button>
    </div>}
    <button className="player-media-close" onClick={onClose}>{text.close}</button>
  </div>;
}
