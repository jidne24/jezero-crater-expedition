import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { keyboardState } from '../../hooks/useKeyboard';
import { getPowerRequirements, useGameStore } from '../../store/useGameStore';
import type { PowerSystem } from '../../store/useGameStore';
import { isMobileOrTablet } from '../../utils/deviceUtils';
import { publishNavigationTelemetry } from '../../utils/navigationTelemetry';
import {
  getWalkableSurfaceHeight,
  PLAYER_POSITION,
  SAMPLE_TUBES,
  SOLID_OBSTACLES,
  STATIONS,
} from './MarsOutpost';
import type { StationId } from './MarsOutpost';
import { NasaSuitRig, createSuitPose } from './NasaSuitRig';
import type { NasaSuitRigHandle } from './NasaSuitRig';
import {
  DUST_DEVIL_COUNT,
  DUST_DEVIL_RADIUS,
  isDustDevilWeather,
  setDustDevilPosition,
} from './weatherHazards';

const MOVEMENT_DIRECTION = new THREE.Vector3();
const DESIRED_CAMERA_POSITION = new THREE.Vector3();
const CAMERA_TARGET = new THREE.Vector3();
const SMOOTHED_CAMERA_TARGET = new THREE.Vector3();
const DUST_DEVIL_CENTER = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TARGET_ROTATION = new THREE.Quaternion();
const PARTICLE_TRANSFORM = new THREE.Object3D();
const SUIT_PARTICLE_COUNT = 60;
const PARTICLE_POSITIONS = new Float32Array(SUIT_PARTICLE_COUNT * 3);
const PARTICLE_VELOCITIES = new Float32Array(SUIT_PARTICLE_COUNT * 3);
const PARTICLE_LIFE = new Float32Array(SUIT_PARTICLE_COUNT);
const PARTICLE_MAX_LIFE = new Float32Array(SUIT_PARTICLE_COUNT);
const POWER_SELECTION_KEYS: Readonly<Record<string, PowerSystem>> = {
  Digit1: 'thruster',
  Numpad1: 'thruster',
  Digit2: 'thermal',
  Numpad2: 'thermal',
  Digit3: 'shieldSensor',
  Numpad3: 'shieldSensor',
};
const MARS_GRAVITY = 3.72;
const MARS_SPAWN_X = 0;
const MARS_SPAWN_Z = 9.2;
let particleSeed = 7451;

const nextParticleRandom = (): number => {
  particleSeed = (particleSeed * 16807) % 2147483647;
  return (particleSeed - 1) / 2147483646;
};

const spawnSuitParticle = (
  index: number,
  worldX: number,
  worldZ: number,
  groundY: number,
  sprinting: boolean,
): void => {
  const offset = index * 3;
  const angle = nextParticleRandom() * Math.PI * 2;
  const radius = 0.1 + nextParticleRandom() * 0.28;
  const drift = sprinting ? 0.85 : 0.45;
  PARTICLE_POSITIONS[offset] = worldX + Math.cos(angle) * radius;
  PARTICLE_POSITIONS[offset + 1] = groundY + 0.05;
  PARTICLE_POSITIONS[offset + 2] = worldZ + Math.sin(angle) * radius;
  PARTICLE_VELOCITIES[offset] = Math.cos(angle) * drift * (0.4 + nextParticleRandom() * 0.6);
  PARTICLE_VELOCITIES[offset + 1] = 0.12 + nextParticleRandom() * 0.32;
  PARTICLE_VELOCITIES[offset + 2] = Math.sin(angle) * drift * (0.4 + nextParticleRandom() * 0.6);
  PARTICLE_MAX_LIFE[index] = 0.5 + nextParticleRandom() * 0.4;
  PARTICLE_LIFE[index] = PARTICLE_MAX_LIFE[index]!;
};

const updateSuitParticles = (mesh: THREE.InstancedMesh, delta: number): void => {
  for (let index = 0; index < SUIT_PARTICLE_COUNT; index += 1) {
    const offset = index * 3;
    const life = Math.max(0, PARTICLE_LIFE[index]! - delta);
    PARTICLE_LIFE[index] = life;
    let scale = 0;

    if (life > 0) {
      for (let axis = 0; axis < 3; axis += 1) {
        PARTICLE_POSITIONS[offset + axis] =
          PARTICLE_POSITIONS[offset + axis]! + PARTICLE_VELOCITIES[offset + axis]! * delta;
      }
      PARTICLE_VELOCITIES[offset + 1] = PARTICLE_VELOCITIES[offset + 1]! - delta * 0.4;
      const lifeRatio = life / PARTICLE_MAX_LIFE[index]!;
      scale = 0.16 * Math.sin(lifeRatio * Math.PI) * (1.15 - lifeRatio * 0.35);
    }

    PARTICLE_TRANSFORM.position.set(
      PARTICLE_POSITIONS[offset]!,
      PARTICLE_POSITIONS[offset + 1]!,
      PARTICLE_POSITIONS[offset + 2]!,
    );
    PARTICLE_TRANSFORM.scale.setScalar(scale);
    PARTICLE_TRANSFORM.updateMatrix();
    mesh.setMatrixAt(index, PARTICLE_TRANSFORM.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
};

const updateFloodlight = (light: THREE.SpotLight | null, sensorRatio: number, blend: number): void => {
  if (!light) return;
  light.intensity = THREE.MathUtils.lerp(light.intensity, 18 + sensorRatio * 105, blend);
  light.distance = THREE.MathUtils.lerp(light.distance, 16 + sensorRatio * 26, blend);
};

export const AstronautController = () => {
  const { gl } = useThree();
  const astronautRef = useRef<THREE.Group>(null!);
  const modelRef = useRef<THREE.Group>(null!);
  const suitRef = useRef<NasaSuitRigHandle>(null);
  const commanderRef = useRef<NasaSuitRigHandle>(null);
  const commanderGroupRef = useRef<THREE.Group>(null);
  const poseRef = useRef(createSuitPose());
  const commanderPoseRef = useRef(createSuitPose());
  const flashlightRef = useRef<THREE.SpotLight>(null);
  const secondaryFlashlightRef = useRef<THREE.SpotLight>(null);
  const flashlightTargetRef = useRef<THREE.Object3D>(null);
  const secondaryFlashlightTargetRef = useRef<THREE.Object3D>(null);
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const carriedModuleRef = useRef<THREE.Group>(null);
  const velocityX = useRef(0);
  const velocityZ = useRef(0);
  const takeoffVelX = useRef(0);
  const takeoffVelZ = useRef(0);
  const verticalVelocity = useRef(0);
  const jumpOffset = useRef(0);
  const jumpWasHeld = useRef(false);
  const jumpPhase = useRef<'NONE' | 'PRE_JUMP' | 'AIRBORNE' | 'LANDING_SQUAT'>('NONE');
  const phaseElapsed = useRef(0);
  const interactWasHeld = useRef(false);
  const headingRef = useRef(Math.PI);
  const angularVelocityRef = useRef(0);
  const walkPhaseRef = useRef(0);
  const strideAmplitudeRef = useRef(0);
  const particleCursorRef = useRef(0);
  const emissionAccumulatorRef = useRef(0);
  const cameraYaw = useRef(Math.PI);
  const cameraPitch = useRef(0.32);
  const cameraYawTarget = useRef(Math.PI);
  const cameraPitchTarget = useRef(0.32);
  const cameraTouchId = useRef<number | null>(null);
  const cameraTouchX = useRef(0);
  const cameraTouchY = useRef(0);
  const lastTouchTime = useRef(0);
  const cameraInitializedRef = useRef(false);
  const lastNavigationPublishRef = useRef(0);
  const lastRespawnIdRef = useRef(useGameStore.getState().playerRespawnId);
  const selectedPowerRef = useRef<PowerSystem>('thruster');
  const alternateInteractRef = useRef(false);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const cameraPov = useGameStore((state) => state.cameraPov);
  const carriedSampleCount = useGameStore((state) => state.carriedSamples);
  const showCommander = gameStatus === 'GAME_OVER' || gameStatus === 'SOL_COMPLETE';

  useEffect(() => {
    cameraInitializedRef.current = false;
  }, [cameraPov]);

  useEffect(() => {
    const requestCameraLock = (): void => {
      if (isMobileOrTablet() || performance.now() - lastTouchTime.current < 500) return;
      if (
        useGameStore.getState().gameStatus === 'PLAYING' &&
        document.pointerLockElement !== gl.domElement
      ) {
        void gl.domElement.requestPointerLock();
      }
    };
    const toggleCursorLock = (): void => {
      if (isMobileOrTablet() || useGameStore.getState().gameStatus !== 'PLAYING') return;
      if (document.pointerLockElement) void document.exitPointerLock();
      else void gl.domElement.requestPointerLock();
    };
    const handlePointerLockChange = (): void => {
      if (document.pointerLockElement === gl.domElement) {
        cameraYawTarget.current = cameraYaw.current;
        cameraPitchTarget.current = cameraPitch.current;
      }
    };
    const handleMouseMove = (event: MouseEvent): void => {
      if (document.pointerLockElement === gl.domElement) {
        cameraYawTarget.current -= event.movementX * 0.0022;
        cameraPitchTarget.current = THREE.MathUtils.clamp(
          cameraPitchTarget.current + event.movementY * 0.0018,
          -0.15,
          0.95,
        );
      }
    };
    const handleWheel = (event: WheelEvent): void => {
      if (document.pointerLockElement === gl.domElement) {
        event.preventDefault();
        useGameStore.getState().allocatePower(selectedPowerRef.current, event.deltaY > 0 ? -5 : 5);
      }
    };
    const handleScenePointerDown = (event: PointerEvent): void => {
      lastTouchTime.current = performance.now();
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (document.pointerLockElement === gl.domElement) return;
      if (useGameStore.getState().gameStatus !== 'PLAYING' || cameraTouchId.current !== null) return;
      event.preventDefault();
      cameraTouchId.current = event.pointerId;
      cameraTouchX.current = event.clientX;
      cameraTouchY.current = event.clientY;
      gl.domElement.setPointerCapture(event.pointerId);
    };
    const handleScenePointerMove = (event: PointerEvent): void => {
      if (cameraTouchId.current !== event.pointerId || useGameStore.getState().gameStatus !== 'PLAYING') return;
      if (document.pointerLockElement === gl.domElement) return;
      lastTouchTime.current = performance.now();
      event.preventDefault();
      const deltaX = event.clientX - cameraTouchX.current;
      const deltaY = event.clientY - cameraTouchY.current;
      cameraYawTarget.current -= deltaX * 0.0045;
      cameraPitchTarget.current = THREE.MathUtils.clamp(
        cameraPitchTarget.current + deltaY * 0.0035,
        -0.15,
        0.95,
      );
      cameraTouchX.current = event.clientX;
      cameraTouchY.current = event.clientY;
    };
    const handleScenePointerEnd = (event: PointerEvent): void => {
      if (cameraTouchId.current === event.pointerId) cameraTouchId.current = null;
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'KeyC' && !event.repeat) {
        event.preventDefault();
        toggleCursorLock();
      }
      if (
        event.code === 'KeyV' &&
        !event.repeat &&
        useGameStore.getState().gameStatus === 'PLAYING'
      ) {
        useGameStore.getState().toggleCameraPov();
        cameraInitializedRef.current = false;
      }
      const powerSystem = POWER_SELECTION_KEYS[event.code];
      if (powerSystem) selectedPowerRef.current = powerSystem;
      if (event.code === 'KeyQ') alternateInteractRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'KeyQ') alternateInteractRef.current = false;
    };

    gl.domElement.addEventListener('click', requestCameraLock);
    gl.domElement.addEventListener('pointerdown', handleScenePointerDown);
    gl.domElement.addEventListener('pointermove', handleScenePointerMove);
    gl.domElement.addEventListener('pointerup', handleScenePointerEnd);
    gl.domElement.addEventListener('pointercancel', handleScenePointerEnd);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      gl.domElement.removeEventListener('click', requestCameraLock);
      gl.domElement.removeEventListener('pointerdown', handleScenePointerDown);
      gl.domElement.removeEventListener('pointermove', handleScenePointerMove);
      gl.domElement.removeEventListener('pointerup', handleScenePointerEnd);
      gl.domElement.removeEventListener('pointercancel', handleScenePointerEnd);
      cameraTouchId.current = null;
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      alternateInteractRef.current = false;
      if (document.pointerLockElement === gl.domElement) void document.exitPointerLock();
    };
  }, [gl]);

  useLayoutEffect(() => {
    if (flashlightRef.current && flashlightTargetRef.current) {
      flashlightRef.current.target = flashlightTargetRef.current;
    }
    if (secondaryFlashlightRef.current && secondaryFlashlightTargetRef.current) {
      secondaryFlashlightRef.current.target = secondaryFlashlightTargetRef.current;
    }
    SMOOTHED_CAMERA_TARGET.set(MARS_SPAWN_X, getWalkableSurfaceHeight(MARS_SPAWN_X, MARS_SPAWN_Z) + 1.25, MARS_SPAWN_Z);
    const particles = particlesRef.current;
    if (particles) {
      particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let index = 0; index < SUIT_PARTICLE_COUNT; index += 1) {
        PARTICLE_LIFE[index] = 0;
        PARTICLE_TRANSFORM.position.set(0, -10, 0);
        PARTICLE_TRANSFORM.scale.setScalar(0);
        PARTICLE_TRANSFORM.updateMatrix();
        particles.setMatrixAt(index, PARTICLE_TRANSFORM.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    }
  }, []);

  useFrame((state, delta) => {
    const astronaut = astronautRef.current;
    const model = modelRef.current;
    if (!astronaut || !model) return;
    const frameDelta = Math.min(delta, 0.05);
    const gameState = useGameStore.getState();
    const activeSol = gameState.solsData[gameState.currentSolIndex];
    const isPlaying = gameState.gameStatus === 'PLAYING';
    const isMentorMoment = gameState.gameStatus === 'GAME_OVER' || gameState.gameStatus === 'SOL_COMPLETE';
    const isFirstPerson = gameState.cameraPov === 'FIRST_PERSON';
    const elapsed = state.clock.elapsedTime;

    if (gameState.gameStatus === 'MENU') {
      astronaut.visible = false;
      if (document.pointerLockElement === gl.domElement) void document.exitPointerLock();
      cameraInitializedRef.current = false;
      interactWasHeld.current = false;
      jumpWasHeld.current = false;
      jumpPhase.current = 'NONE';
      jumpOffset.current = 0;
      verticalVelocity.current = 0;
      velocityX.current = 0;
      velocityZ.current = 0;
      takeoffVelX.current = 0;
      takeoffVelZ.current = 0;
      return;
    }

    if (lastRespawnIdRef.current !== gameState.playerRespawnId) {
      lastRespawnIdRef.current = gameState.playerRespawnId;
      astronaut.position.set(MARS_SPAWN_X, getWalkableSurfaceHeight(MARS_SPAWN_X, MARS_SPAWN_Z), MARS_SPAWN_Z);
      astronaut.rotation.y = Math.PI;
      velocityX.current = 0;
      velocityZ.current = 0;
      takeoffVelX.current = 0;
      takeoffVelZ.current = 0;
      verticalVelocity.current = 0;
      jumpOffset.current = 0;
      jumpPhase.current = 'NONE';
      headingRef.current = Math.PI;
      angularVelocityRef.current = 0;
      cameraYaw.current = Math.PI;
      cameraYawTarget.current = Math.PI;
      cameraInitializedRef.current = false;
    }

    astronaut.visible = true;
    model.visible = !isFirstPerson || isMentorMoment;
    cameraYaw.current = THREE.MathUtils.damp(cameraYaw.current, cameraYawTarget.current, 16, frameDelta);
    cameraPitch.current = THREE.MathUtils.damp(cameraPitch.current, cameraPitchTarget.current, 16, frameDelta);

    const commander = commanderGroupRef.current;
    if (isMentorMoment && commander) {
      const rightX = Math.cos(cameraYaw.current);
      const rightZ = -Math.sin(cameraYaw.current);
      const forwardX = -Math.sin(cameraYaw.current);
      const forwardZ = -Math.cos(cameraYaw.current);
      const commanderX = astronaut.position.x - rightX * 1.35 + forwardX * 0.25;
      const commanderZ = astronaut.position.z - rightZ * 1.35 + forwardZ * 0.25;
      commander.position.set(commanderX, getWalkableSurfaceHeight(commanderX, commanderZ), commanderZ);
      const targetHeading = Math.atan2(
        state.camera.position.x - commanderX,
        state.camera.position.z - commanderZ,
      );
      const headingDifference = Math.atan2(
        Math.sin(targetHeading - commander.rotation.y),
        Math.cos(targetHeading - commander.rotation.y),
      );
      commander.rotation.y = THREE.MathUtils.damp(
        commander.rotation.y,
        commander.rotation.y + headingDifference,
        8,
        frameDelta,
      );
      const mentorPose = commanderPoseRef.current;
      mentorPose.headPitch = 0.04 + Math.sin(elapsed * 2.1) * 0.07;
      mentorPose.headYaw = Math.sin(elapsed * 0.8) * 0.06;
      mentorPose.rightShoulder = -0.72 + Math.sin(elapsed * 2.4) * 0.18;
      mentorPose.leftShoulder = -0.12 + Math.sin(elapsed * 1.3) * 0.05;
      mentorPose.torsoPitch = 0.025 + Math.sin(elapsed * 1.6) * 0.015;
      commanderRef.current?.applyPose(mentorPose, frameDelta);
    }

    if (isPlaying) {
      const arrowOrbit = keyboardState.virtualArrowOrbit;
      if (arrowOrbit) {
        const orbitX = Number(keyboardState.right) - Number(keyboardState.left);
        const orbitY = Number(keyboardState.up) - Number(keyboardState.down);
        cameraYawTarget.current -= orbitX * frameDelta * 2.4;
        cameraPitchTarget.current = THREE.MathUtils.clamp(
          cameraPitchTarget.current + orbitY * frameDelta * 1.4,
          -0.15,
          0.95,
        );
      }
      const forwardInput = arrowOrbit
        ? Number(keyboardState.w) - Number(keyboardState.s)
        : Number(keyboardState.forward) - Number(keyboardState.backward);
      const strafeInput = arrowOrbit
        ? Number(keyboardState.d) - Number(keyboardState.a)
        : Number(keyboardState.right) - Number(keyboardState.left);
      const forwardX = -Math.sin(cameraYaw.current);
      const forwardZ = -Math.cos(cameraYaw.current);
      const rightX = Math.cos(cameraYaw.current);
      const rightZ = -Math.sin(cameraYaw.current);
      MOVEMENT_DIRECTION.set(
        forwardX * forwardInput + rightX * strafeInput,
        0,
        forwardZ * forwardInput + rightZ * strafeInput,
      );
    } else {
      MOVEMENT_DIRECTION.set(0, 0, 0);
    }

    const hasMovementInput = MOVEMENT_DIRECTION.lengthSq() > 0;
    let isAirborne = jumpPhase.current === 'AIRBORNE';
    const windResistance = activeSol && activeSol.windSpeedMps > 15
      ? Math.max(0.55, 1 - (activeSol.windSpeedMps - 15) * 0.018)
      : 1;
    const sprinting = isPlaying && !isAirborne && keyboardState.sprint && hasMovementInput;
    const mobilityRatio = activeSol
      ? THREE.MathUtils.clamp(gameState.thrusterPower / getPowerRequirements(activeSol).requiredMobility, 0.45, 1.25)
      : 1;
    const movementSpeed = 4.2 * mobilityRatio * (sprinting ? 1.65 : 1) * windResistance;
    if (hasMovementInput) MOVEMENT_DIRECTION.normalize();
    if (isAirborne) {
      velocityX.current = takeoffVelX.current;
      velocityZ.current = takeoffVelZ.current;
    } else {
      const damping = hasMovementInput ? 5.8 : 3.4;
      velocityX.current = THREE.MathUtils.damp(
        velocityX.current,
        MOVEMENT_DIRECTION.x * movementSpeed,
        damping,
        frameDelta,
      );
      velocityZ.current = THREE.MathUtils.damp(
        velocityZ.current,
        MOVEMENT_DIRECTION.z * movementSpeed,
        damping,
        frameDelta,
      );
    }

    const jumpHeld = isPlaying && keyboardState.jump;
    if (jumpHeld && !jumpWasHeld.current && jumpOffset.current <= 0.001 && jumpPhase.current === 'NONE') {
      jumpPhase.current = 'PRE_JUMP';
      phaseElapsed.current = 0;
      verticalVelocity.current = 0;
    }
    jumpWasHeld.current = jumpHeld;
    if (jumpPhase.current === 'PRE_JUMP') {
      phaseElapsed.current += frameDelta;
      if (phaseElapsed.current >= 0.12) {
        jumpPhase.current = 'AIRBORNE';
        isAirborne = true;
        phaseElapsed.current = 0;
        takeoffVelX.current = velocityX.current;
        takeoffVelZ.current = velocityZ.current;
        verticalVelocity.current = 6.8 * (0.9 + gameState.thrusterPower / 340) * Math.sqrt(mobilityRatio);
        const groundY = getWalkableSurfaceHeight(astronaut.position.x, astronaut.position.z);
        for (let index = 0; index < 12; index += 1) {
          spawnSuitParticle(
            particleCursorRef.current,
            astronaut.position.x,
            astronaut.position.z,
            groundY,
            false,
          );
          particleCursorRef.current = (particleCursorRef.current + 1) % SUIT_PARTICLE_COUNT;
        }
      }
    }

    if (isPlaying) {
      let candidateX = THREE.MathUtils.clamp(astronaut.position.x + velocityX.current * frameDelta, -95, 95);
      let candidateZ = THREE.MathUtils.clamp(astronaut.position.z + velocityZ.current * frameDelta, -95, 95);
      if (!isAirborne && activeSol && isDustDevilWeather(activeSol.weatherType)) {
        for (let index = 0; index < DUST_DEVIL_COUNT; index += 1) {
          setDustDevilPosition(index, elapsed, DUST_DEVIL_CENTER);
          const offsetX = candidateX - DUST_DEVIL_CENTER.x;
          const offsetZ = candidateZ - DUST_DEVIL_CENTER.z;
          const distance = Math.hypot(offsetX, offsetZ);
          if (distance < DUST_DEVIL_RADIUS) {
            const normalX = distance > 0.001 ? offsetX / distance : 1;
            const normalZ = distance > 0.001 ? offsetZ / distance : 0;
            const pushStrength = (1 - distance / DUST_DEVIL_RADIUS) * 18;
            candidateX += normalX * pushStrength * frameDelta;
            candidateZ += normalZ * pushStrength * frameDelta;
            velocityX.current += normalX * pushStrength * frameDelta * 3;
            velocityZ.current += normalZ * pushStrength * frameDelta * 3;
          }
        }
      }
      for (let pass = 0; pass < 3; pass += 1) {
        for (const obstacle of SOLID_OBSTACLES) {
          const offsetX = candidateX - obstacle.x;
          const offsetZ = candidateZ - obstacle.z;
          const minimumDistance = obstacle.radius + 0.65;
          const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
          if (distanceSquared >= minimumDistance * minimumDistance) continue;
          const distance = Math.sqrt(distanceSquared);
          const normalX = distance > 0.0001 ? offsetX / distance : 1;
          const normalZ = distance > 0.0001 ? offsetZ / distance : 0;
          candidateX = obstacle.x + normalX * minimumDistance;
          candidateZ = obstacle.z + normalZ * minimumDistance;
          if (!isAirborne) {
            const inwardVelocity = velocityX.current * normalX + velocityZ.current * normalZ;
            if (inwardVelocity < 0) {
              velocityX.current -= inwardVelocity * normalX;
              velocityZ.current -= inwardVelocity * normalZ;
            }
          }
        }
      }
      if (jumpPhase.current === 'AIRBORNE') {
        const previousJumpOffset = jumpOffset.current;
        verticalVelocity.current -= MARS_GRAVITY * frameDelta;
        jumpOffset.current = Math.max(0, jumpOffset.current + verticalVelocity.current * frameDelta);
        if (previousJumpOffset > 0 && jumpOffset.current === 0 && verticalVelocity.current < 0) {
          jumpPhase.current = 'LANDING_SQUAT';
          isAirborne = false;
          phaseElapsed.current = 0;
          verticalVelocity.current = 0;
          for (let index = 0; index < 18; index += 1) {
            spawnSuitParticle(
              particleCursorRef.current,
              candidateX,
              candidateZ,
              getWalkableSurfaceHeight(candidateX, candidateZ),
              false,
            );
            particleCursorRef.current = (particleCursorRef.current + 1) % SUIT_PARTICLE_COUNT;
          }
        }
      } else if (jumpPhase.current === 'LANDING_SQUAT') {
        phaseElapsed.current += frameDelta;
        if (phaseElapsed.current >= 0.18) {
          jumpPhase.current = 'NONE';
          phaseElapsed.current = 0;
        }
      }
      astronaut.position.set(
        THREE.MathUtils.clamp(candidateX, -95, 95),
        0,
        THREE.MathUtils.clamp(candidateZ, -95, 95),
      );
      astronaut.position.y = getWalkableSurfaceHeight(astronaut.position.x, astronaut.position.z) + jumpOffset.current;
    } else {
      velocityX.current = 0;
      velocityZ.current = 0;
      takeoffVelX.current = 0;
      takeoffVelZ.current = 0;
      verticalVelocity.current = 0;
      jumpOffset.current = 0;
      jumpPhase.current = 'NONE';
      phaseElapsed.current = 0;
      astronaut.position.y = getWalkableSurfaceHeight(astronaut.position.x, astronaut.position.z);
    }

    PLAYER_POSITION.x = astronaut.position.x;
    PLAYER_POSITION.z = astronaut.position.z;
    if (isPlaying) {
      for (const sample of SAMPLE_TUBES) {
        if (gameState.collectedSampleTubeIds.includes(sample.id)) continue;
        if (Math.hypot(astronaut.position.x - sample.position[0], astronaut.position.z - sample.position[2]) < 1.35) {
          gameState.collectSampleTube(sample.id);
        }
      }
    }

    const previousHeading = headingRef.current;
    if (hasMovementInput) {
      const targetHeading = Math.atan2(MOVEMENT_DIRECTION.x, MOVEMENT_DIRECTION.z);
      const headingDifference = Math.atan2(
        Math.sin(targetHeading - previousHeading),
        Math.cos(targetHeading - previousHeading),
      );
      headingRef.current = THREE.MathUtils.damp(
        previousHeading,
        previousHeading + headingDifference,
        8.5,
        frameDelta,
      );
    }
    const measuredAngularVelocity = (headingRef.current - previousHeading) / Math.max(frameDelta, 0.001);
    angularVelocityRef.current = THREE.MathUtils.damp(
      angularVelocityRef.current,
      measuredAngularVelocity,
      7,
      frameDelta,
    );
    TARGET_ROTATION.setFromAxisAngle(WORLD_UP, headingRef.current);
    astronaut.quaternion.slerp(TARGET_ROTATION, 1 - Math.exp(-frameDelta * 12));

    const currentSpeed = Math.hypot(velocityX.current, velocityZ.current);
    const movementAmount = Math.min(1, currentSpeed / 4.2);
    strideAmplitudeRef.current = THREE.MathUtils.damp(strideAmplitudeRef.current, movementAmount, 6, frameDelta);
    const strideAmount = strideAmplitudeRef.current;
    walkPhaseRef.current += frameDelta * (4.5 + currentSpeed * 1.35);
    const strideSin = Math.sin(walkPhaseRef.current);
    const secondaryStride = Math.sin(walkPhaseRef.current * 2);
    const bank = THREE.MathUtils.clamp(-angularVelocityRef.current * 0.04, -0.14, 0.14);
    const hipSwingAmp = (sprinting ? 0.82 : 0.55) * strideAmount;
    const shoulderSwingAmp = (sprinting ? 0.88 : 0.58) * strideAmount;
    const pose = poseRef.current;
    pose.hipDip = 0;
    pose.hipBob = (Math.abs(strideSin) * (sprinting ? 0.045 : 0.025)) * strideAmount;
    pose.hipYaw = strideSin * 0.08 * strideAmount;
    pose.hipRoll = bank + strideSin * 0.025 * strideAmount;
    pose.torsoPitch = (sprinting ? 0.14 : 0.075) * strideAmount + Math.sin(elapsed * 1.5) * 0.008;
    pose.torsoYaw = -strideSin * 0.12 * strideAmount;
    pose.torsoRoll = bank * 0.65;
    pose.headPitch = -pose.torsoPitch * 0.65;
    pose.headYaw = -pose.torsoYaw - angularVelocityRef.current * 0.045 + Math.sin(elapsed * 0.55) * 0.05 * (1 - strideAmount);
    pose.leftHip = strideSin * hipSwingAmp;
    pose.rightHip = -strideSin * hipSwingAmp;
    pose.leftKnee = THREE.MathUtils.clamp(0.08 + Math.max(0, -strideSin + secondaryStride * 0.08) * 1.2 * strideAmount, 0.08, 1.35);
    pose.rightKnee = THREE.MathUtils.clamp(0.08 + Math.max(0, strideSin + secondaryStride * 0.08) * 1.2 * strideAmount, 0.08, 1.35);
    pose.leftAnkle = -pose.leftHip * 0.22 + Math.max(0, strideSin) * 0.25 * strideAmount;
    pose.rightAnkle = -pose.rightHip * 0.22 + Math.max(0, -strideSin) * 0.25 * strideAmount;
    pose.leftShoulder = -strideSin * shoulderSwingAmp;
    pose.rightShoulder = strideSin * shoulderSwingAmp;
    pose.leftElbow = -THREE.MathUtils.clamp(sprinting ? 1 + strideSin * 0.45 : 0.55 + strideSin * 0.35, 0.32, 1.45);
    pose.rightElbow = -THREE.MathUtils.clamp(sprinting ? 1 - strideSin * 0.45 : 0.55 - strideSin * 0.35, 0.32, 1.45);

    if (jumpPhase.current !== 'NONE') {
      const isPreJump = jumpPhase.current === 'PRE_JUMP';
      const isAirborne = jumpPhase.current === 'AIRBORNE';
      pose.hipDip = isPreJump ? 0.22 : isAirborne ? 0 : 0.18;
      pose.torsoPitch = isPreJump ? 0.25 : isAirborne ? 0.08 : 0.2;
      pose.leftHip = isPreJump ? -0.55 : isAirborne ? -0.18 : -0.42;
      pose.rightHip = pose.leftHip;
      pose.leftKnee = isPreJump ? 1.15 : isAirborne ? 0.45 : 0.95;
      pose.rightKnee = pose.leftKnee;
      pose.leftShoulder = isPreJump ? -0.6 : isAirborne ? -0.22 : -0.35;
      pose.rightShoulder = pose.leftShoulder;
      pose.leftElbow = -0.55;
      pose.rightElbow = -0.55;
    }
    suitRef.current?.applyPose(pose, frameDelta);

    const isGrounded = jumpPhase.current === 'NONE' || jumpPhase.current === 'LANDING_SQUAT';
    if (isPlaying && isGrounded && movementAmount > 0.08) {
      emissionAccumulatorRef.current += frameDelta * (sprinting ? 18 : 10);
      while (emissionAccumulatorRef.current >= 1) {
        spawnSuitParticle(
          particleCursorRef.current,
          astronaut.position.x,
          astronaut.position.z,
          getWalkableSurfaceHeight(astronaut.position.x, astronaut.position.z),
          sprinting,
        );
        particleCursorRef.current = (particleCursorRef.current + 1) % SUIT_PARTICLE_COUNT;
        emissionAccumulatorRef.current -= 1;
      }
    }
    if (particlesRef.current) updateSuitParticles(particlesRef.current, frameDelta);
    const lightBlend = 1 - Math.exp(-frameDelta * 5);
    updateFloodlight(flashlightRef.current, gameState.shieldSensorPower / 100, lightBlend);
    updateFloodlight(secondaryFlashlightRef.current, gameState.shieldSensorPower / 100, lightBlend);
    if (carriedModuleRef.current) carriedModuleRef.current.visible = gameState.carriedSamples > 0;

    let nearestStation: StationId | 'NONE' = 'NONE';
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const station of STATIONS) {
      const offsetX = astronaut.position.x - station.position[0];
      const offsetZ = astronaut.position.z - station.position[2];
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (isPlaying && distanceSquared <= station.radius * station.radius && distanceSquared < nearestDistanceSquared) {
        nearestStation = station.id;
        nearestDistanceSquared = distanceSquared;
      }
    }
    if (isPlaying) {
      if (gameState.activeStation !== nearestStation) gameState.setActiveStation(nearestStation);
      const isInteracting = keyboardState.interact || alternateInteractRef.current;
      if (isInteracting && !interactWasHeld.current && nearestStation !== 'NONE') {
        gameState.interactStation(nearestStation);
      }
      interactWasHeld.current = isInteracting;
    } else {
      interactWasHeld.current = false;
    }

    if (isMentorMoment && commander) {
      const backX = Math.sin(cameraYaw.current);
      const backZ = Math.cos(cameraYaw.current);
      const rightX = Math.cos(cameraYaw.current);
      const rightZ = -Math.sin(cameraYaw.current);
      const groundY = Math.max(astronaut.position.y, commander.position.y);
      const focusX = (astronaut.position.x + commander.position.x) * 0.5 + rightX * 0.9;
      const focusZ = (astronaut.position.z + commander.position.z) * 0.5 + rightZ * 0.9;
      DESIRED_CAMERA_POSITION.set(focusX + backX * 6.3, groundY + 2.65, focusZ + backZ * 6.3);
      DESIRED_CAMERA_POSITION.y = Math.max(
        DESIRED_CAMERA_POSITION.y,
        getWalkableSurfaceHeight(DESIRED_CAMERA_POSITION.x, DESIRED_CAMERA_POSITION.z) + 0.8,
      );
      CAMERA_TARGET.set(focusX, groundY + 1.25, focusZ);
    } else if (isFirstPerson) {
      const forwardX = -Math.sin(cameraYaw.current);
      const forwardZ = -Math.cos(cameraYaw.current);
      DESIRED_CAMERA_POSITION.set(
        astronaut.position.x + forwardX * 0.12,
        astronaut.position.y + 1.72,
        astronaut.position.z + forwardZ * 0.12,
      );
      CAMERA_TARGET.set(
        DESIRED_CAMERA_POSITION.x - Math.sin(cameraYaw.current) * Math.cos(cameraPitch.current) * 5,
        DESIRED_CAMERA_POSITION.y - Math.sin(cameraPitch.current) * 5,
        DESIRED_CAMERA_POSITION.z - Math.cos(cameraYaw.current) * Math.cos(cameraPitch.current) * 5,
      );
    } else {
      const horizontalDistance = Math.cos(cameraPitch.current) * 5.5;
      const backX = Math.sin(cameraYaw.current);
      const backZ = Math.cos(cameraYaw.current);
      DESIRED_CAMERA_POSITION.set(
        astronaut.position.x + backX * horizontalDistance + Math.cos(cameraYaw.current) * 0.45,
        astronaut.position.y + 1.75 + Math.sin(cameraPitch.current) * 5.5,
        astronaut.position.z + backZ * horizontalDistance - Math.sin(cameraYaw.current) * 0.45,
      );
      DESIRED_CAMERA_POSITION.y = Math.max(
        DESIRED_CAMERA_POSITION.y,
        getWalkableSurfaceHeight(DESIRED_CAMERA_POSITION.x, DESIRED_CAMERA_POSITION.z) + 0.8,
      );
      CAMERA_TARGET.copy(astronaut.position);
      CAMERA_TARGET.y += 1.25;
    }
    const cameraDamping = isMentorMoment ? 3.5 : isFirstPerson ? 22 : 7;
    if (!cameraInitializedRef.current) {
      state.camera.position.copy(DESIRED_CAMERA_POSITION);
      SMOOTHED_CAMERA_TARGET.copy(CAMERA_TARGET);
      cameraInitializedRef.current = true;
    } else {
      for (const axis of ['x', 'y', 'z'] as const) {
        state.camera.position[axis] = THREE.MathUtils.damp(
          state.camera.position[axis],
          DESIRED_CAMERA_POSITION[axis],
          cameraDamping,
          frameDelta,
        );
        SMOOTHED_CAMERA_TARGET[axis] = THREE.MathUtils.damp(
          SMOOTHED_CAMERA_TARGET[axis],
          CAMERA_TARGET[axis],
          cameraDamping,
          frameDelta,
        );
      }
    }
    state.camera.lookAt(SMOOTHED_CAMERA_TARGET);
    if (state.camera instanceof THREE.PerspectiveCamera) {
      const targetFov = !isFirstPerson && sprinting ? 58 : 50;
      state.camera.fov = THREE.MathUtils.damp(state.camera.fov, targetFov, 8, frameDelta);
      state.camera.updateProjectionMatrix();
    }
    if (elapsed - lastNavigationPublishRef.current >= 0.08) {
      publishNavigationTelemetry(cameraYaw.current, astronaut.position.x, astronaut.position.z);
      lastNavigationPublishRef.current = elapsed;
    }
  });

  return (
    <>
      <group
        ref={astronautRef}
        position={[MARS_SPAWN_X, getWalkableSurfaceHeight(MARS_SPAWN_X, MARS_SPAWN_Z), MARS_SPAWN_Z]}
        rotation={[0, Math.PI, 0]}
      >
        <group ref={modelRef}>
          <NasaSuitRig ref={suitRef} scale={0.92} />
          <group ref={carriedModuleRef} visible={false} position={[0, 1.05, -0.26]}>
            <mesh position={[0, -0.145, 0]} castShadow>
              <boxGeometry args={[0.42, 0.045, 0.07]} />
              <meshStandardMaterial color="#59636d" metalness={0.72} roughness={0.32} />
            </mesh>
            {Array.from({ length: Math.min(carriedSampleCount, 5) }, (_, index) => (
              <group key={index} position={[(index - (Math.min(carriedSampleCount, 5) - 1) / 2) * 0.075, 0, 0]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.032, 0.032, 0.22, 12]} />
                  <meshStandardMaterial color="#d4af37" emissive="#8b5e0b" emissiveIntensity={0.18} metalness={0.78} roughness={0.28} />
                </mesh>
                {[-0.112, 0.112].map((capY) => (
                  <mesh key={capY} position={[0, capY, 0]}>
                    <cylinderGeometry args={[0.035, 0.035, 0.025, 12]} />
                    <meshStandardMaterial color={capY > 0 ? '#f1f5f9' : '#d4af37'} metalness={0.65} roughness={0.25} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        </group>
        <spotLight ref={flashlightRef} position={[-0.18, 1.75, 0.28]} color="#c7f4ff" intensity={52} distance={25} angle={0.36} penumbra={0.65} decay={1.5} />
        <spotLight ref={secondaryFlashlightRef} position={[0.18, 1.75, 0.28]} color="#c7f4ff" intensity={52} distance={25} angle={0.36} penumbra={0.65} decay={1.5} />
        <object3D ref={flashlightTargetRef} position={[-0.18, 1.35, 9]} />
        <object3D ref={secondaryFlashlightTargetRef} position={[0.18, 1.35, 9]} />
      </group>
      {showCommander && (
        <group ref={commanderGroupRef} position={[1.35, getWalkableSurfaceHeight(1.35, 9.25), 9.25]}>
          <NasaSuitRig ref={commanderRef} scale={1.08} isCommander />
        </group>
      )}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, SUIT_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#b65f3c" transparent opacity={0.3} depthWrite={false} />
      </instancedMesh>
    </>
  );
};
