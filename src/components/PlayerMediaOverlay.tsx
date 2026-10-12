import { useCallback, useEffect, useRef, useState } from 'react';
import { uiText, type UiLanguage } from '../core/uiText';

function isAutoplayBlocked(failure: unknown) {
  return typeof failure === 'object' && failure !== null && 'name' in failure && failure.name === 'NotAllowedError';
}

export function PlayerMediaOverlay({ src, muted, language, onClose }: {
  src: string;
  muted: boolean;
  language: UiLanguage;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
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
    return () => { active = false; };
  }, [src, muted, reportError]);

  const retry = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (video.error) video.load();
    void video.play().then(() => {
      if (videoRef.current !== video) return;
      setNeedsSound(false);
      setNeedsPlay(false);
      setError(null);
    }).catch((failure: unknown) => {
      if (videoRef.current === video) reportError(failure);
    });
  };

  return <div className="player-media-overlay">
    <video ref={videoRef} className="integrated-media" src={src} muted={muted} playsInline controls
      onEnded={onClose}
      onError={() => reportError(videoRef.current?.error ?? new Error(text.videoPlaybackFailed))}
    />
    {(hasError || needsPlay || needsSound) && <div className="player-media-status" role={hasError ? 'alert' : 'status'}>
      <p>{hasError ? `${text.videoPlaybackFailed}: ${error}` : needsPlay ? text.tapPlayVideo : text.videoMutedAutoplay}</p>
      <button onClick={retry}>{hasError ? text.retryVideo : needsPlay ? text.playVideo : text.enableVideoSound}</button>
    </div>}
    <button className="player-media-close" onClick={onClose}>{text.close}</button>
  </div>;
}
