import { useCallback, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Experience } from './components/canvas/Experience';
import { DebriefModal } from './components/ui/DebriefModal';
import { HUD } from './components/ui/HUD';
import { TelemetryBox } from './components/ui/TelemetryBox';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { useGameStore } from './store/useGameStore';
import { enterBrowserFullscreen } from './utils/deviceUtils';
import { NASA_API_KEY } from './utils/nasaDataEngine';

let nasaStartupPromise: Promise<void> | null = null;

const initializeNasaData = (): Promise<void> => {
  if (!nasaStartupPromise) {
    nasaStartupPromise = (async () => {
      try {
        await useGameStore.getState().loadNasaData();
      } catch (error) {
        console.error('NASA telemetry could not be loaded; using the built-in Sol data.', error);
      }
      if (NASA_API_KEY !== 'DEMO_KEY') await useGameStore.getState().syncLiveNasaApis(NASA_API_KEY);
    })();
  }
  return nasaStartupPromise;
};

export default function App() {
  const [isLoadingComplete, setIsLoadingComplete] = useState(false);
  const handleLoadingComplete = useCallback(() => setIsLoadingComplete(true), []);

  useEffect(() => {
    void initializeNasaData();
  }, []);

  useEffect(() => {
    const updateUiScale = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = Math.min(1, Math.max(0.48, Math.min(w / 1366, h / 768)));
      document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
    };
    updateUiScale();
    window.addEventListener('resize', updateUiScale);
    window.addEventListener('orientationchange', updateUiScale);
    return () => {
      window.removeEventListener('resize', updateUiScale);
      window.removeEventListener('orientationchange', updateUiScale);
    };
  }, []);

  useEffect(() => {
    if (!isLoadingComplete) return;
    const handleFirstInteraction = (): void => {
      void enterBrowserFullscreen();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction);
    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [isLoadingComplete]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black select-none font-sans text-white">
      <div className="absolute inset-0">
        <Experience />
      </div>
      <HUD />
      <TelemetryBox />
      <DebriefModal />
      <LoadingScreen onComplete={handleLoadingComplete} />
      <Analytics />
    </div>
  );
}
