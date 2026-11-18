import { useEffect, useSyncExternalStore } from 'react';
import { useGameStore } from '../store/useGameStore';
import type { PowerSystem } from '../store/useGameStore';
import { playUiClick } from '../utils/soundEngine';

export interface KeyboardDisplayState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  space: boolean;
  shift: boolean;
  e: boolean;
  key1: boolean;
  key2: boolean;
  key3: boolean;
  v: boolean;
}

export interface KeyboardState extends KeyboardDisplayState {
  forward: boolean;
  backward: boolean;
  sprint: boolean;
  interact: boolean;
  jump: boolean;
  virtualArrowOrbit: boolean;
}

type MovementKey = keyof Pick<KeyboardState, 'forward' | 'backward' | 'left' | 'right' | 'sprint' | 'interact' | 'jump'>;
export type VirtualKey = 'forward' | 'backward' | 'left' | 'right' | 'jump' | 'sprint' | 'interact' | 'arrowUp' | 'arrowDown' | 'arrowLeft' | 'arrowRight';
export type VirtualAction = 'interact' | 'jump' | 'togglePov' | 'power1' | 'power2' | 'power3';
export type KeyActionCode = 'KeyE' | 'Digit1' | 'Digit2' | 'Digit3' | 'KeyT' | 'KeyV' | 'KeyC' | 'KeyM';

const createKeyboardState = (): KeyboardState => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  sprint: false,
  interact: false,
  jump: false,
  virtualArrowOrbit: false,
  w: false,
  a: false,
  s: false,
  d: false,
  up: false,
  down: false,
  space: false,
  shift: false,
  e: false,
  key1: false,
  key2: false,
  key3: false,
  v: false,
});

const INITIAL_DISPLAY_STATE: Readonly<KeyboardDisplayState> = {
  w: false,
  a: false,
  s: false,
  d: false,
  up: false,
  down: false,
  left: false,
  right: false,
  space: false,
  shift: false,
  e: false,
  key1: false,
  key2: false,
  key3: false,
  v: false,
};

const physicalKeyState = createKeyboardState();
export const virtualKeyState = createKeyboardState();
export const keyboardState = createKeyboardState();
const listeners = new Set<() => void>();
let displaySnapshot: Readonly<KeyboardDisplayState> = { ...INITIAL_DISPLAY_STATE };

const syncKey = (key: keyof KeyboardState): void => {
  const pressed = physicalKeyState[key] || virtualKeyState[key];
  keyboardState[key] = pressed;
  if (key in INITIAL_DISPLAY_STATE) {
    const displayKey = key as keyof KeyboardDisplayState;
    if (displaySnapshot[displayKey] !== pressed) {
      displaySnapshot = { ...displaySnapshot, [displayKey]: pressed };
      listeners.forEach((listener) => listener());
    }
  }
};

const syncVirtualArrowOrbit = (): void => {
  keyboardState.virtualArrowOrbit = virtualKeyState.up || virtualKeyState.down || virtualKeyState.left || virtualKeyState.right;
};

const MOVEMENT_KEYS: Readonly<Record<string, MovementKey>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyE: 'interact',
  Space: 'jump',
};
const DISPLAY_KEYS: Readonly<Record<string, keyof KeyboardDisplayState>> = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Space: 'space',
  ShiftLeft: 'shift',
  ShiftRight: 'shift',
  KeyE: 'e',
  Digit1: 'key1',
  Numpad1: 'key1',
  Digit2: 'key2',
  Numpad2: 'key2',
  Digit3: 'key3',
  Numpad3: 'key3',
  KeyV: 'v',
};
const POWER_KEYS: Readonly<Record<string, PowerSystem>> = {
  Digit1: 'thruster',
  Numpad1: 'thruster',
  Digit2: 'thermal',
  Numpad2: 'thermal',
  Digit3: 'shieldSensor',
  Numpad3: 'shieldSensor',
};
const VIRTUAL_KEY_MAP: Record<VirtualKey, { movement: MovementKey; display: keyof KeyboardDisplayState }> = {
  forward: { movement: 'forward', display: 'w' },
  backward: { movement: 'backward', display: 's' },
  left: { movement: 'left', display: 'a' },
  right: { movement: 'right', display: 'd' },
  jump: { movement: 'jump', display: 'space' },
  sprint: { movement: 'sprint', display: 'shift' },
  interact: { movement: 'interact', display: 'e' },
  arrowUp: { movement: 'forward', display: 'up' },
  arrowDown: { movement: 'backward', display: 'down' },
  arrowLeft: { movement: 'left', display: 'left' },
  arrowRight: { movement: 'right', display: 'right' },
};
const VIRTUAL_ACTION_CODES: Partial<Record<VirtualAction, KeyActionCode>> = {
  togglePov: 'KeyV',
  power1: 'Digit1',
  power2: 'Digit2',
  power3: 'Digit3',
};
const virtualReleaseTimers = new Map<VirtualKey, number>();

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const resetKeyboardState = (): void => {
  virtualReleaseTimers.forEach((timer) => window.clearTimeout(timer));
  virtualReleaseTimers.clear();
  for (const key of Object.keys(keyboardState) as (keyof KeyboardState)[]) {
    physicalKeyState[key] = false;
    virtualKeyState[key] = false;
    keyboardState[key] = false;
  }
  displaySnapshot = { ...INITIAL_DISPLAY_STATE };
  listeners.forEach((listener) => listener());
};

export const setVirtualKey = (key: VirtualKey, active: boolean): void => {
  const pendingTimer = virtualReleaseTimers.get(key);
  if (pendingTimer !== undefined) {
    window.clearTimeout(pendingTimer);
    virtualReleaseTimers.delete(key);
  }
  const { movement, display } = VIRTUAL_KEY_MAP[key];
  virtualKeyState[movement] = active;
  virtualKeyState[display] = active;
  syncKey(movement);
  syncKey(display);
  if (key.startsWith('arrow')) syncVirtualArrowOrbit();
  if (active) playUiClick();
};

const releaseVirtualKeyLater = (key: VirtualKey, milliseconds: number): void => {
  const timer = window.setTimeout(() => {
    virtualReleaseTimers.delete(key);
    setVirtualKey(key, false);
  }, milliseconds);
  virtualReleaseTimers.set(key, timer);
};

export const triggerKeyAction = (code: KeyActionCode): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), code === 'KeyE' ? 120 : 90);
};

export const triggerVirtualAction = (action: VirtualAction): void => {
  if (action === 'interact') {
    setVirtualKey('interact', true);
    releaseVirtualKeyLater('interact', 120);
    return;
  }
  if (action === 'jump') {
    setVirtualKey('jump', true);
    releaseVirtualKeyLater('jump', 150);
    return;
  }
  const code = VIRTUAL_ACTION_CODES[action];
  if (code) triggerKeyAction(code);
};

export const useKeyboardDisplayState = (): Readonly<KeyboardDisplayState> =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => displaySnapshot,
  );

export const useKeyboard = (): Readonly<KeyboardState> => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const movementKey = MOVEMENT_KEYS[event.code];
      const displayKey = DISPLAY_KEYS[event.code];
      const powerSystem = POWER_KEYS[event.code];
      if ((movementKey || displayKey) && !event.repeat) playUiClick();
      if (event.code === 'KeyM' && !event.repeat) {
        event.preventDefault();
        useGameStore.getState().toggleAudioMuted();
      }
      if (movementKey) {
        physicalKeyState[movementKey] = true;
        syncKey(movementKey);
        event.preventDefault();
      }
      if (displayKey) {
        physicalKeyState[displayKey] = true;
        syncKey(displayKey);
      }
      if (powerSystem) {
        event.preventDefault();
        if (!event.repeat) useGameStore.getState().allocatePower(powerSystem, 10);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      const movementKey = MOVEMENT_KEYS[event.code];
      const displayKey = DISPLAY_KEYS[event.code];
      if (movementKey) {
        physicalKeyState[movementKey] = false;
        syncKey(movementKey);
        if (!isTypingTarget(event.target)) event.preventDefault();
      }
      if (displayKey) {
        physicalKeyState[displayKey] = false;
        syncKey(displayKey);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', resetKeyboardState);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', resetKeyboardState);
      resetKeyboardState();
    };
  }, []);
  return keyboardState;
};
