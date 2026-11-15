import * as THREE from 'three';
import type { SolTelemetry } from '../../store/useGameStore';

export const DUST_DEVIL_COUNT = 2;
export const DUST_DEVIL_RADIUS = 3.4;

export const isDustDevilWeather = (weatherType: SolTelemetry['weatherType']): boolean =>
  weatherType === 'DUST_DEVIL' || weatherType === 'MEGA_STORM';

export const setDustDevilPosition = (
  index: number,
  elapsed: number,
  target: THREE.Vector3,
): THREE.Vector3 => {
  const travel = (elapsed * (2.2 + index * 0.45) + index * 68) % 150 - 75;
  const sway = Math.sin(elapsed * 0.11 + index * 2.7) * 38;
  return target.set(sway + (index === 0 ? -9 : 9), 0, travel);
};
