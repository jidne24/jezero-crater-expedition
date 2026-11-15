import { useSyncExternalStore } from 'react';

export interface NavigationTelemetrySnapshot {
  readonly cameraYaw: number;
  readonly playerX: number;
  readonly playerZ: number;
}

let snapshot: NavigationTelemetrySnapshot = {
  cameraYaw: Math.PI,
  playerX: 0,
  playerZ: 9,
};

const listeners = new Set<() => void>();

export const publishNavigationTelemetry = (
  cameraYaw: number,
  playerX: number,
  playerZ: number,
): void => {
  if (
    Math.abs(snapshot.cameraYaw - cameraYaw) < 0.0005 &&
    Math.abs(snapshot.playerX - playerX) < 0.005 &&
    Math.abs(snapshot.playerZ - playerZ) < 0.005
  ) {
    return;
  }

  snapshot = { cameraYaw, playerX, playerZ };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): NavigationTelemetrySnapshot => snapshot;

export const useNavigationTelemetry = (): NavigationTelemetrySnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
