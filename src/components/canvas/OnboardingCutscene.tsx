import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Sky, Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import type { OnboardingStage } from '../../store/useGameStore';
import { NasaSuitRig, createSuitPose } from './NasaSuitRig';
import type { NasaSuitPose, NasaSuitRigHandle } from './NasaSuitRig';
import { getTerrainHeight } from './MarsOutpost';
import { HullDecal, useSpacecraftTextures } from './SpacecraftDecals';
import {
  LANDER_HATCH_HEIGHT,
  LANDER_X,
  LANDER_Z,
  LanderVentMist,
  MarsLanderModel,
  STAIR_BOTTOM_Z,
  STAIR_TOP_Z,
} from './MarsLander';
import {
  playMarsTouchdownThud,
  startMarsEntryAndRetroSound,
  startRocketLaunchSound,
  stopMarsEntryAndRetroSound,
  stopRocketLaunchSound,
  updateMarsLandingAudio,
  updateRocketLaunchDistance,
} from '../../utils/soundEngine';

const CAMERA_DESTINATION = new THREE.Vector3();
const CAMERA_LOOK_TARGET = new THREE.Vector3();
const CAMERA_LOOK_SMOOTH = new THREE.Vector3(0, 16, 0);
const PARTICLE_TRANSFORM = new THREE.Object3D();
const PARTICLE_UNIFORMS = {
  uColor: { value: new THREE.Color('#bdc5ce') },
  uOpacity: { value: 0.22 },
};
const EARTH_BACKGROUND = new THREE.Color('#5da9e9');
const EARTH_FOG = new THREE.Color('#c8d6df');
const SPACE_BACKGROUND = new THREE.Color('#05070e');
const SPACE_FOG = new THREE.Color('#101d31');
const PARTICLE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float softness = 1.0 - smoothstep(0.08, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(uColor, softness * uOpacity);
  }
`;
const LAUNCH_SMOKE_VERTEX_SHADER = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vec4 viewPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const LAUNCH_SMOKE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
    float volume = smoothstep(0.0, 0.72, facing);
    gl_FragColor = vec4(vColor, volume * 0.3);
    #include <colorspace_fragment>
  }
`;
const PARTICLE_COUNT = 420;
const PARTICLE_SEEDS = new Float32Array(PARTICLE_COUNT * 4);
const LAUNCH_SMOKE_COUNT = 450;
const TRENCH_SMOKE_COUNT = 250;
const TRAIL_SMOKE_LIFETIME = 5.8;
const LAUNCH_SMOKE_SEEDS = new Float32Array(LAUNCH_SMOKE_COUNT * 5);
const LAUNCH_SMOKE_TRANSFORM = new THREE.Object3D();
const LAUNCH_SMOKE_COLOR = new THREE.Color();
const DELUGE_STEAM_COLOR = new THREE.Color('#f3f4f6');
const DELUGE_SMOKE_COLOR = new THREE.Color('#a8a29e');
const TRAIL_HOT_COLOR = new THREE.Color('#fef08a');
const TRAIL_FIRE_COLOR = new THREE.Color('#fb923c');
const TRAIL_SMOKE_COLOR = new THREE.Color('#d6d3d1');
const LANDING_Y = getTerrainHeight(LANDER_X, LANDER_Z);
const STAIR_GROUND_Y = getTerrainHeight(LANDER_X, STAIR_BOTTOM_Z);
const CREW_LEVEL = 24;
const PAD_DECK_Y = 0.5;
const ELEVATOR_BASE_Y = 0.36;
const ELEVATOR_FOOT_OFFSET = PAD_DECK_Y - ELEVATOR_BASE_Y;
const TOWER_HEIGHT = 28;
const DEEP_SPACE_ALTITUDE = 470;
const CADET_START_X = -1.9;
const CADET_START_Z = 6.85;
const COMMANDER_START = { x: -3.65, z: 7.65 };
const WALKWAY_START = { x: -2.8, z: 7.5 };
const WALKWAY_END = { x: -4.4, z: -3.85 };
const WALKWAY_LENGTH = Math.hypot(WALKWAY_END.x - WALKWAY_START.x, WALKWAY_END.z - WALKWAY_START.z);
const PAD_WALKWAY_ANGLE = Math.atan2(WALKWAY_END.x - WALKWAY_START.x, WALKWAY_END.z - WALKWAY_START.z);
const GANTRY_LEVELS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28];
const LIGHTNING_TOWERS: [number, number][] = [[-13, -11], [12, -12], [11, 7]];
const FLOODLIGHTS: [number, number][] = [[-9, 4], [9, 4], [-9, -13], [9, -13]];
const BOOSTER_POSITIONS = [-1.75, 1.75];
let randomSeed = 92821;

const seededRandom = (): number => {
  randomSeed = (randomSeed * 16807) % 2147483647;
  return (randomSeed - 1) / 2147483646;
};
for (let index = 0; index < PARTICLE_SEEDS.length; index += 1) {
  PARTICLE_SEEDS[index] = seededRandom();
}
for (let index = 0; index < LAUNCH_SMOKE_SEEDS.length; index += 1) {
  LAUNCH_SMOKE_SEEDS[index] = seededRandom();
}

const easeInOut = (value: number): number => {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const CLOUD_CLUSTERS: [number, number, number, number][] = [
  [-72, 42, -125, 1.4],
  [-30, 50, -150, 1.8],
  [42, 43, -130, 1.5],
  [90, 52, -170, 2],
  [-105, 55, -180, 2.1],
];
const CLOUD_LOBES: [number, number, number, number][] = [
  [-2.2, 0, 0, 2.3],
  [0, 0.7, 0, 3],
  [2.4, 0.1, 0.2, 2.5],
  [-0.8, 1.5, -0.2, 2.2],
  [1.1, 1.4, -0.4, 2.4],
];
const COASTAL_TREES = Array.from({ length: 32 }, (_, index) => {
  const angle = index / 32 * Math.PI * 2;
  const distance = 75 + (index % 5) * 13;
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance - 20,
    scale: 2.4 + (index % 4) * 0.7,
  };
});
const FENCE_POSTS: [number, number][] = [];
for (let offset = -16; offset <= 16; offset += 4) {
  FENCE_POSTS.push([-12, offset], [12, offset]);
  if (offset > -16 && offset < 16) FENCE_POSTS.push([offset, -16], [offset, 16]);
}

const createCoastalTextures = (): { field: THREE.CanvasTexture; gravel: THREE.CanvasTexture } | null => {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(size, size);
  const soilLight: readonly [number, number, number] = [110, 106, 99];
  const soilDark: readonly [number, number, number] = [92, 88, 82];
  const sage: readonly [number, number, number] = [90, 107, 83];
  const olive: readonly [number, number, number] = [78, 93, 72];
  const dryGrass: readonly [number, number, number] = [104, 115, 94];
  let seed = 81357;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const soilBlend = THREE.MathUtils.clamp(0.5 + Math.sin(x * 0.021 + y * 0.017) * 0.3 + random() * 0.2, 0, 1);
      const scrubBlend = THREE.MathUtils.smoothstep(
        0.53 + Math.sin(x * 0.013 + y * 0.019) * 0.24 + Math.cos(y * 0.027 - x * 0.009) * 0.18,
        0.34,
        0.76,
      );
      const grassBlend = THREE.MathUtils.clamp(0.5 + Math.cos(x * 0.032 + y * 0.024) * 0.42, 0, 1);
      const grit = (random() - 0.5) * 17;
      const limestone = random() > 0.992 ? 18 : 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const soil = THREE.MathUtils.lerp(soilDark[channel]!, soilLight[channel]!, soilBlend);
        const scrubBase = THREE.MathUtils.lerp(olive[channel]!, sage[channel]!, grassBlend);
        const scrub = THREE.MathUtils.lerp(scrubBase, dryGrass[channel]!, grassBlend * 0.34);
        image.data[offset + channel] = Math.round(THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(soil, scrub, scrubBlend) + grit + limestone,
          0,
          255,
        ));
      }
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const gravelCanvas = document.createElement('canvas');
  gravelCanvas.width = size;
  gravelCanvas.height = size;
  const gravelContext = gravelCanvas.getContext('2d');
  if (!gravelContext) return null;
  gravelContext.filter = 'saturate(0.12) brightness(1.18)';
  gravelContext.drawImage(canvas, 0, 0);

  const field = new THREE.CanvasTexture(canvas);
  const gravel = new THREE.CanvasTexture(gravelCanvas);
  for (const texture of [field, gravel]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }
  field.repeat.set(72, 72);
  gravel.repeat.set(5, 5);
  return { field, gravel };
};

const EarthLandscape = () => {
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const textures = useMemo(() => createCoastalTextures(), []);
  useEffect(() => () => {
    textures?.field.dispose();
    textures?.gravel.dispose();
  }, [textures]);

  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = -positions.getY(index);
      const onPad = Math.abs(x) < 19 && z > -23 && z < 16;
      const onCrawlerway = Math.abs(x) < 8 && z >= -3 && z < 102;
      const elevationBlend = THREE.MathUtils.smoothstep(Math.hypot(x, z), 24, 74);
      const elevation = onPad || onCrawlerway ? 0 : elevationBlend * (
        Math.sin(x * 0.041) * Math.cos(z * 0.036) * 0.5 +
        Math.cos((x + z) * 0.027) * 0.24 +
        Math.sin((x - z) * 0.063) * 0.12
      );
      positions.setZ(index, elevation);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }, []);

  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry ref={geometryRef} args={[1200, 1200, 160, 160]} />
        <meshStandardMaterial map={textures?.field} color="#ffffff" roughness={0.98} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, -0.025, -4]}>
        <boxGeometry args={[21, 0.035, 25]} />
        <meshStandardMaterial map={textures?.gravel} color="#7a7d78" roughness={0.98} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, -0.022, 46]}>
        <boxGeometry args={[10, 0.04, 104]} />
        <meshStandardMaterial map={textures?.gravel} color="#7a7d78" roughness={0.98} metalness={0} />
      </mesh>
      <mesh receiveShadow position={[0, 0.015, 46]}>
        <boxGeometry args={[8, 0.08, 100]} />
        <meshStandardMaterial color="#979486" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 0.07, 2.25]} rotation={[0.075, 0, 0]}>
        <boxGeometry args={[10, 0.36, 4.5]} />
        <meshStandardMaterial color="#707a7e" roughness={0.9} />
      </mesh>
      {FENCE_POSTS.map(([x, z], index) => (
        <mesh key={`fence-post-${index}`} position={[x, 0.75, z]}>
          <cylinderGeometry args={[0.045, 0.06, 1.5, 8]} />
          <meshStandardMaterial color="#a9b5b7" metalness={0.65} roughness={0.4} />
        </mesh>
      ))}
      {[-12, 12].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.055, 0.055, 32]} />
          <meshStandardMaterial color="#b6c1c3" metalness={0.65} roughness={0.4} />
        </mesh>
      ))}
      {[-16, 16].map((z) => (
        <mesh key={z} position={[0, 1.1, z]}>
          <boxGeometry args={[24, 0.055, 0.055]} />
          <meshStandardMaterial color="#b6c1c3" metalness={0.65} roughness={0.4} />
        </mesh>
      ))}
      <group position={[16, 0, -14]}>
        <mesh castShadow position={[0, 4, 0]}>
          <sphereGeometry args={[3, 32, 24]} />
          <meshStandardMaterial color="#f1f4f3" metalness={0.35} roughness={0.32} />
        </mesh>
        {[-1.5, 1.5].map((x) => [-1.5, 1.5].map((z) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, 1.4, z]}>
            <cylinderGeometry args={[0.14, 0.2, 2.8, 12]} />
            <meshStandardMaterial color="#9ca8ab" metalness={0.75} roughness={0.32} />
          </mesh>
        )))}
        <mesh position={[-3.1, 1.25, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 5.5, 16]} />
          <meshStandardMaterial color="#c3cbcd" metalness={0.78} roughness={0.3} />
        </mesh>
      </group>
      {COASTAL_TREES.map((tree, index) => (
        <mesh key={index} position={[tree.x, tree.scale * 0.35, tree.z]} scale={[tree.scale * 1.4, tree.scale * 0.65, tree.scale]} castShadow>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#5a6b53' : '#4e5d48'} roughness={1} />
        </mesh>
      ))}
      {CLOUD_CLUSTERS.map(([x, y, z, scale]) => (
        <group key={`${x}-${z}`} position={[x, y, z]} scale={scale}>
          {CLOUD_LOBES.map(([lobeX, lobeY, lobeZ, radius]) => (
            <mesh key={`${lobeX}-${lobeY}`} position={[lobeX, lobeY, lobeZ]} scale={[1.35, 0.8, 1]}>
              <sphereGeometry args={[radius, 16, 12]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.82} roughness={1} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
};

interface LaunchVehicleProps {
  rocketRef: RefObject<THREE.Group | null>;
  flamesRef: RefObject<THREE.Group | null>;
  launchLightRef: RefObject<THREE.PointLight | null>;
  hatchDoorRef: RefObject<THREE.Mesh | null>;
  boosterRefs: RefObject<(THREE.Group | null)[]>;
}

const LaunchVehicleDecals = () => {
  const textures = useSpacecraftTextures();
  if (!textures) return null;
  return (
    <group>
      <HullDecal texture={textures.worm} radius={1.34} height={4.6} centerY={10.6} />
      <HullDecal texture={textures.flag} radius={1.34} height={1.1} centerY={16.7} thetaStart={0.72} arc={0.62} />
      <HullDecal texture={textures.meatball} radius={1.24} height={1.3} centerY={22.25} />
    </group>
  );
};

const LaunchVehicle = ({ rocketRef, flamesRef, launchLightRef, hatchDoorRef, boosterRefs }: LaunchVehicleProps) => (
  <group ref={rocketRef} position={[0, 0, -5]}>
    <LaunchVehicleDecals />
    <mesh castShadow position={[0, 10.8, 0]}>
      <cylinderGeometry args={[1.25, 1.32, 20.4, 40]} />
      <meshStandardMaterial color="#c65b2b" roughness={0.55} metalness={0.28} />
    </mesh>
    <mesh castShadow position={[0, 22.25, 0]}>
      <cylinderGeometry args={[1.1, 1.25, 2.3, 40]} />
      <meshStandardMaterial color="#e8ecee" roughness={0.4} metalness={0.36} />
    </mesh>
    <mesh castShadow position={[0, 25, 0]}>
      <cylinderGeometry args={[0.82, 1.1, 3.2, 40]} />
      <meshStandardMaterial color="#d5dde2" roughness={0.4} metalness={0.45} />
    </mesh>
    <mesh castShadow position={[0, 28, 0]}>
      <coneGeometry args={[0.82, 2.6, 40]} />
      <meshStandardMaterial color="#eef1f2" roughness={0.4} metalness={0.3} />
    </mesh>
    <mesh position={[0, 29.9, 0]}>
      <cylinderGeometry args={[0.06, 0.18, 1.2, 16]} />
      <meshStandardMaterial color="#d9e0e5" metalness={0.7} roughness={0.3} />
    </mesh>
    <mesh ref={hatchDoorRef} position={[-0.98, CREW_LEVEL, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <circleGeometry args={[0.54, 32]} />
      <meshStandardMaterial color="#152230" metalness={0.65} roughness={0.32} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[-1.01, CREW_LEVEL, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <ringGeometry args={[0.5, 0.62, 32]} />
      <meshStandardMaterial color="#dce3e6" emissive="#8dd9ef" emissiveIntensity={0.35} metalness={0.7} roughness={0.32} side={THREE.DoubleSide} />
    </mesh>
    {[5, 15.5, 20.6].map((y) => (
      <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.27, 0.07, 10, 40]} />
        <meshStandardMaterial color="#dfe4e5" metalness={0.7} roughness={0.3} />
      </mesh>
    ))}
    {BOOSTER_POSITIONS.map((x, index) => (
      <group
        key={x}
        ref={(booster) => {
          boosterRefs.current[index] = booster;
        }}
        position={[x, 0, 0]}
      >
        <mesh castShadow position={[0, 10.75, 0]}>
          <cylinderGeometry args={[0.48, 0.52, 20, 28]} />
          <meshStandardMaterial color="#e3e7e9" roughness={0.4} metalness={0.32} />
        </mesh>
        <mesh castShadow position={[0, 22.1, 0]}>
          <coneGeometry args={[0.48, 2.4, 28]} />
          <meshStandardMaterial color="#eef1f2" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.3, 0.53, 1, 24]} />
          <meshStandardMaterial color="#343c43" metalness={0.8} roughness={0.3} />
        </mesh>
        {[4, 12, 19].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.5, 0.055, 8, 28]} />
            <meshStandardMaterial color="#606c75" metalness={0.75} roughness={0.32} />
          </mesh>
        ))}
      </group>
    ))}
    <mesh position={[0, 0.65, 0]}>
      <cylinderGeometry args={[0.65, 1.1, 1, 32]} />
      <meshStandardMaterial color="#343c43" metalness={0.8} roughness={0.3} />
    </mesh>
    <group ref={flamesRef} visible={false}>
      {[-1.75, 0, 1.75].map((x) => (
        <group key={x} position={[x, -2.8, 0]}>
          <mesh position={[0, -1.8, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.88, 10.8, 24]} />
            <meshBasicMaterial color="#ea580c" transparent opacity={0.38} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={[0, -1.1, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.68, 8.8, 24]} />
            <meshBasicMaterial color="#ff5500" transparent opacity={0.62} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={[0, 0.45, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.45, 6.2, 24]} />
            <meshBasicMaterial color="#fef08a" transparent opacity={0.88} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={[0, 1, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.28, 4.8, 20]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.96} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {[0.2, -1, -2.2, -3.4].map((y, diamondIndex) => (
            <mesh key={y} position={[0, y, 0]} scale={[1 - diamondIndex * 0.13, 1.8, 1 - diamondIndex * 0.13]}>
              <octahedronGeometry args={[0.32, 0]} />
              <meshBasicMaterial color={diamondIndex % 2 === 0 ? '#ffffff' : '#fef08a'} transparent opacity={0.92} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ))}
        </group>
      ))}
      <pointLight ref={launchLightRef} position={[0, -2, 0]} color="#ff7700" intensity={25} distance={85} decay={2} />
    </group>
  </group>
);

interface CinematicParticlesProps {
  phaseTime: RefObject<number>;
  rocketAltitude: RefObject<number>;
}

const CinematicParticles = ({ phaseTime, rocketAltitude }: CinematicParticlesProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    meshRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame((frameState) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const phase = useGameStore.getState().onboardingPhase;
    const time = phaseTime.current;
    const ignition = THREE.MathUtils.clamp((time - 15) / 0.7, 0, 1);
    PARTICLE_UNIFORMS.uColor.value.set(phase === 'MARS_LANDING' ? '#bb633c' : '#d5dde2');
    PARTICLE_UNIFORMS.uOpacity.value = (phase === 'TITLE_SCREEN' || phase === 'PRE_FLIGHT_DIALOGUE')
      ? 0.16
      : phase === 'MARS_LANDING'
        ? time < 3.5 ? 0.34 : 0.065
        : 0.24;

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 4;
      const seedA = PARTICLE_SEEDS[offset]!;
      const seedB = PARTICLE_SEEDS[offset + 1]!;
      const seedC = PARTICLE_SEEDS[offset + 2]!;
      const seedD = PARTICLE_SEEDS[offset + 3]!;
      const angle = seedB * Math.PI * 2;
      let x = 0;
      let y = -30;
      let z = 0;
      let scale = 0;

      if ((phase === 'TITLE_SCREEN' || phase === 'PRE_FLIGHT_DIALOGUE') || (phase === 'BOARDING_LAUNCH' && time < 15)) {
        const life = (time * 0.23 + seedA) % 1;
        const radius = 1.2 + life * 2.2;
        x = Math.cos(angle) * radius;
        y = 0.9 + seedC * 3 + life * 1.1;
        z = -5 + Math.sin(angle) * radius;
        scale = (0.16 + life * 0.48) * Math.sin(life * Math.PI);
      } else if (phase === 'BOARDING_LAUNCH' && ignition > 0) {
        const life = (time * 0.48 + seedA) % 1;
        const deluge = index % 3 === 0;
        const radius = deluge ? 2 + life * 8 : 0.8 + life * (4 + seedC * 4);
        x = Math.cos(angle) * radius;
        z = -5 + Math.sin(angle) * radius;
        y = deluge ? 0.25 + life * 3.2 : rocketAltitude.current * seedD * 0.75 + 0.3 - life * 2;
        scale = (deluge ? 0.65 + life * 2.4 : 0.4 + life * 1.8) * ignition;
      } else if (phase === 'MARS_LANDING') {
        const life = (time * 0.72 + seedA) % 1;
        const radius = 1.3 + life * (6 + seedC * 6);
        x = LANDER_X + Math.cos(angle + time * 0.35) * radius;
        z = LANDER_Z + Math.sin(angle + time * 0.35) * radius;
        y = getTerrainHeight(x, z) + 0.1 + Math.sin(life * Math.PI) * (0.5 + seedD);
        scale = (0.18 + life * 0.7) * Math.sin(life * Math.PI);
      }

      PARTICLE_TRANSFORM.position.set(x, y, z);
      PARTICLE_TRANSFORM.quaternion.copy(frameState.camera.quaternion);
      PARTICLE_TRANSFORM.rotateZ(angle);
      PARTICLE_TRANSFORM.scale.setScalar(Math.max(0, scale));
      PARTICLE_TRANSFORM.updateMatrix();
      mesh.setMatrixAt(index, PARTICLE_TRANSFORM.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={PARTICLE_UNIFORMS} vertexShader={PARTICLE_VERTEX_SHADER} fragmentShader={PARTICLE_FRAGMENT_SHADER} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
};

const LaunchSmokePlumes = ({ phaseTime, rocketAltitude }: CinematicParticlesProps) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < LAUNCH_SMOKE_COUNT; index += 1) {
      LAUNCH_SMOKE_TRANSFORM.position.set(0, -30, 0);
      LAUNCH_SMOKE_TRANSFORM.scale.setScalar(0);
      LAUNCH_SMOKE_TRANSFORM.updateMatrix();
      mesh.setMatrixAt(index, LAUNCH_SMOKE_TRANSFORM.matrix);
      mesh.setColorAt(index, DELUGE_STEAM_COLOR);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const isLaunch = useGameStore.getState().onboardingPhase === 'BOARDING_LAUNCH';
    const launchTime = phaseTime.current - 15;
    mesh.visible = isLaunch && launchTime >= 0;
    if (!mesh.visible) return;

    const ignition = THREE.MathUtils.smoothstep(launchTime, 0, 0.9);
    for (let index = 0; index < LAUNCH_SMOKE_COUNT; index += 1) {
      const offset = index * 5;
      const seedA = LAUNCH_SMOKE_SEEDS[offset]!;
      const seedB = LAUNCH_SMOKE_SEEDS[offset + 1]!;
      const seedC = LAUNCH_SMOKE_SEEDS[offset + 2]!;
      const seedD = LAUNCH_SMOKE_SEEDS[offset + 3]!;
      const seedE = LAUNCH_SMOKE_SEEDS[offset + 4]!;
      const angle = seedB * Math.PI * 2;
      let x = 0;
      let y = 0;
      let z = 0;
      let scale = 0;

      if (index < TRENCH_SMOKE_COUNT) {
        const life = (launchTime * (0.14 + seedE * 0.055) + seedA) % 1;
        const side = index % 2 === 0 ? -1 : 1;
        const spread = 1.4 + life * (7 + seedC * 8);
        scale = (1.2 + life * 7.3) * ignition;
        x = side * spread + Math.cos(angle + launchTime * 0.3) * life * 2.2;
        y = PAD_DECK_Y + scale * 0.24 + life * (1.1 + seedD * 1.8);
        z = -5 + (seedB - 0.5) * 8 + Math.sin(angle) * life * 5;
        LAUNCH_SMOKE_COLOR.copy(DELUGE_STEAM_COLOR).lerp(DELUGE_SMOKE_COLOR, life * 0.72);
      } else {
        const life = (launchTime / TRAIL_SMOKE_LIFETIME + seedA) % 1;
        const age = life * TRAIL_SMOKE_LIFETIME;
        const spawnTime = Math.max(0, launchTime - age);
        const spawnProgress = THREE.MathUtils.clamp(spawnTime / 8, 0, 1);
        const spawnAltitude = Math.pow(spawnProgress, 1.55) * DEEP_SPACE_ALTITUDE;
        const engineX = (index % 3 - 1) * 1.75;
        const engineSpread = THREE.MathUtils.lerp(1, 0.08, easeInOut(spawnProgress));
        scale = (0.35 + life * (3.8 + seedE * 1.4)) * ignition;
        x = engineX * engineSpread + Math.sin(angle + age * 0.8) * age * (0.16 + seedD * 0.2);
        y = Math.min(
          rocketAltitude.current + scale * 0.18,
          Math.max(PAD_DECK_Y + 0.1, spawnAltitude - age * (1.1 + seedD * 1.8) + scale * 0.18),
        );
        z = -5 + Math.cos(angle + age * 0.45) * age * 0.24 + (seedC - 0.5) * 0.8;
        if (life < 0.1) {
          LAUNCH_SMOKE_COLOR.copy(TRAIL_HOT_COLOR).lerp(TRAIL_FIRE_COLOR, life / 0.1);
        } else {
          LAUNCH_SMOKE_COLOR.copy(TRAIL_FIRE_COLOR).lerp(
            TRAIL_SMOKE_COLOR,
            THREE.MathUtils.smoothstep(life, 0.1, 0.58),
          );
        }
      }

      LAUNCH_SMOKE_TRANSFORM.position.set(x, y, z);
      LAUNCH_SMOKE_TRANSFORM.rotation.set(seedC * Math.PI, angle + launchTime * 0.08, seedD * Math.PI);
      LAUNCH_SMOKE_TRANSFORM.scale.set(
        scale * (0.86 + seedD * 0.32),
        scale * (0.68 + seedE * 0.3),
        scale * (0.88 + seedC * 0.3),
      );
      LAUNCH_SMOKE_TRANSFORM.updateMatrix();
      mesh.setMatrixAt(index, LAUNCH_SMOKE_TRANSFORM.matrix);
      mesh.setColorAt(index, LAUNCH_SMOKE_COLOR);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, LAUNCH_SMOKE_COUNT]} visible={false} frustumCulled={false}>
      <sphereGeometry args={[1, 12, 10]} />
      <shaderMaterial vertexShader={LAUNCH_SMOKE_VERTEX_SHADER} fragmentShader={LAUNCH_SMOKE_FRAGMENT_SHADER} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
};

const WhiteRoom = () => (
  <group position={[2.55, 0.12, 0]}>
    <mesh castShadow position={[0, 1.25, -0.82]}>
      <boxGeometry args={[2.15, 2.5, 0.12]} />
      <meshStandardMaterial color="#f4f7f7" roughness={0.42} metalness={0.18} />
    </mesh>
    <mesh castShadow position={[0, 2.48, 0]}>
      <boxGeometry args={[2.15, 0.14, 1.75]} />
      <meshStandardMaterial color="#f8fafc" roughness={0.38} metalness={0.15} />
    </mesh>
    <mesh position={[0, 0.03, 0]}>
      <boxGeometry args={[2.15, 0.12, 1.75]} />
      <meshStandardMaterial color="#cbd5dc" metalness={0.5} roughness={0.35} />
    </mesh>
    <mesh position={[0, 1.25, 0.84]}>
      <boxGeometry args={[1.9, 2.15, 0.04]} />
      <meshPhysicalMaterial color="#d9f6ff" transparent opacity={0.22} roughness={0.08} metalness={0.05} depthWrite={false} />
    </mesh>
    <mesh position={[0, 2.28, 0]}>
      <boxGeometry args={[1.5, 0.05, 0.35]} />
      <meshBasicMaterial color="#e8fcff" />
    </mesh>
    <pointLight position={[0, 1.9, 0]} color="#e6faff" intensity={10} distance={5} decay={2} />
  </group>
);

const Spaceport = ({ armRef, elevatorRef }: {
  armRef: RefObject<THREE.Group | null>;
  elevatorRef: RefObject<THREE.Group | null>;
}) => (
  <group>
    <EarthLandscape />
    {[-4.4, 4.4].map((x) => (
      <mesh key={x} receiveShadow position={[x, PAD_DECK_Y - 0.25, -4]}>
        <boxGeometry args={[7.6, 0.5, 18]} />
        <meshStandardMaterial color="#4b5358" roughness={0.9} metalness={0.08} />
      </mesh>
    ))}
    <group
      position={[(WALKWAY_START.x + WALKWAY_END.x) * 0.5, 0, (WALKWAY_START.z + WALKWAY_END.z) * 0.5]}
      rotation={[0, PAD_WALKWAY_ANGLE, 0]}
    >
      <mesh receiveShadow position={[0, (PAD_DECK_Y - 0.06) * 0.5, 0]}>
        <boxGeometry args={[3.6, PAD_DECK_Y - 0.06, WALKWAY_LENGTH]} />
        <meshStandardMaterial color="#46545d" metalness={0.62} roughness={0.48} />
      </mesh>
      <mesh receiveShadow position={[0, PAD_DECK_Y - 0.03, 0]}>
        <boxGeometry args={[3.6, 0.06, WALKWAY_LENGTH]} />
        <meshStandardMaterial color="#596168" roughness={0.9} metalness={0.08} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      {[-1.69, 1.69].map((x) => (
        <mesh key={x} position={[x, PAD_DECK_Y - 0.006, 0]}>
          <boxGeometry args={[0.18, 0.012, WALKWAY_LENGTH]} />
          <meshStandardMaterial color="#e6c34d" emissive="#8a6a14" emissiveIntensity={0.18} roughness={0.72} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </group>
    <mesh position={[0, 0.04, -5]}>
      <boxGeometry args={[2.2, 0.16, 13]} />
      <meshStandardMaterial color="#11181e" roughness={0.98} />
    </mesh>
    {[-1.25, 1.25].map((x) => (
      <mesh key={x} position={[x, 0.3, -5]}>
        <boxGeometry args={[0.22, 0.65, 13]} />
        <meshStandardMaterial color="#737c80" roughness={0.85} metalness={0.12} />
      </mesh>
    ))}
    <group position={[-2.8, 0, 7.5]}>
      <mesh receiveShadow position={[0, PAD_DECK_Y * 0.5, 0]}>
        <cylinderGeometry args={[2.8, 3, PAD_DECK_Y, 48]} />
        <meshStandardMaterial color="#29343d" roughness={0.9} metalness={0.08} />
      </mesh>
      <mesh position={[0, PAD_DECK_Y + 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.77, 0.027, 8, 64]} />
        <meshStandardMaterial color="#e2e8ed" roughness={0.66} metalness={0.12} />
      </mesh>
    </group>
    <group position={[-4.4, 0, -5]}>
      {[-0.9, 0.9].map((x) => [-0.9, 0.9].map((z) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, TOWER_HEIGHT / 2, z]}>
          <boxGeometry args={[0.26, TOWER_HEIGHT, 0.26]} />
          <meshStandardMaterial color="#7c898f" metalness={0.7} roughness={0.35} />
        </mesh>
      )))}
      {GANTRY_LEVELS.map((y, levelIndex) => (
        <group key={y} position={[0, y, 0]}>
          <mesh>
            <boxGeometry args={[2.2, 0.18, 2.2]} />
            <meshStandardMaterial color="#5f6e77" metalness={0.6} roughness={0.42} />
          </mesh>
          {[-0.96, 0.96].map((z) => (
            <mesh key={z} position={[0, 1.2, z]} rotation={[0, 0, levelIndex % 2 === 0 ? 0.77 : -0.77]}>
              <boxGeometry args={[3.15, 0.1, 0.1]} />
              <meshStandardMaterial color="#b6c1c7" metalness={0.72} roughness={0.32} />
            </mesh>
          ))}
          <mesh position={[0.96, 1.2, 0]} rotation={[0.77, 0, 0]}>
            <boxGeometry args={[0.1, 3.15, 0.1]} />
            <meshStandardMaterial color="#9eabb2" metalness={0.72} roughness={0.32} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, TOWER_HEIGHT + 0.25, 0]}>
        <boxGeometry args={[2.5, 0.5, 2.5]} />
        <meshStandardMaterial color="#a7b1b7" metalness={0.58} roughness={0.42} />
      </mesh>
      <mesh position={[0, TOWER_HEIGHT + 1.1, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 1.4, 10]} />
        <meshStandardMaterial color="#a7b1b7" metalness={0.72} />
      </mesh>
      <mesh position={[0, TOWER_HEIGHT + 1.85, 0]}>
        <sphereGeometry args={[0.12, 12, 8]} />
        <meshBasicMaterial color="#fc3d21" />
      </mesh>
    </group>
    {[-5.25, -3.55].map((x) => (
      <mesh key={x} position={[x, TOWER_HEIGHT / 2, -3.83]}>
        <boxGeometry args={[0.07, TOWER_HEIGHT, 0.07]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={2.2} metalness={0.4} roughness={0.25} />
      </mesh>
    ))}
    <group ref={elevatorRef} position={[-4.4, ELEVATOR_BASE_Y, -3.85]}>
      <mesh castShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[1.65, 0.16, 1.55]} />
        <meshStandardMaterial color="#7f8e96" metalness={0.75} roughness={0.28} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[1.5, 2.3, 1.4]} />
        <meshPhysicalMaterial color="#b8eaf2" transparent opacity={0.2} roughness={0.08} metalness={0.12} depthWrite={false} />
      </mesh>
      {[-0.75, 0.75].map((x) => [-0.68, 0.68].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 1.25, z]}>
          <boxGeometry args={[0.08, 2.5, 0.08]} />
          <meshStandardMaterial color="#d7e2e6" metalness={0.8} roughness={0.25} />
        </mesh>
      )))}
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[1.65, 0.14, 1.55]} />
        <meshStandardMaterial color="#a9b8bf" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.35, 0.72]}>
        <boxGeometry args={[1.25, 0.06, 0.04]} />
        <meshBasicMaterial color="#a5f3fc" />
      </mesh>
    </group>
    <group ref={armRef} position={[-4.2, CREW_LEVEL, -5]}>
      <mesh castShadow position={[1.75, 0, 0]}>
        <boxGeometry args={[4.8, 0.18, 1.5]} />
        <meshStandardMaterial color="#89949b" metalness={0.65} roughness={0.4} />
      </mesh>
      {[-0.72, 0.72].map((z) => (
        <group key={z}>
          <mesh position={[1.75, 0.8, z]}>
            <boxGeometry args={[4.8, 0.08, 0.08]} />
            <meshStandardMaterial color="#c3cdd1" metalness={0.65} roughness={0.35} />
          </mesh>
          {[-0.2, 0.9, 2, 3.1].map((x) => (
            <mesh key={x} position={[x, 0.42, z]} rotation={[0, 0, 0.55]}>
              <boxGeometry args={[1.15, 0.06, 0.06]} />
              <meshStandardMaterial color="#aebcc3" metalness={0.7} roughness={0.32} />
            </mesh>
          ))}
        </group>
      ))}
      <WhiteRoom />
    </group>
    {LIGHTNING_TOWERS.map(([x, z]) => (
      <group key={`${x}-${z}`} position={[x, 0, z]}>
        <mesh castShadow position={[0, 17, 0]}>
          <cylinderGeometry args={[0.1, 0.32, 34, 10]} />
          <meshStandardMaterial color="#85929a" metalness={0.78} roughness={0.32} />
        </mesh>
        <mesh position={[0, 35.2, 0]}>
          <cylinderGeometry args={[0.025, 0.08, 2.4, 8]} />
          <meshStandardMaterial color="#c7d2d8" metalness={0.8} />
        </mesh>
        <mesh position={[0, 34.1, 0]}>
          <sphereGeometry args={[0.13, 10, 8]} />
          <meshBasicMaterial color="#fc3d21" />
        </mesh>
      </group>
    ))}
    {FLOODLIGHTS.map(([x, z]) => (
      <group key={`${x}-${z}`} position={[x, 0, z]}>
        <mesh position={[0, 4.5, 0]}>
          <cylinderGeometry args={[0.12, 0.2, 9, 12]} />
          <meshStandardMaterial color="#68757e" metalness={0.65} roughness={0.4} />
        </mesh>
        <mesh position={[0, 9, 0]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[1.6, 0.42, 0.6]} />
          <meshStandardMaterial color="#dceafa" emissive="#c7e0ff" emissiveIntensity={3} />
        </mesh>
      </group>
    ))}
    <spotLight position={[-9, 9, 4]} color="#c5dcff" intensity={380} distance={65} angle={0.6} penumbra={0.65} />
    <spotLight position={[9, 9, 4]} color="#ffe3c2" intensity={350} distance={65} angle={0.6} penumbra={0.65} />
  </group>
);

export const LaunchComplexBackdrop = ({ position = [0, 0, 0], scale = 1 }: {
  position?: [number, number, number];
  scale?: number;
}) => {
  const armRef = useRef<THREE.Group>(null);
  const elevatorRef = useRef<THREE.Group>(null);
  const rocketRef = useRef<THREE.Group>(null);
  const flamesRef = useRef<THREE.Group>(null);
  const launchLightRef = useRef<THREE.PointLight>(null);
  const hatchDoorRef = useRef<THREE.Mesh>(null);
  const boosterRefs = useRef<(THREE.Group | null)[]>([]);

  return (
    <group position={position} scale={scale}>
      <Spaceport armRef={armRef} elevatorRef={elevatorRef} />
      <LaunchVehicle rocketRef={rocketRef} flamesRef={flamesRef} launchLightRef={launchLightRef} hatchDoorRef={hatchDoorRef} boosterRefs={boosterRefs} />
    </group>
  );
};

const animateWalk = (pose: NasaSuitPose, time: number, amount: number): void => {
  const stride = Math.sin(time * 4.4);
  pose.leftHip = stride * 0.42 * amount;
  pose.rightHip = -stride * 0.42 * amount;
  pose.leftKnee = 0.08 + Math.max(0, -stride) * 0.65 * amount;
  pose.rightKnee = 0.08 + Math.max(0, stride) * 0.65 * amount;
  pose.leftShoulder = -stride * 0.38 * amount;
  pose.rightShoulder = stride * 0.38 * amount;
  pose.leftElbow = -0.32;
  pose.rightElbow = -0.32;
  pose.hipBob = Math.abs(stride) * 0.015 * amount;
  pose.torsoPitch = 0.06 * amount;
};

export const OnboardingCutscene = () => {
  const phase = useGameStore((state) => state.onboardingPhase);
  const commanderRef = useRef<NasaSuitRigHandle>(null);
  const cadetRef = useRef<NasaSuitRigHandle>(null);
  const commanderGroupRef = useRef<THREE.Group>(null);
  const cadetGroupRef = useRef<THREE.Group>(null);
  const rocketRef = useRef<THREE.Group>(null);
  const landerRef = useRef<THREE.Group>(null);
  const flamesRef = useRef<THREE.Group>(null);
  const launchLightRef = useRef<THREE.PointLight>(null);
  const thrustersRef = useRef<THREE.Group>(null);
  const stairwayRef = useRef<THREE.Group>(null);
  const airlockDoorPivotRef = useRef<THREE.Group>(null);
  const airlockSealMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const armRef = useRef<THREE.Group>(null);
  const elevatorRef = useRef<THREE.Group>(null);
  const hatchDoorRef = useRef<THREE.Mesh>(null);
  const spaceFogRef = useRef<THREE.FogExp2>(null);
  const backgroundRef = useRef<THREE.Color>(null);
  const skyRef = useRef<THREE.Group>(null);
  const starsRef = useRef<THREE.Group>(null);
  const boosterRefs = useRef<(THREE.Group | null)[]>([]);
  const phaseTime = useRef(0);
  const previousPhase = useRef(phase);
  const previousStage = useRef<OnboardingStage>(1);
  const rocketAltitude = useRef(0);
  const commanderPose = useRef(createSuitPose());
  const cadetPose = useRef(createSuitPose());
  const cameraReady = useRef(false);
  const rocketSoundStarted = useRef(false);
  const marsLandingSoundStarted = useRef(false);
  const touchdownPlayed = useRef(false);
  const titlePointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      titlePointer.current.x = THREE.MathUtils.clamp(event.clientX / window.innerWidth * 2 - 1, -1, 1);
      titlePointer.current.y = THREE.MathUtils.clamp(1 - event.clientY / window.innerHeight * 2, -1, 1);
    };
    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useEffect(() => {
    if (phase !== 'BOARDING_LAUNCH') {
      rocketSoundStarted.current = false;
      stopRocketLaunchSound();
    }
    if (phase !== 'MARS_LANDING') {
      marsLandingSoundStarted.current = false;
      touchdownPlayed.current = false;
      stopMarsEntryAndRetroSound();
    }
  }, [phase]);

  useEffect(() => () => {
    stopRocketLaunchSound();
    stopMarsEntryAndRetroSound();
  }, []);

  useFrame((state, delta) => {
    const gameState = useGameStore.getState();
    const frameDelta = Math.min(delta, 0.05);
    if (previousPhase.current !== gameState.onboardingPhase) {
      previousPhase.current = gameState.onboardingPhase;
      phaseTime.current = gameState.onboardingPhase === 'BOARDING_LAUNCH' ? 2 : 0;
      cameraReady.current = gameState.onboardingPhase === 'PRE_FLIGHT_DIALOGUE';
    }
    phaseTime.current += delta;
    const time = phaseTime.current;
    const elapsed = state.clock.elapsedTime;
    const isTitle = gameState.onboardingPhase === 'TITLE_SCREEN';
    const isDialogue = gameState.onboardingPhase === 'PRE_FLIGHT_DIALOGUE';
    const isPreLaunch = isTitle || isDialogue;
    const isLaunch = gameState.onboardingPhase === 'BOARDING_LAUNCH';
    const isLanding = gameState.onboardingPhase === 'MARS_LANDING';
    const stage: OnboardingStage = isLanding
      ? time >= 5.2 ? 7 : 6
      : isLaunch
        ? time < 2 ? 1 : time < 6 ? 2 : time < 10 ? 3 : time < 15 ? 4 : 5
        : 1;
    if (gameState.onboardingStage !== stage) gameState.setOnboardingStage(stage);
    if (previousStage.current !== stage) {
      previousStage.current = stage;
      cameraReady.current = isLanding;
    }

    const elevatorProgress = isLaunch ? easeInOut((time - 6) / 4) : 0;
    const elevatorY = THREE.MathUtils.lerp(ELEVATOR_BASE_Y, CREW_LEVEL, elevatorProgress);
    if (elevatorRef.current) elevatorRef.current.position.y = elevatorY;
    if (commanderGroupRef.current) {
      commanderGroupRef.current.visible = isPreLaunch || (isLaunch && time < 6);
      commanderGroupRef.current.rotation.y = THREE.MathUtils.damp(
        commanderGroupRef.current.rotation.y,
        isDialogue ? 1.33 : 1,
        5,
        frameDelta,
      );
    }

    let cadetVisible = isPreLaunch || isLaunch || (isLanding && time >= 5.2);
    let walkAmount = 0;
    if (cadetGroupRef.current) {
      if (isPreLaunch || (isLaunch && time < 2)) {
        cadetGroupRef.current.position.set(CADET_START_X, PAD_DECK_Y, CADET_START_Z);
        cadetGroupRef.current.rotation.y = isDialogue ? -1.81 : -0.8;
      } else if (isLaunch && time < 6) {
        const walk = THREE.MathUtils.clamp((time - 2) / 4, 0, 1);
        const z = THREE.MathUtils.lerp(CADET_START_Z, -3.85, walk);
        cadetGroupRef.current.position.set(
          THREE.MathUtils.lerp(CADET_START_X, -4.4, walk),
          PAD_DECK_Y,
          z,
        );
        const targetHeading = Math.atan2(-4.4 - CADET_START_X, -3.85 - CADET_START_Z);
        cadetGroupRef.current.rotation.y = THREE.MathUtils.lerp(-0.8, targetHeading, easeInOut((time - 2) / 0.6));
        walkAmount = Math.min(1, (time - 2) * 2, (6 - time) * 2);
      } else if (isLaunch && time < 10) {
        cadetGroupRef.current.position.set(-4.4, elevatorY + ELEVATOR_FOOT_OFFSET, -3.85);
        cadetGroupRef.current.rotation.y = Math.PI;
      } else if (isLaunch && time < 15) {
        const ingressTime = time - 10;
        if (ingressTime < 0.6) {
          const exitProgress = easeInOut(ingressTime / 0.6);
          cadetGroupRef.current.position.set(
            THREE.MathUtils.lerp(-4.4, -4.2, exitProgress),
            CREW_LEVEL + 0.16,
            THREE.MathUtils.lerp(-3.85, -5, exitProgress),
          );
        } else if (ingressTime < 3) {
          const bridgeProgress = THREE.MathUtils.clamp((ingressTime - 0.6) / 2.4, 0, 1);
          cadetGroupRef.current.position.set(
            THREE.MathUtils.lerp(-4.2, -1.65, bridgeProgress),
            CREW_LEVEL + 0.16,
            -5,
          );
        } else {
          const hatchProgress = easeInOut((ingressTime - 3) / 1);
          cadetGroupRef.current.position.set(
            THREE.MathUtils.lerp(-1.65, -0.25, hatchProgress),
            CREW_LEVEL + 0.16,
            -5,
          );
        }
        cadetGroupRef.current.rotation.y = Math.PI / 2;
        walkAmount = ingressTime < 4 ? 0.7 : 0;
        cadetVisible = ingressTime < 4;
      } else if (isLanding && time >= 5.2) {
        if (time < 5.65) {
          const exitProgress = easeInOut((time - 5.2) / 0.45);
          cadetGroupRef.current.position.set(
            LANDER_X,
            LANDING_Y + LANDER_HATCH_HEIGHT,
            THREE.MathUtils.lerp(13.25, STAIR_TOP_Z, exitProgress),
          );
        } else if (time < 7.2) {
          const stairProgress = THREE.MathUtils.clamp((time - 5.65) / 1.55, 0, 1) * 8;
          const stepIndex = Math.min(7, Math.floor(stairProgress));
          const stepProgress = (stepIndex + easeInOut(stairProgress - stepIndex)) / 8;
          cadetGroupRef.current.position.set(
            LANDER_X,
            THREE.MathUtils.lerp(LANDING_Y + LANDER_HATCH_HEIGHT, STAIR_GROUND_Y, stepProgress),
            THREE.MathUtils.lerp(STAIR_TOP_Z, STAIR_BOTTOM_Z, stepProgress),
          );
        } else {
          const groundProgress = easeInOut((time - 7.2) / 1.3);
          const z = THREE.MathUtils.lerp(STAIR_BOTTOM_Z, 9.2, groundProgress);
          cadetGroupRef.current.position.set(LANDER_X, getTerrainHeight(LANDER_X, z), z);
        }
        cadetGroupRef.current.rotation.y = Math.PI;
        walkAmount = time < 8.4 ? 0.72 : 0;
        cadetVisible = true;
      } else {
        cadetVisible = false;
      }
      cadetGroupRef.current.visible = cadetVisible;
    }

    const sendoff = isPreLaunch || (isLaunch && time < 6);
    commanderPose.current.headYaw = -0.18 + Math.sin(elapsed * 0.7) * 0.08;
    commanderPose.current.headPitch = 0.04 + Math.sin(elapsed * 1.1) * 0.045;
    commanderPose.current.rightShoulder = sendoff ? -1.05 + Math.sin(elapsed * 3) * 0.22 : -0.2;
    commanderPose.current.rightElbow = -0.32;
    commanderPose.current.leftShoulder = Math.sin(elapsed * 0.9) * 0.04;
    commanderPose.current.torsoPitch = Math.sin(elapsed * 1.4) * 0.014;
    commanderRef.current?.applyPose(commanderPose.current, frameDelta);
    animateWalk(cadetPose.current, time, walkAmount);
    cadetPose.current.headYaw = isPreLaunch ? 0.28 + Math.sin(elapsed * 0.65) * 0.05 : 0;
    cadetPose.current.headPitch = isPreLaunch ? 0.05 + Math.sin(elapsed * 0.8) * 0.03 : 0;
    if (isDialogue) {
      cadetPose.current.rightShoulder = -0.25 + Math.sin(elapsed * 2.2) * 0.12;
      cadetPose.current.leftShoulder = 0.08 + Math.sin(elapsed * 1.4) * 0.04;
    }
    cadetRef.current?.applyPose(cadetPose.current, frameDelta);

    if (armRef.current) {
      const retract = isLaunch ? easeInOut((time - 14) / 1) : 0;
      armRef.current.rotation.y = -retract * THREE.MathUtils.degToRad(75);
      armRef.current.rotation.z = isLaunch && time >= 10 && time < 14 ? Math.sin(elapsed * 1.2) * 0.006 : 0;
    }
    if (hatchDoorRef.current) {
      const hatchClosure = isLaunch ? easeInOut((time - 13.8) / 0.6) : 0;
      const hatchOpen = isLaunch && time >= 10 && time < 13.8;
      hatchDoorRef.current.scale.y = hatchOpen ? 0.12 : THREE.MathUtils.lerp(0.12, 1, hatchClosure);
    }

    const launchProgress = isLaunch ? THREE.MathUtils.clamp((time - 15) / 8, 0, 1) : 0;
    rocketAltitude.current = Math.pow(launchProgress, 1.55) * DEEP_SPACE_ALTITUDE;
    if (rocketRef.current) {
      rocketRef.current.position.y = rocketAltitude.current;
      rocketRef.current.scale.setScalar(THREE.MathUtils.lerp(1, 0.08, easeInOut(launchProgress)));
    }
    if (isLaunch && time >= 15 && rocketRef.current) {
      if (!rocketSoundStarted.current) {
        rocketSoundStarted.current = true;
        startRocketLaunchSound();
      }
      updateRocketLaunchDistance(state.camera.position.distanceTo(rocketRef.current.position));
    }
    const spaceBlend = isLaunch
      ? THREE.MathUtils.clamp((rocketAltitude.current - 55) / 180, 0, 1)
      : 0;
    if (backgroundRef.current) backgroundRef.current.copy(EARTH_BACKGROUND).lerp(SPACE_BACKGROUND, spaceBlend);
    if (spaceFogRef.current) {
      spaceFogRef.current.color.copy(EARTH_FOG).lerp(SPACE_FOG, spaceBlend);
      const fogTarget = THREE.MathUtils.lerp(0.0025, 0.00015, launchProgress);
      spaceFogRef.current.density = THREE.MathUtils.damp(spaceFogRef.current.density, fogTarget, 3, frameDelta);
    }
    if (skyRef.current) skyRef.current.visible = isPreLaunch || (isLaunch && rocketAltitude.current < 180);
    if (starsRef.current) starsRef.current.visible = isLaunch && spaceBlend > 0.08;
    if (flamesRef.current) {
      flamesRef.current.visible = isLaunch && time >= 15;
      flamesRef.current.scale.y = 0.65 + launchProgress * 0.8 + Math.sin(elapsed * 35) * 0.06;
    }
    if (launchLightRef.current) {
      launchLightRef.current.intensity = 25 * (0.9 + Math.sin(elapsed * 37) * 0.06 + Math.sin(elapsed * 23) * 0.04);
    }
    const separation = isLaunch ? easeInOut((time - 19.5) / 1.2) : 0;
    for (let index = 0; index < boosterRefs.current.length; index += 1) {
      const booster = boosterRefs.current[index];
      if (!booster) continue;
      const side = index === 0 ? -1 : 1;
      booster.position.set(side * (1.75 + separation * 4.5), -separation * 6, 0);
      booster.rotation.z = side * separation * 0.32;
    }

    if (landerRef.current) {
      const descent = 1 - easeInOut(time / 3.5);
      const currentDescentY = LANDING_Y + descent * 45;
      landerRef.current.position.y = Math.max(LANDING_Y, currentDescentY);
      landerRef.current.rotation.y = Math.PI + Math.sin(time * 0.65) * 0.08 * descent;
      if (isLanding) {
        if (!marsLandingSoundStarted.current) {
          marsLandingSoundStarted.current = true;
          startMarsEntryAndRetroSound();
        }
        const heightAboveGround = Math.max(0, landerRef.current.position.y - LANDING_Y);
        updateMarsLandingAudio(heightAboveGround);
        if (heightAboveGround <= 0.05 && !touchdownPlayed.current) {
          touchdownPlayed.current = true;
          playMarsTouchdownThud();
          stopMarsEntryAndRetroSound();
        }
      }
    }
    const retroThrottle = isLanding ? 1 - easeInOut((time - 3.5) / 0.65) : 0;
    if (thrustersRef.current) {
      thrustersRef.current.visible = isLanding && retroThrottle > 0.015;
      thrustersRef.current.scale.y = Math.max(0.001, retroThrottle) * (0.85 + Math.sin(elapsed * 30) * 0.12);
    }
    if (stairwayRef.current) {
      const deployment = isLanding ? easeInOut((time - 3.5) / 1.7) : 0;
      stairwayRef.current.visible = isLanding && time >= 3.5;
      stairwayRef.current.rotation.x = THREE.MathUtils.lerp(-1.18, 0, deployment);
      stairwayRef.current.scale.z = THREE.MathUtils.lerp(0.15, 1, deployment);
    }
    const airlockOpen = isLanding && time >= 4.4 && time < 7.2;
    if (airlockDoorPivotRef.current) {
      airlockDoorPivotRef.current.rotation.y = THREE.MathUtils.damp(
        airlockDoorPivotRef.current.rotation.y,
        airlockOpen ? 1.65 : 0,
        9,
        frameDelta,
      );
    }
    if (airlockSealMaterialRef.current) {
      const sealedColor = airlockOpen ? '#ef4444' : '#4ade80';
      const sealedGlow = airlockOpen ? '#dc2626' : '#22c55e';
      airlockSealMaterialRef.current.color.set(sealedColor);
      airlockSealMaterialRef.current.emissive.set(sealedGlow);
    }

    if (isTitle && gameState.gameStatus === 'MENU') {
      const mouseX = titlePointer.current.x;
      const mouseY = titlePointer.current.y;
      CAMERA_DESTINATION.set(
        -14 + mouseX * 8.5,
        THREE.MathUtils.clamp(15 + mouseY * 4.5, 4, 26),
        42 - Math.abs(mouseX) * 2.5,
      );
      CAMERA_LOOK_TARGET.set(-10 + mouseX * 1.8, 16 + mouseY * 1.3, 0);
    } else if (isDialogue) {
      CAMERA_DESTINATION.set(-3.2, 2.3, 11.5);
      CAMERA_LOOK_TARGET.set(-2.8, 1.47, 7.35);
    } else if (stage === 1) {
      const zoom = easeInOut(time / 2);
      CAMERA_DESTINATION.set(
        THREE.MathUtils.lerp(-22, 2.6, zoom),
        THREE.MathUtils.lerp(14, 2.8, zoom),
        THREE.MathUtils.lerp(38, 11.65, zoom),
      );
      CAMERA_LOOK_TARGET.set(
        THREE.MathUtils.lerp(0, -2.5, zoom),
        THREE.MathUtils.lerp(16, 1.57, zoom),
        THREE.MathUtils.lerp(0, 6.85, zoom),
      );
    } else if (stage === 2) {
      const cadet = cadetGroupRef.current;
      CAMERA_DESTINATION.set((cadet?.position.x ?? -2) + 4, 2.8, (cadet?.position.z ?? 2) + 5.2);
      CAMERA_LOOK_TARGET.set(cadet?.position.x ?? -2, (cadet?.position.y ?? PAD_DECK_Y) + 1, cadet?.position.z ?? 2);
    } else if (stage === 3) {
      CAMERA_DESTINATION.set(4.5, elevatorY + 3.4, 6.5);
      CAMERA_LOOK_TARGET.set(-2.1, elevatorY + 2.2, -5);
    } else if (stage === 4) {
      CAMERA_DESTINATION.set(5.5, CREW_LEVEL + 4.2, 3.5);
      CAMERA_LOOK_TARGET.set(-1.65, CREW_LEVEL + 0.9, -5);
    } else if (stage === 5) {
      const tracking = easeInOut(launchProgress);
      CAMERA_DESTINATION.set(
        THREE.MathUtils.lerp(15, 11, tracking),
        THREE.MathUtils.lerp(7, 12, tracking),
        THREE.MathUtils.lerp(20, 16, tracking),
      );
      CAMERA_LOOK_TARGET.set(0, 8 + rocketAltitude.current * 0.82, -5);
    } else if (time < 3.5) {
      const entry = easeInOut(time / 3.5);
      CAMERA_DESTINATION.set(
        THREE.MathUtils.lerp(22, 14, entry),
        LANDING_Y + THREE.MathUtils.lerp(24, 6.5, entry),
        THREE.MathUtils.lerp(36, 28, entry),
      );
      CAMERA_LOOK_TARGET.set(LANDER_X, (landerRef.current?.position.y ?? LANDING_Y) + 2.8, LANDER_Z);
    } else {
      const framing = easeInOut((time - 3.5) / 1.7);
      CAMERA_DESTINATION.set(
        THREE.MathUtils.lerp(14, 4.5, framing),
        LANDING_Y + THREE.MathUtils.lerp(6.5, 2.8, framing),
        THREE.MathUtils.lerp(28, 6.5, framing),
      );
      CAMERA_LOOK_TARGET.set(
        LANDER_X,
        LANDING_Y + THREE.MathUtils.lerp(2.8, 1.4, framing),
        THREE.MathUtils.lerp(LANDER_Z, 11.5, framing),
      );
    }

    const cameraDelta = Math.min(delta, 0.2);
    const cameraBlend = cameraReady.current ? 1 - Math.exp(-cameraDelta * (isDialogue ? 2.5 : 4.5)) : 1;
    if (isTitle) {
      state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, CAMERA_DESTINATION.x, 4.5, cameraDelta);
      state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, CAMERA_DESTINATION.y, 4.5, cameraDelta);
      state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, CAMERA_DESTINATION.z, 4.5, cameraDelta);
      CAMERA_LOOK_SMOOTH.x = THREE.MathUtils.damp(CAMERA_LOOK_SMOOTH.x, CAMERA_LOOK_TARGET.x, 7, cameraDelta);
      CAMERA_LOOK_SMOOTH.y = THREE.MathUtils.damp(CAMERA_LOOK_SMOOTH.y, CAMERA_LOOK_TARGET.y, 7, cameraDelta);
      CAMERA_LOOK_SMOOTH.z = THREE.MathUtils.damp(CAMERA_LOOK_SMOOTH.z, CAMERA_LOOK_TARGET.z, 7, cameraDelta);
    } else {
      state.camera.position.lerp(CAMERA_DESTINATION, cameraBlend);
      CAMERA_LOOK_SMOOTH.lerp(CAMERA_LOOK_TARGET, cameraReady.current ? 1 - Math.exp(-cameraDelta * (isDialogue ? 3.5 : 7)) : 1);
    }
    state.camera.lookAt(CAMERA_LOOK_SMOOTH);
    cameraReady.current = true;
    if (state.camera instanceof THREE.PerspectiveCamera) {
      state.camera.fov = THREE.MathUtils.damp(state.camera.fov, isPreLaunch ? 52 : isLanding ? 55 : 50, 5, frameDelta);
      state.camera.updateProjectionMatrix();
    }

    if (isLaunch && time >= 23) gameState.advanceOnboardingPhase();
    if (isLanding && time >= 8.5) gameState.startGame();
  });

  return (
    <>
      {phase !== 'MARS_LANDING' && (
        <>
          <color ref={backgroundRef} attach="background" args={['#5da9e9']} />
          <fogExp2 ref={spaceFogRef} attach="fog" args={['#c8d6df', 0.0025]} />
          <group ref={skyRef}>
            <Sky sunPosition={[80, 45, 60]} turbidity={2.5} rayleigh={1.2} distance={450000} />
          </group>
          <group ref={starsRef} visible={false}>
            <Stars radius={450} depth={220} count={6500} factor={4} saturation={0} fade speed={0.25} />
          </group>
          <ambientLight intensity={1.05} color="#dceeff" />
          <hemisphereLight args={['#dceeff', '#68735e', 1.0]} />
          <directionalLight castShadow position={[28, 42, 18]} color="#fff4dd" intensity={3.2} shadow-mapSize={[2048, 2048]} shadow-camera-left={-22} shadow-camera-right={22} shadow-camera-top={25} shadow-camera-bottom={-15} />
          <Spaceport armRef={armRef} elevatorRef={elevatorRef} />
          <LaunchVehicle rocketRef={rocketRef} flamesRef={flamesRef} launchLightRef={launchLightRef} hatchDoorRef={hatchDoorRef} boosterRefs={boosterRefs} />
        </>
      )}
      <group ref={commanderGroupRef} position={[COMMANDER_START.x, PAD_DECK_Y, COMMANDER_START.z]} rotation={[0, 1, 0]}>
        <NasaSuitRig ref={commanderRef} scale={1.08} isCommander />
      </group>
      <group ref={cadetGroupRef} position={[CADET_START_X, PAD_DECK_Y, CADET_START_Z]} rotation={[0, -0.8, 0]}>
        <NasaSuitRig ref={cadetRef} scale={0.92} />
      </group>
      {phase === 'MARS_LANDING' && (
        <>
          <color attach="background" args={['#d98b5f']} />
          <fogExp2 attach="fog" args={['#c97a4e', 0.008]} />
          <directionalLight castShadow position={[60, 45, 40]} intensity={2.4} color="#ffe4c4" />
          <hemisphereLight args={['#d98b5f', '#8c3b20', 0.95]} />
          <ambientLight intensity={0.65} color="#ffd8b8" />
          <directionalLight position={[-50, 20, -40]} intensity={0.8} color="#e07a47" />
          <MarsLanderModel
            groundY={LANDING_Y}
            stairGroundY={STAIR_GROUND_Y}
            deployed={false}
            landerRef={landerRef}
            thrustersRef={thrustersRef}
            stairwayRef={stairwayRef}
            doorPivotRef={airlockDoorPivotRef}
            sealMaterialRef={airlockSealMaterialRef}
          />
          <LanderVentMist groundY={LANDING_Y} active phaseTime={phaseTime} />
        </>
      )}
      <CinematicParticles phaseTime={phaseTime} rocketAltitude={rocketAltitude} />
      <LaunchSmokePlumes phaseTime={phaseTime} rocketAltitude={rocketAltitude} />
    </>
  );
};
