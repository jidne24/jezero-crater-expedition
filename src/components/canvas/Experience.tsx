import { Suspense, useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Preload, useGLTF } from '@react-three/drei';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useGameStore } from '../../store/useGameStore';
import {
  markSceneGpuReady,
  resetSceneGpuReady,
} from '../../utils/sceneReadiness';
import {
  startMarsAmbientSoundscape,
  stopMarsAmbientSoundscape,
  updateMarsAmbientWind,
} from '../../utils/soundEngine';
import { AstronautController } from './AstronautController';
import { MarsOutpost } from './MarsOutpost';
import { OnboardingCutscene } from './OnboardingCutscene';
import { VictoryCutscene } from './VictoryCutscene';
import { WeatherEnvironment } from './WeatherEnvironment';

useGLTF.preload('/models/astronaut.glb');
useGLTF.preload('/models/perseverance.glb');

const GpuSceneWarmup = ({ onReady }: { onReady: () => void }) => {
  const { gl, scene, camera } = useThree();
  const renderedFrames = useRef(0);

  useFrame(() => {
    renderedFrames.current += 1;
  });

  useEffect(() => {
    let animationFrame = 0;
    let cancelled = false;

    const warmUp = (): void => {
      if (cancelled) return;
      if (renderedFrames.current === 0) {
        animationFrame = requestAnimationFrame(warmUp);
        return;
      }

      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      gl.compile(scene, camera);
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      gl.getContext().finish();
      if (!cancelled) onReady();
    };

    animationFrame = requestAnimationFrame(warmUp);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [camera, gl, onReady, scene]);

  return null;
};

const SimulationTicker = () => {
  useFrame((_, delta) => {
    const gameState = useGameStore.getState();
    if (gameState.gameStatus === 'PLAYING') gameState.tickSimulation(delta);
  });
  return null;
};

export const Experience = () => {
  useKeyboard();
  const gameStatus = useGameStore((state) => state.gameStatus);
  const onboardingPhase = useGameStore((state) => state.onboardingPhase);
  const victoryPhase = useGameStore((state) => state.victoryPhase);
  const activeSol = useGameStore((state) => state.solsData[state.currentSolIndex]!);
  const isMenu = gameStatus === 'MENU';
  const isVictory = gameStatus === 'VICTORY';
  const isMarsLanding = isMenu && onboardingPhase === 'MARS_LANDING';
  const isMarsReturn = isVictory && victoryPhase === 'MARS_BOARDING_ASCENT';
  const showMars =
    gameStatus === 'PLAYING' ||
    gameStatus === 'SOL_COMPLETE' ||
    gameStatus === 'GAME_OVER' ||
    isMarsLanding ||
    isMarsReturn;
  const handleSceneGpuReady = useCallback(() => markSceneGpuReady(), []);

  useEffect(() => {
    resetSceneGpuReady();
    return () => resetSceneGpuReady();
  }, []);

  useEffect(() => {
    if (isVictory && document.pointerLockElement) void document.exitPointerLock();
  }, [isVictory]);

  useEffect(() => {
    void useGameStore.getState().loadNasaData().catch((error: unknown) => {
      console.error('NASA telemetry could not be loaded; using the built-in Sol data.', error);
    });
  }, []);

  useEffect(() => {
    if (gameStatus !== 'PLAYING') {
      stopMarsAmbientSoundscape();
      return;
    }
    startMarsAmbientSoundscape();
    updateMarsAmbientWind(activeSol.windSpeedMps, activeSol.dustOpticalDepthTau);
  }, [gameStatus, activeSol.windSpeedMps, activeSol.dustOpticalDepthTau]);

  useEffect(() => () => stopMarsAmbientSoundscape(), []);

  return (
    <Canvas shadows camera={{ position: [0, 8, 16], fov: 50 }} className="w-full h-full touch-none">
      <Suspense fallback={null}>
        <SimulationTicker />
        {isMenu ? <OnboardingCutscene /> : null}
        {showMars ? <WeatherEnvironment /> : null}
        {showMars ? (
          <group>
            <MarsOutpost />
            {!isMenu && !isVictory ? <AstronautController /> : null}
          </group>
        ) : null}
        {isVictory ? <VictoryCutscene /> : null}
        <Preload all />
        <GpuSceneWarmup onReady={handleSceneGpuReady} />
      </Suspense>
    </Canvas>
  );
};
