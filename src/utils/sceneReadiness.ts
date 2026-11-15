export const SCENE_GPU_READY_EVENT = 'jezero:scene-gpu-ready';

declare global {
  interface Window {
    sceneGpuReady?: boolean;
  }
}

export const resetSceneGpuReady = (): void => {
  window.sceneGpuReady = false;
};

export const isSceneGpuReady = (): boolean => window.sceneGpuReady === true;

export const markSceneGpuReady = (): void => {
  window.sceneGpuReady = true;
  window.dispatchEvent(new Event(SCENE_GPU_READY_EVENT));
};
