type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

export const isMobileOrTablet = (): boolean => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isIPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return mobileUserAgent || isIPadOs || window.matchMedia('(pointer: coarse)').matches;
};

export const isPortraitOrientation = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
};

export const isFullscreenActive = (): boolean => {
  if (typeof document === 'undefined') return false;
  return Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement);
};

export function enterBrowserFullscreen(): void {
  if (typeof document === 'undefined') return;
  try {
    const root = document.documentElement as FullscreenRoot;
    if (!isFullscreenActive()) {
      const requestFullscreen = root.requestFullscreen ?? root.webkitRequestFullscreen ?? root.msRequestFullscreen;
      if (requestFullscreen) Promise.resolve(requestFullscreen.call(root)).catch(() => {});
    }
    if (typeof screen !== 'undefined' && screen.orientation) {
      const orientation = screen.orientation as LockableScreenOrientation;
      if (typeof orientation.lock === 'function') orientation.lock('landscape').catch(() => {});
    }
  } catch {}
}
