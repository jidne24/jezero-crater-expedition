import { useLayoutEffect, useRef } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import { getTerrainHeight } from './MarsOutpost';
import {
  DUST_DEVIL_COUNT,
  isDustDevilWeather,
  setDustDevilPosition,
} from './weatherHazards';

const DUST_PARTICLE_COUNT = 1500;
const DUST_HALF_EXTENT = 60;
const DUST_HEIGHT = 40;
const DEVIL_PARTICLE_COUNT = 220;
const TARGET_SKY_COLOR = new THREE.Color();
const TARGET_FOG_COLOR = new THREE.Color();
const MARS_HAZE_COLOR = new THREE.Color('#d08a6b');
const MARS_DUST_SKY_COLOR = new THREE.Color('#b86f54');
const DUST_TRANSFORM = new THREE.Object3D();
const DEVIL_TRANSFORM = new THREE.Object3D();
const DEVIL_CENTER = new THREE.Vector3();
const ATMOSPHERE_UNIFORMS = {
  topColor: { value: new THREE.Color('#8f4d3d') },
  bottomColor: { value: new THREE.Color('#d98b5f') },
  offset: { value: 12 },
  exponent: { value: 0.72 },
};
const ATMOSPHERE_VERTEX_SHADER = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ATMOSPHERE_FRAGMENT_SHADER = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
    float height = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    float gradient = pow(max(height, 0.0), exponent);
    gl_FragColor = vec4(mix(bottomColor, topColor, gradient), 1.0);
  }
`;

const createSeededRandom = (initialSeed: number) => {
  let seed = initialSeed;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const createDustField = () => {
  const positions = new Float32Array(DUST_PARTICLE_COUNT * 3);
  const phases = new Float32Array(DUST_PARTICLE_COUNT);
  const scales = new Float32Array(DUST_PARTICLE_COUNT);
  const random = createSeededRandom(48271);

  for (let index = 0; index < DUST_PARTICLE_COUNT; index += 1) {
    const offset = index * 3;
    positions[offset] = (random() - 0.5) * DUST_HALF_EXTENT * 2;
    positions[offset + 1] = random() * DUST_HEIGHT;
    positions[offset + 2] = (random() - 0.5) * DUST_HALF_EXTENT * 2;
    phases[index] = random() * Math.PI * 2;
    scales[index] = 0.55 + random() * 1.25;
  }

  return { positions, phases, scales };
};

const DUST_FIELD = createDustField();
const DEVIL_PHASES = new Float32Array(DUST_DEVIL_COUNT * DEVIL_PARTICLE_COUNT);
const devilRandom = createSeededRandom(11939);
for (let index = 0; index < DEVIL_PHASES.length; index += 1) {
  DEVIL_PHASES[index] = devilRandom() * Math.PI * 2;
}

const lerpColor = (color: THREE.Color, target: THREE.Color, amount: number): void => {
  color.r = THREE.MathUtils.lerp(color.r, target.r, amount);
  color.g = THREE.MathUtils.lerp(color.g, target.g, amount);
  color.b = THREE.MathUtils.lerp(color.b, target.b, amount);
};

const DustDevils = () => {
  const funnelsRef = useRef<(THREE.InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    for (const funnel of funnelsRef.current) {
      funnel?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  useFrame((frameState) => {
    const elapsed = frameState.clock.elapsedTime;

    for (let devilIndex = 0; devilIndex < DUST_DEVIL_COUNT; devilIndex += 1) {
      const funnel = funnelsRef.current[devilIndex];
      if (!funnel) continue;
      setDustDevilPosition(devilIndex, elapsed, DEVIL_CENTER);
      const groundY = getTerrainHeight(DEVIL_CENTER.x, DEVIL_CENTER.z);

      for (let particleIndex = 0; particleIndex < DEVIL_PARTICLE_COUNT; particleIndex += 1) {
        const phaseIndex = devilIndex * DEVIL_PARTICLE_COUNT + particleIndex;
        const height = (particleIndex / DEVIL_PARTICLE_COUNT) * 8.5;
        const angle = DEVIL_PHASES[phaseIndex]! + elapsed * (2.4 + height * 0.12);
        const radius = 0.35 + height * 0.23 + Math.sin(angle * 2.3) * 0.12;
        DEVIL_TRANSFORM.position.set(
          DEVIL_CENTER.x + Math.cos(angle) * radius,
          groundY + 0.12 + height,
          DEVIL_CENTER.z + Math.sin(angle) * radius,
        );
        DEVIL_TRANSFORM.rotation.set(0, -angle, 0.12);
        DEVIL_TRANSFORM.scale.setScalar(0.65 + height * 0.06);
        DEVIL_TRANSFORM.updateMatrix();
        funnel.setMatrixAt(particleIndex, DEVIL_TRANSFORM.matrix);
      }
      funnel.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {Array.from({ length: DUST_DEVIL_COUNT }, (_, index) => (
        <instancedMesh
          key={index}
          ref={(mesh) => {
            funnelsRef.current[index] = mesh;
          }}
          args={[undefined, undefined, DEVIL_PARTICLE_COUNT]}
          frustumCulled={false}
        >
          <boxGeometry args={[0.16, 0.035, 0.035]} />
          <meshBasicMaterial color="#c8754c" transparent opacity={0.62} depthWrite={false} />
        </instancedMesh>
      ))}
    </group>
  );
};

export const WeatherEnvironment = () => {
  const activeSol = useGameStore((state) => state.solsData[state.currentSolIndex]!);
  const isMarsLanding = useGameStore(
    (state) => state.gameStatus === 'MENU' && state.onboardingPhase === 'MARS_LANDING',
  );
  const backgroundRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.FogExp2>(null);
  const sunlightRef = useRef<THREE.DirectionalLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const dustRef = useRef<THREE.InstancedMesh>(null);
  const dustSpeedRef = useRef(activeSol.visualEnvironment.dustParticleSpeed);
  const { visualEnvironment } = activeSol;

  useLayoutEffect(() => {
    const dust = dustRef.current;
    if (!dust) return;
    dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let index = 0; index < DUST_PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      DUST_TRANSFORM.position.set(
        DUST_FIELD.positions[offset]!,
        DUST_FIELD.positions[offset + 1]!,
        DUST_FIELD.positions[offset + 2]!,
      );
      DUST_TRANSFORM.scale.setScalar(DUST_FIELD.scales[index]!);
      DUST_TRANSFORM.updateMatrix();
      dust.setMatrixAt(index, DUST_TRANSFORM.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((frameState, delta) => {
    const background = backgroundRef.current;
    const fog = fogRef.current;
    const sunlight = sunlightRef.current;
    const rimLight = rimLightRef.current;
    const dust = dustRef.current;
    const gameState = useGameStore.getState();
    const sol = gameState.solsData[gameState.currentSolIndex];
    if (!dust || !sol) return;

    const frameDelta = Math.min(delta, 0.1);
    const blend = 1 - Math.exp(-frameDelta * 2.2);
    const target = sol.visualEnvironment;
    if (background && fog && sunlight && rimLight) {
      const hazeBlend = THREE.MathUtils.clamp(sol.dustOpticalDepthTau * 0.13, 0, 0.42);
      const tauFogDensity = 0.004 + sol.dustOpticalDepthTau * 0.0095;
      TARGET_SKY_COLOR.set(target.skyColor).lerp(MARS_DUST_SKY_COLOR, hazeBlend * 0.5);
      TARGET_FOG_COLOR.set(target.fogColor).lerp(MARS_HAZE_COLOR, hazeBlend);
      lerpColor(background, TARGET_SKY_COLOR, blend);
      lerpColor(fog.color, TARGET_FOG_COLOR, blend);
      lerpColor(ATMOSPHERE_UNIFORMS.topColor.value, TARGET_SKY_COLOR, blend);
      lerpColor(ATMOSPHERE_UNIFORMS.bottomColor.value, TARGET_FOG_COLOR, blend);
      fog.density = THREE.MathUtils.lerp(
        fog.density,
        Math.max(target.fogDensity, tauFogDensity),
        blend,
      );
      sunlight.intensity = THREE.MathUtils.lerp(sunlight.intensity, target.sunIntensity, blend);
      rimLight.intensity = THREE.MathUtils.lerp(rimLight.intensity, 0.28 + target.sunIntensity * 0.22, blend);
    }
    dustSpeedRef.current = THREE.MathUtils.lerp(dustSpeedRef.current, target.dustParticleSpeed, blend);

    const windAngle = THREE.MathUtils.degToRad(sol.windDirectionDeg);
    const windX = Math.sin(windAngle);
    const windZ = Math.cos(windAngle);
    const elapsed = frameState.clock.elapsedTime;
    DUST_TRANSFORM.rotation.set(0, Math.atan2(-windZ, windX), 0);

    for (let index = 0; index < DUST_PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      const phase = DUST_FIELD.phases[index]!;
      const drift = dustSpeedRef.current * (0.7 + (phase / (Math.PI * 2)) * 0.6);
      let x = DUST_FIELD.positions[offset]! + windX * drift * frameDelta;
      let y = DUST_FIELD.positions[offset + 1]! +
        Math.sin(elapsed * (0.8 + phase * 0.15) + phase) * frameDelta * (0.35 + dustSpeedRef.current * 0.22);
      let z = DUST_FIELD.positions[offset + 2]! + windZ * drift * frameDelta;

      if (x > DUST_HALF_EXTENT) x -= DUST_HALF_EXTENT * 2;
      if (x < -DUST_HALF_EXTENT) x += DUST_HALF_EXTENT * 2;
      if (z > DUST_HALF_EXTENT) z -= DUST_HALF_EXTENT * 2;
      if (z < -DUST_HALF_EXTENT) z += DUST_HALF_EXTENT * 2;
      if (y > DUST_HEIGHT) y -= DUST_HEIGHT;
      if (y < 0) y += DUST_HEIGHT;

      DUST_FIELD.positions[offset] = x;
      DUST_FIELD.positions[offset + 1] = y;
      DUST_FIELD.positions[offset + 2] = z;
      DUST_TRANSFORM.position.set(x, y, z);
      DUST_TRANSFORM.scale.setScalar(DUST_FIELD.scales[index]!);
      DUST_TRANSFORM.updateMatrix();
      dust.setMatrixAt(index, DUST_TRANSFORM.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {!isMarsLanding && (
        <>
          <color ref={backgroundRef} attach="background" args={[visualEnvironment.skyColor]} />
          <fogExp2 ref={fogRef} attach="fog" args={[visualEnvironment.fogColor, visualEnvironment.fogDensity]} />
          <mesh renderOrder={-1000}>
            <sphereGeometry args={[180, 32, 20]} />
            <shaderMaterial
              uniforms={ATMOSPHERE_UNIFORMS}
              vertexShader={ATMOSPHERE_VERTEX_SHADER}
              fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
              side={THREE.BackSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <ambientLight intensity={0.22} color="#c9b5ab" />
          <hemisphereLight args={['#cbd7e8', '#5b2118', 0.42]} />
          <directionalLight
            ref={sunlightRef}
            castShadow
            position={[28, 42, 18]}
            intensity={visualEnvironment.sunIntensity}
            color="#ffe1c2"
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={60}
            shadow-camera-bottom={-60}
            shadow-camera-near={1}
            shadow-camera-far={150}
            shadow-bias={-0.00025}
            shadow-normalBias={0.025}
          />
          <directionalLight ref={rimLightRef} position={[-34, 18, -28]} intensity={0.72} color="#ff9b6a" />
        </>
      )}
      <instancedMesh ref={dustRef} args={[undefined, undefined, DUST_PARTICLE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.025, 4, 4]} />
        <meshBasicMaterial color="#b85d3b" transparent opacity={0.22} depthWrite={false} />
      </instancedMesh>
      {isDustDevilWeather(activeSol.weatherType) && <DustDevils />}
      {(activeSol.weatherType === 'SOLAR_STORM' || activeSol.weatherType === 'DEEP_FREEZE') && (
        <Stars radius={95} depth={45} count={1400} factor={3} saturation={0.45} fade speed={0.45} />
      )}
    </>
  );
};
