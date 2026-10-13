import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shows an element full screen. Uses the browser's Fullscreen API; where it isn't available
 * (e.g. Safari on iPhone) `fullscreen` is still true, and the element is expected to cover the
 * page with CSS. Escape leaves full screen in both cases.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The CSS fallback has no Escape of its own
  useEffect(() => {
    if (!fullscreen || document.fullscreenElement) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const toggle = useCallback(() => {
    const element = ref.current;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (!fullscreen && document.fullscreenEnabled && element?.requestFullscreen) {
      element.requestFullscreen().catch(() => setFullscreen(true));
    } else {
      setFullscreen((f) => !f);
    }
  }, [fullscreen]);

  return { ref, fullscreen, toggle };
}
