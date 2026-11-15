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

export const keyboardState: KeyboardState = {
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
};

const MOVEMENT_KEYS: Readonly<Record<string, keyof Pick<KeyboardState, 'forward' | 'backward' | 'left' | 'right' | 'sprint' | 'interact' | 'jump'>>> = {
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
const listeners = new Set<() => void>();
let displaySnapshot: Readonly<KeyboardDisplayState> = {
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

const setDisplayKey = (key: keyof KeyboardDisplayState, pressed: boolean): void => {
  keyboardState[key] = pressed;
  if (displaySnapshot[key] === pressed) return;
  displaySnapshot = { ...displaySnapshot, [key]: pressed };
  listeners.forEach((listener) => listener());
};

const resetKeyboardState = (): void => {
  virtualReleaseTimers.forEach((timer) => window.clearTimeout(timer));
  virtualReleaseTimers.clear();
  for (const key of Object.keys(keyboardState) as (keyof KeyboardState)[]) keyboardState[key] = false;
  displaySnapshot = {
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
  listeners.forEach((listener) => listener());
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export type VirtualKey = 'w' | 'a' | 's' | 'd' | 'up' | 'down' | 'left' | 'right' | 'space' | 'shift' | 'e';
export type VirtualAction = 'interact' | 'jump' | 'togglePov' | 'power1' | 'power2' | 'power3';

const VIRTUAL_MOVEMENT_KEYS: Partial<Record<VirtualKey, keyof Pick<KeyboardState, 'forward' | 'backward' | 'left' | 'right' | 'sprint' | 'interact' | 'jump'>>> = {
  w: 'forward',
  up: 'forward',
  s: 'backward',
  down: 'backward',
  a: 'left',
  left: 'left',
  d: 'right',
  right: 'right',
  shift: 'sprint',
  space: 'jump',
  e: 'interact',
};
const VIRTUAL_ACTION_CODES: Partial<Record<VirtualAction, string>> = {
  togglePov: 'KeyV',
  power1: 'Digit1',
  power2: 'Digit2',
  power3: 'Digit3',
};
const virtualReleaseTimers = new Map<VirtualKey, number>();

export const setVirtualKey = (key: VirtualKey, pressed: boolean): void => {
  const pendingTimer = virtualReleaseTimers.get(key);
  if (pendingTimer !== undefined) {
    window.clearTimeout(pendingTimer);
    virtualReleaseTimers.delete(key);
  }
  const movementKey = VIRTUAL_MOVEMENT_KEYS[key];
  if (movementKey) keyboardState[movementKey] = pressed;
  setDisplayKey(key, pressed);
  if (['up', 'down', 'left', 'right'].includes(key)) {
    keyboardState.virtualArrowOrbit = keyboardState.up || keyboardState.down || keyboardState.left || keyboardState.right;
  }
  if (pressed) playUiClick();
};

const releaseVirtualKeyLater = (key: VirtualKey, milliseconds: number): void => {
  const timer = window.setTimeout(() => {
    virtualReleaseTimers.delete(key);
    setVirtualKey(key, false);
  }, milliseconds);
  virtualReleaseTimers.set(key, timer);
};

export const triggerVirtualAction = (action: VirtualAction): void => {
  if (action === 'interact') {
    setVirtualKey('e', true);
    releaseVirtualKeyLater('e', 120);
    return;
  }
  if (action === 'jump') {
    setVirtualKey('space', true);
    releaseVirtualKeyLater('space', 150);
    return;
  }
  const code = VIRTUAL_ACTION_CODES[action];
  if (!code) return;
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code })), 90);
};

export const useKeyboardDisplayState = (): Readonly<KeyboardDisplayState> =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    () => displaySnapshot,
  );

export const useKeyboard = (): void => {
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
        keyboardState[movementKey] = true;
        event.preventDefault();
      }
      if (displayKey) setDisplayKey(displayKey, true);
      if (powerSystem) {
        event.preventDefault();
        if (!event.repeat) useGameStore.getState().allocatePower(powerSystem, 10);
      }
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      const movementKey = MOVEMENT_KEYS[event.code];
      const displayKey = DISPLAY_KEYS[event.code];
      if (movementKey) {
        keyboardState[movementKey] = false;
        if (!isTypingTarget(event.target)) event.preventDefault();
      }
      if (displayKey) setDisplayKey(displayKey, false);
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
};
