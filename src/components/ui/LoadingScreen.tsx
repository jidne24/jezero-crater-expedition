import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useProgress } from '@react-three/drei';
import {
  enterBrowserFullscreen,
  isMobileOrTablet,
  isPortraitOrientation,
} from '../../utils/deviceUtils';
import {
  SCENE_GPU_READY_EVENT,
  isSceneGpuReady,
} from '../../utils/sceneReadiness';

const REVEAL_HOLD_MS = 250;
const SHUTTER_DURATION_MS = 450;

const OrbitalTitle = () => (
  <div className="flex flex-col items-center leading-none">
    <span className="game-title-3d game-title-small relative whitespace-nowrap text-xl sm:text-2xl md:text-3xl">
      <span aria-hidden="true">JEZERO CRATER</span>
      <span className="game-title-face" style={{ backgroundImage: 'linear-gradient(180deg, #bae6fd 0%, #38bdf8 55%, #0284c7 100%)' }}>JEZERO CRATER</span>
    </span>
    <span className="game-title-3d game-title-small relative mt-1 whitespace-nowrap text-lg sm:text-xl md:text-2xl">
      <span aria-hidden="true">EXPEDITION</span>
      <span className="game-title-face" style={{ backgroundImage: 'linear-gradient(180deg, #fef08a 0%, #fb923c 55%, #ea580c 100%)' }}>EXPEDITION</span>
    </span>
  </div>
);

const LandscapeOrientationGate = () => (
  <div
    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#060a12] p-6 text-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="orientation-gate-title"
    data-orientation-gate
    onPointerDownCapture={enterBrowserFullscreen}
    onMouseDownCapture={enterBrowserFullscreen}
    onTouchStartCapture={enterBrowserFullscreen}
    onKeyDownCapture={enterBrowserFullscreen}
  >
    <svg viewBox="0 0 200 200" className="mb-5 h-36 w-36 sm:h-44 sm:w-44" role="img" aria-label="A phone rotating from portrait to landscape">
      <defs>
        <linearGradient id="orientation-screen" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="83" fill="none" stroke="#38bdf8" strokeOpacity="0.25" strokeWidth="2" />
      <ellipse cx="100" cy="100" rx="88" ry="42" fill="none" stroke="#fbbf24" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="4 8" transform="rotate(-25 100 100)" />
      <circle cx="24" cy="139" r="5" fill="#fbbf24" />
      <g className="orientation-device">
        <rect x="69" y="46" width="62" height="108" rx="12" fill="#0f172a" stroke="#e0f2fe" strokeWidth="4" />
        <rect x="76" y="58" width="48" height="79" rx="5" fill="url(#orientation-screen)" />
        <circle cx="100" cy="146" r="3" fill="#bae6fd" />
        <path d="M89 97 100 87 111 97M100 87V119M89 108 100 119 111 108" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      </g>
      <path d="M150 55A73 73 0 0 1 172 112" fill="none" stroke="#fb923c" strokeWidth="4" strokeLinecap="round" />
      <path d="m164 103 9 12 7-13" fill="none" stroke="#fb923c" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <h1 id="orientation-gate-title" className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">🪐 JEZERO CRATER EXPEDITION</h1>
    <p className="mt-4 max-w-lg text-base font-semibold leading-relaxed text-sky-100/85 sm:text-lg">
      Welcome, Future Astronaut! Please switch your phone or tablet to Landscape Mode for the best Junior Astronaut Mars experience.
    </p>
    <button
      type="button"
      onClick={() => void enterBrowserFullscreen()}
      className="mt-6 cursor-pointer rounded-full border border-cyan-100/35 bg-cyan-400/15 px-6 py-3 text-sm font-extrabold text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.12)] backdrop-blur-md transition-colors hover:bg-cyan-400/25 sm:text-base"
    >
      ⛶ Rotate &amp; Enter Fullscreen
    </button>
    <p className="mt-4 text-xs font-semibold text-white/45">Your mission will continue in Landscape Mode.</p>
  </div>
);

export const LoadingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const { active, progress } = useProgress();
  const [displayPercent, setDisplayPercent] = useState(0);
  const [smoothT, setSmoothT] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isMounted, setIsMounted] = useState(true);
  const [deviceOrientation, setDeviceOrientation] = useState(() => ({
    isMobile: isMobileOrTablet(),
    isPortrait: isPortraitOrientation(),
  }));
  const continuousProgressRef = useRef(0);
  const displayedPercentRef = useRef(0);
  const transferPathRef = useRef<SVGPathElement>(null);
  const spacecraftRef = useRef<SVGGElement>(null);
  const assetsReadyRef = useRef(false);
  const gpuReadyRef = useRef(isSceneGpuReady());
  const completionNotifiedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const shouldShowOrientationGate = deviceOrientation.isMobile && deviceOrientation.isPortrait;
  const orientationBlockedRef = useRef(shouldShowOrientationGate);
  const assetsReady = !active && progress >= 100;

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    enterBrowserFullscreen();
    if (!isMounted && !shouldShowOrientationGate) return;
    const handleFullscreenInteraction = (): void => enterBrowserFullscreen();
    const events = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const;
    for (const event of events) window.addEventListener(event, handleFullscreenInteraction, true);
    return () => {
      for (const event of events) window.removeEventListener(event, handleFullscreenInteraction, true);
    };
  }, [isMounted, shouldShowOrientationGate]);

  useEffect(() => {
    const wasBlocked = orientationBlockedRef.current;
    orientationBlockedRef.current = shouldShowOrientationGate;
    if (wasBlocked && !shouldShowOrientationGate) enterBrowserFullscreen();
  }, [shouldShowOrientationGate]);

  useEffect(() => {
    const updateDeviceOrientation = (): void => {
      const next = { isMobile: isMobileOrTablet(), isPortrait: isPortraitOrientation() };
      setDeviceOrientation((current) => current.isMobile === next.isMobile && current.isPortrait === next.isPortrait ? current : next);
    };
    updateDeviceOrientation();
    window.addEventListener('resize', updateDeviceOrientation);
    window.addEventListener('orientationchange', updateDeviceOrientation);
    return () => {
      window.removeEventListener('resize', updateDeviceOrientation);
      window.removeEventListener('orientationchange', updateDeviceOrientation);
    };
  }, []);

  useEffect(() => {
    assetsReadyRef.current = assetsReady;
  }, [assetsReady]);

  useEffect(() => {
    const handleGpuReady = (): void => {
      gpuReadyRef.current = true;
    };
    if (isSceneGpuReady()) handleGpuReady();
    window.addEventListener(SCENE_GPU_READY_EVENT, handleGpuReady);
    return () => window.removeEventListener(SCENE_GPU_READY_EVENT, handleGpuReady);
  }, []);

  useEffect(() => {
    let lastTime = performance.now();
    let hundredReachedAt: number | null = null;
    let revealStarted = false;
    let animationFrame = 0;
    let unmountTimer: ReturnType<typeof setTimeout> | undefined;

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (orientationBlockedRef.current) {
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      const fullyReady = assetsReadyRef.current && gpuReadyRef.current;
      const currentProgress = continuousProgressRef.current;
      const rate = fullyReady ? 42 : currentProgress > 90 ? 6 : 36;
      const ceiling = fullyReady ? 100 : 99;
      continuousProgressRef.current = Math.min(ceiling, currentProgress + dt * rate);
      setSmoothT(continuousProgressRef.current / 100);

      const targetPercent = Math.floor(continuousProgressRef.current);
      if (targetPercent > displayedPercentRef.current) {
        displayedPercentRef.current = Math.min(targetPercent, displayedPercentRef.current + 1);
        flushSync(() => setDisplayPercent(displayedPercentRef.current));
      }

      if (displayedPercentRef.current === 100) {
        if (!completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onCompleteRef.current();
        }
        if (hundredReachedAt === null) hundredReachedAt = now;
        if (now - hundredReachedAt >= REVEAL_HOLD_MS && !revealStarted) {
          revealStarted = true;
          setIsRevealing(true);
          unmountTimer = setTimeout(() => setIsMounted(false), SHUTTER_DURATION_MS);
          return;
        }
      }
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, []);

  useEffect(() => {
    const path = transferPathRef.current;
    const spacecraft = spacecraftRef.current;
    if (!path || !spacecraft) return;
    const pathLength = path.getTotalLength();
    const distance = pathLength * smoothT;
    const point = path.getPointAtLength(distance);
    const referenceDistance = distance < pathLength ? Math.min(pathLength, distance + 0.2) : Math.max(0, distance - 0.2);
    const reference = path.getPointAtLength(referenceDistance);
    const direction = distance < pathLength ? 1 : -1;
    const angle = Math.atan2((reference.y - point.y) * direction, (reference.x - point.x) * direction) * 180 / Math.PI;
    spacecraft.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
  }, [smoothT, shouldShowOrientationGate]);

  if (shouldShowOrientationGate) return <LandscapeOrientationGate />;
  if (!isMounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 select-none ${isRevealing ? 'pointer-events-none bg-transparent' : 'bg-[#060a12]'}`}
      data-loading-screen
      data-progress={displayPercent}
      data-revealing={isRevealing}
      aria-label="Preparing the Jezero Crater Expedition"
      onPointerDownCapture={enterBrowserFullscreen}
      onMouseDownCapture={enterBrowserFullscreen}
      onTouchStartCapture={enterBrowserFullscreen}
      onKeyDownCapture={enterBrowserFullscreen}
    >
      <div aria-hidden="true" className={`airlock-shutter absolute inset-x-0 top-0 h-1/2 bg-[#060a12] transition-transform duration-[450ms] ease-in-out ${isRevealing ? '-translate-y-full' : 'translate-y-0'}`} />
      <div aria-hidden="true" className={`airlock-shutter absolute inset-x-0 bottom-0 h-1/2 bg-[#060a12] transition-transform duration-[450ms] ease-in-out ${isRevealing ? 'translate-y-full' : 'translate-y-0'}`} />

      <div className={`relative flex h-full w-full flex-col items-center justify-center p-4 transition-opacity duration-[450ms] ${isRevealing ? 'opacity-0' : 'opacity-100'}`}>
        <div className="relative w-[340px] max-w-full sm:w-[440px] md:w-[520px]">
          <svg viewBox="0 0 640 400" className="h-auto w-full overflow-visible" role="img" aria-label="A spacecraft travels from Earth to Mars as loading progresses">
            <defs>
              <radialGradient id="loading-earth" cx="35%" cy="28%" r="75%">
                <stop offset="0%" stopColor="#7dd3fc" />
                <stop offset="65%" stopColor="#0369a1" />
                <stop offset="100%" stopColor="#082f49" />
              </radialGradient>
              <radialGradient id="loading-mars" cx="34%" cy="28%" r="75%">
                <stop offset="0%" stopColor="#fb923c" />
                <stop offset="65%" stopColor="#fc3d21" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </radialGradient>
            </defs>

            <ellipse cx="320" cy="205" rx="232" ry="135" fill="none" stroke="#334155" strokeOpacity="0.42" strokeWidth="1.5" />
            <ellipse cx="320" cy="205" rx="218" ry="121" fill="none" stroke="#64748b" strokeOpacity="0.2" strokeDasharray="3 9" />
            <path ref={transferPathRef} d="M88 272C145 55 424 30 552 164" fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="3 9" />
            <path d="M88 272C145 55 424 30 552 164" fill="none" stroke="#fb923c" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - smoothT} />

            <circle cx="88" cy="272" r="43" fill="#0284c7" opacity="0.1" />
            <circle cx="88" cy="272" r="32" fill="url(#loading-earth)" stroke="#bae6fd" strokeWidth="2" />
            <path d="M65 261l12-10 10 4 5 9-8 6-2 12-10-3-4-9zM101 277l11-5 7 8-7 13-9-3-6-8z" fill="#4d7c42" opacity="0.9" />
            <path d="M64 254Q88 236 111 254" fill="none" stroke="#e0f2fe" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />

            <circle cx="552" cy="164" r="51" fill="#fc3d21" opacity="0.09" />
            <circle cx="552" cy="164" r="37" fill="url(#loading-mars)" stroke="#fdba74" strokeWidth="2" />
            <ellipse cx="540" cy="153" rx="10" ry="5" fill="#9a3412" opacity="0.65" transform="rotate(-20 540 153)" />
            <ellipse cx="563" cy="177" rx="12" ry="6" fill="#9a3412" opacity="0.55" transform="rotate(18 563 177)" />
            <ellipse cx="552" cy="164" rx="51" ry="15" fill="none" stroke="#facc15" strokeOpacity="0.65" strokeWidth="1.5" transform="rotate(-22 552 164)" />

            <g ref={spacecraftRef} transform="translate(88 272)">
              <path d="M13 0L-9-8-4 0-9 8Z" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
              <path d="M-4-3L-13 0-4 3Z" fill="#fc3d21" />
              <circle cx="2" cy="0" r="2.5" fill="#facc15" />
            </g>
          </svg>

          <div className="pointer-events-none absolute left-1/2 top-[38%] flex w-[62%] -translate-x-1/2 flex-col items-center text-center">
            <OrbitalTitle />
            <div className="mt-4 text-4xl font-extrabold tracking-wider text-white md:mt-5 md:text-5xl" aria-hidden="true">
              {displayPercent}%
            </div>
            <div
              className="mt-3 h-2 w-48 overflow-hidden rounded-full bg-slate-800"
              role="progressbar"
              aria-label="Mission loading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={displayPercent}
            >
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-amber-300" style={{ width: `${smoothT * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
