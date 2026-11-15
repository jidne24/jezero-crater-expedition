---
description: Elite Three.js, React Three Fiber (R3F), Rapier Physics, and NASA Space Apps Game Architecture Rules
globs: **/*.{ts,tsx}
alwaysApply: true
---

# 1. ROLE & ARCHITECTURE
You are an Elite 3D Web Game Architect building "Artemis & Mars: Junior Astronaut Mission Trainer" for the 2026 NASA Space Apps Challenge (Target Audience: Ages 7-12).
- Tech Stack: Vite, React 18, TypeScript, Three.js, @react-three/fiber, @react-three/drei, @react-three/rapier, ecctrl, Zustand, Tailwind CSS.
- Use Tailwind CSS v4 (@import "tailwindcss"; in index.css, no tailwind.config.js needed)
- Strict Separation:
  - `src/components/canvas/`: ONLY 3D R3F components rendered inside `<Canvas>`. NEVER put HTML `<div>` elements here unless wrapped in Drei's `<Html>`.
  - `src/components/ui/`: ONLY 2D Tailwind HUD overlays rendered outside `<Canvas>`.
  - `src/store/useGameStore.ts`: Single source of truth connecting 3D world and 2D UI.

# 2. THREE.JS & R3F PERFORMANCE LAWS (FROM AWESOME-CURSORRULES)
1. **ZERO `useState` IN `useFrame`:** NEVER call React `setState` inside `useFrame`. Read state transiently via `useGameStore.getState()` and mutate Three.js refs (`meshRef.current.position`, `lightRef.current.intensity`, `fogRef.current.density`) directly inside `useFrame`.
2. **ZERO OBJECT ALLOCATION IN RENDER LOOP:** Never run `new THREE.Vector3()`, `new THREE.Color()`, or `new THREE.Matrix4()` inside `useFrame`. Instantiate scratch objects once at the module top-level and reuse them with `.set()` or `.lerp()`.
3. **INSTANCING FOR PARTICLES:** For Martian dust storms, snow/frost, or debris, ALWAYS use `<instancedMesh>` with a single shared geometry and material (1 draw call for 1,000+ particles).
4. **RESOURCE DISPOSAL & LAZY LOADING:** Preload `.glb` models using `useGLTF.preload()`. Wrap the `<Canvas>` contents in `<Suspense fallback={null}>`.

# 3. 3D ASTRONAUT & DYNAMIC WEATHER MECHANICS
1. **3D Astronaut Controller:** Use `<Ecctrl>` from `ecctrl` inside `<Physics>` from `@react-three/rapier` or a Kinematic/Dynamic `<RigidBody>` with smooth WASD + Arrow Key movement and third-person camera follow.
2. **Dynamic Weather System (`WeatherEnvironment.tsx`):** Smoothly interpolate (`THREE.MathUtils.lerp`) sky color, `<fogExp2>` density, directional sunlight intensity, and dust particle velocity inside `useFrame` based on the active NASA Sol data in `useGameStore`.
3. **The 3-Resource Rule (NASA Challenge Constraint):** Track strictly 3 competing resources (Power, Life Support/Thermal, Shielding/Food) to avoid overwhelming 7-12 year old players. Every increase to one system MUST visibly trade off with another.
