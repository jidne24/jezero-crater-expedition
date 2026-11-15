import { useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Stars } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import type { VictoryPhase } from '../../store/useGameStore';
import {
  playMarsTouchdownThud,
  playStationComplete,
  startMarsEntryAndRetroSound,
  startRocketLaunchSound,
  stopMarsEntryAndRetroSound,
  stopRocketLaunchSound,
  stopVictoryFanfare,
  updateMarsLandingAudio,
  updateRocketLaunchDistance,
} from '../../utils/soundEngine';
import { NasaSuitRig, createSuitPose } from './NasaSuitRig';
import type { NasaSuitPose, NasaSuitRigHandle } from './NasaSuitRig';
import { getTerrainHeight } from './MarsOutpost';

type VectorTuple = [number, number, number];

interface VictoryAssets {
  textures: {
    mars: THREE.Texture;
    earth: THREE.Texture;
    parachute: THREE.Texture;
    nasa: THREE.Texture;
    grass: THREE.Texture;
  };
  geometries: {
    box: THREE.BoxGeometry;
    cylinder: THREE.CylinderGeometry;
    cone: THREE.ConeGeometry;
    sphere: THREE.SphereGeometry;
    plane: THREE.PlaneGeometry;
    ring: THREE.RingGeometry;
    octahedron: THREE.OctahedronGeometry;
    marsGlobe: THREE.SphereGeometry;
    earthGlobe: THREE.SphereGeometry;
    canopy: THREE.SphereGeometry;
    transitCrew: THREE.CylinderGeometry;
    transitService: THREE.CylinderGeometry;
    earthCrew: THREE.CylinderGeometry;
    plasma: THREE.SphereGeometry;
    parachuteLine: THREE.CylinderGeometry;
  };
}

const createProceduralTexture = (
  paint: (context: CanvasRenderingContext2D) => void,
): THREE.Texture => {
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create the victory texture cache.');
  paint(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
};

let cachedAssets: VictoryAssets | null = null;
function getVictoryAssets(): VictoryAssets {
  if (cachedAssets) return cachedAssets;
  const mars = createProceduralTexture((context) => {
    context.fillStyle = '#b4532f';
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = '#d0784d';
    context.beginPath();
    context.ellipse(66, 102, 58, 32, -0.35, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#713228';
    context.beginPath();
    context.ellipse(156, 126, 48, 22, 0.3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, 256, 14);
  });
  const earth = createProceduralTexture((context) => {
    context.fillStyle = '#0284c7';
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = '#15803d';
    const continents: [number, number, number, number, number][] = [
      [55, 88, 35, 24, -0.4],
      [89, 174, 22, 42, 0.3],
      [153, 91, 44, 25, 0.2],
      [172, 174, 24, 39, -0.2],
      [229, 181, 22, 15, 0.25],
    ];
    for (const [x, y, radiusX, radiusY, rotation] of continents) {
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#f8fafc';
    context.fillRect(0, 0, 256, 12);
    context.fillRect(0, 244, 256, 12);
  });
  const parachute = createProceduralTexture((context) => {
    for (let index = 0; index < 24; index += 1) {
      context.fillStyle = index % 2 === 0 ? '#fc3d21' : '#ffffff';
      context.fillRect(index * (256 / 24), 0, 256 / 24 + 1, 256);
    }
    context.fillStyle = 'rgba(90,35,20,0.2)';
    for (const y of [54, 116, 178, 226]) context.fillRect(0, y, 256, 5);
  });
  const nasa = createProceduralTexture((context) => {
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = '#0b3d91';
    context.beginPath();
    context.arc(128, 128, 119, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 4;
    context.beginPath();
    context.ellipse(128, 130, 105, 31, -0.42, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#fc3d21';
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(18, 166);
    context.bezierCurveTo(82, 147, 117, 67, 164, 65);
    context.bezierCurveTo(129, 112, 157, 154, 236, 119);
    context.stroke();
    context.fillStyle = '#ffffff';
    context.font = 'bold 67px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('NASA', 128, 133);
  });
  const grass = createProceduralTexture((context) => {
    context.fillStyle = '#5a6b53';
    context.fillRect(0, 0, 256, 256);
    let seed = 9187;
    for (let index = 0; index < 420; index += 1) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 256;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 256;
      context.fillStyle = index % 3 === 0 ? 'rgba(40,55,38,0.24)' : 'rgba(145,151,116,0.18)';
      context.fillRect(x, y, 2, 2);
    }
  });
  grass.wrapS = THREE.RepeatWrapping;
  grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(28, 28);
  cachedAssets = {
    textures: { mars, earth, parachute, nasa, grass },
    geometries: {
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
      cone: new THREE.ConeGeometry(1, 1, 20),
      sphere: new THREE.SphereGeometry(1, 16, 12),
      plane: new THREE.PlaneGeometry(1, 1),
      ring: new THREE.RingGeometry(0.94, 1, 48),
      octahedron: new THREE.OctahedronGeometry(1, 0),
      marsGlobe: new THREE.SphereGeometry(4.5, 32, 24),
      earthGlobe: new THREE.SphereGeometry(6.2, 40, 28),
      canopy: new THREE.SphereGeometry(2.8, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
      transitCrew: new THREE.CylinderGeometry(0.45, 1.35, 1.4, 32),
      transitService: new THREE.CylinderGeometry(1.25, 1.25, 1.6, 32),
      earthCrew: new THREE.CylinderGeometry(0.68, 1.25, 2.4, 32),
      plasma: new THREE.SphereGeometry(1.52, 28, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      parachuteLine: new THREE.CylinderGeometry(0.015, 0.015, 9.2, 6),
    },
  };
  return cachedAssets;
}

const VICTORY_ASSETS = getVictoryAssets();
const G = VICTORY_ASSETS.geometries;
const T = VICTORY_ASSETS.textures;
const PAD_DECK_Y = 0.5;
const TERRAIN_Y = getTerrainHeight(0, 14);
const CAMERA_DESTINATION = new THREE.Vector3();
const CAMERA_LOOK_TARGET = new THREE.Vector3();
const CAMERA_LOOK_SMOOTH = new THREE.Vector3();
const PARTICLE_TRANSFORM = new THREE.Object3D();
const PARTICLE_MATRIX = new THREE.Matrix4();
const MARS_BASE_COLOR = new THREE.Color('#c97a4e');
const MARS_SKY_COLOR = new THREE.Color('#c97a4e');
const MARS_TWILIGHT_COLOR = new THREE.Color('#1e1b4b');
const SPACE_BACKGROUND = new THREE.Color('#030712');
const EARTH_BACKGROUND = new THREE.Color('#68aee8');
const SPARKLE_GOLD = new THREE.Color('#facc15');
const SPARKLE_WHITE = new THREE.Color('#fff7cc');
const MARS_FOG = new THREE.FogExp2('#c97a4e', 0.004);
const EARTH_FOG = new THREE.FogExp2('#b8d8f2', 0.0025);
const MARS_DUST_UNIFORMS = {
  uColor: { value: new THREE.Color('#c8754c') },
  uOpacity: { value: 0.42 },
};
const EARTH_MIST_UNIFORMS = {
  uColor: { value: new THREE.Color('#f1f5f9') },
  uOpacity: { value: 0.5 },
};
const SOFT_PARTICLE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const SOFT_PARTICLE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float softness = 1.0 - smoothstep(0.05, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(uColor, softness * uOpacity);
  }
`;
const LEG_POSITIONS: [number, number][] = [
  [-1.65, -1.65],
  [1.65, -1.65],
  [-1.65, 1.65],
  [1.65, 1.65],
];
const PARACHUTE_POSITIONS: VectorTuple[] = [
  [-3.2, 9.5, -1.2],
  [0, 10.2, 1.8],
  [3.2, 9.5, -1.2],
];
const DUST_COUNT = 96;
const MIST_COUNT = 48;
const SPARKLE_COUNT = 80;
const DUST_SEEDS = new Float32Array(DUST_COUNT * 4);
const MIST_SEEDS = new Float32Array(MIST_COUNT * 4);
const SPARKLE_SEEDS = new Float32Array(SPARKLE_COUNT * 4);
let particleSeed = 4139;
const seededRandom = (): number => {
  particleSeed = (particleSeed * 16807) % 2147483647;
  return (particleSeed - 1) / 2147483646;
};
for (const seeds of [DUST_SEEDS, MIST_SEEDS, SPARKLE_SEEDS]) {
  for (let index = 0; index < seeds.length; index += 1) seeds[index] = seededRandom();
}

const easeInOut = (value: number): number => {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const updateWalkPose = (pose: NasaSuitPose, time: number, amount: number): void => {
  const stride = Math.sin(time * 4.6);
  pose.leftHip = stride * 0.4 * amount;
  pose.rightHip = -stride * 0.4 * amount;
  pose.leftKnee = 0.08 + Math.max(0, -stride) * 0.62 * amount;
  pose.rightKnee = 0.08 + Math.max(0, stride) * 0.62 * amount;
  pose.leftShoulder = -stride * 0.34 * amount;
  pose.rightShoulder = stride * 0.34 * amount;
  pose.leftElbow = -0.32;
  pose.rightElbow = -0.32;
  pose.hipBob = Math.abs(stride) * 0.014 * amount;
  pose.torsoPitch = 0.05 * amount;
};

interface BeamSpec {
  position: VectorTuple;
  quaternion: THREE.Quaternion;
  length: number;
}

const makeBeamSpec = (start: VectorTuple, end: VectorTuple): BeamSpec => {
  const from = new THREE.Vector3(...start);
  const direction = new THREE.Vector3(...end).sub(from);
  return {
    position: from.clone().addScaledVector(direction, 0.5).toArray(),
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
    length: direction.length(),
  };
};

const LEG_STRUTS = LEG_POSITIONS.map(([x, z]) => makeBeamSpec(
  [Math.sign(x) * 1.25, 1.95, Math.sign(z) * 1.25],
  [x, 0.16, z],
));
const STAIR_RAILS = [-0.66, 0.66].map((x) => makeBeamSpec(
  [x, 0.72, 0],
  [x, -1.5, -2.6],
));
const PARACHUTE_LINES = PARACHUTE_POSITIONS.flatMap((position) => (
  Array.from({ length: 6 }, (_, index) => {
    const angle = index / 6 * Math.PI * 2;
    return makeBeamSpec(
      [position[0] + Math.cos(angle) * 2.68, position[1] + 0.16, position[2] + Math.sin(angle) * 2.68],
      [0, 2.94, 0],
    );
  })
));

const CachedGeometry = ({ geometry }: { geometry: THREE.BufferGeometry }) => (
  <primitive object={geometry} attach="geometry" />
);

const Beam = ({ spec, radius = 0.04, color = '#d7dde0' }: {
  spec: BeamSpec;
  radius?: number;
  color?: string;
}) => (
  <mesh castShadow position={spec.position} quaternion={spec.quaternion} scale={[radius, spec.length, radius]}>
    <CachedGeometry geometry={G.cylinder} />
    <meshStandardMaterial color={color} metalness={0.65} roughness={0.36} />
  </mesh>
);

const Box = ({ position, scale, rotation, color, metalness = 0.35, roughness = 0.5, emissive, emissiveIntensity = 0 }: {
  position: VectorTuple;
  scale: VectorTuple;
  rotation?: VectorTuple;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  emissiveIntensity?: number;
}) => (
  <mesh castShadow receiveShadow position={position} scale={scale} rotation={rotation}>
    <CachedGeometry geometry={G.box} />
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
  </mesh>
);

const Cylinder = ({ position, scale, rotation, color, metalness = 0.55, roughness = 0.4 }: {
  position: VectorTuple;
  scale: VectorTuple;
  rotation?: VectorTuple;
  color: string;
  metalness?: number;
  roughness?: number;
}) => (
  <mesh castShadow receiveShadow position={position} scale={scale} rotation={rotation}>
    <CachedGeometry geometry={G.cylinder} />
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  </mesh>
);

const NasaDecal = ({ position, scale, rotation = [0, 0, 0] }: {
  position: VectorTuple;
  scale: VectorTuple;
  rotation?: VectorTuple;
}) => (
  <mesh position={position} scale={scale} rotation={rotation} renderOrder={2}>
    <CachedGeometry geometry={G.plane} />
    <meshStandardMaterial map={T.nasa} transparent alphaTest={0.03} depthWrite={false} polygonOffset polygonOffsetFactor={-2} roughness={0.5} />
  </mesh>
);

const MarsLanderAssembly = ({ ascentRef, stairwayRef, doorPivotRef, flamesRef }: {
  ascentRef: RefObject<THREE.Group | null>;
  stairwayRef: RefObject<THREE.Group | null>;
  doorPivotRef: RefObject<THREE.Group | null>;
  flamesRef: RefObject<THREE.Group | null>;
}) => (
  <group>
    <group position={[0, TERRAIN_Y, 14]}>
      <Cylinder position={[0, 1.9, 0]} scale={[2.15, 0.42, 2.15]} color="#8c999f" />
      <Cylinder position={[0, 0.09, 0]} scale={[0.01, 0.01, 0.01]} color="#545e63" />
      {LEG_POSITIONS.map(([x, z], index) => (
        <group key={`${x}-${z}`}>
          <Beam spec={LEG_STRUTS[index]!} radius={0.12} color="#697780" />
          <Cylinder position={[x, 0.09, z]} scale={[0.58, 0.18, 0.58]} color="#545e63" metalness={0.72} />
          <Box position={[Math.sign(x) * 1.48, 2.3, Math.sign(z) * 1.48]} scale={[0.22, 0.58, 0.26]} color="#facc15" />
        </group>
      ))}
    </group>
    <group ref={stairwayRef} position={[0, TERRAIN_Y + 2.2, 11.8]}>
      {Array.from({ length: 8 }, (_, index) => {
        const ratio = index / 7;
        return (
          <Box
            key={index}
            position={[0, -ratio * 2.08 - 0.06, -ratio * 2.6]}
            scale={[1.25, 0.12, 0.39]}
            color="#a5b2b8"
            metalness={0.76}
            roughness={0.34}
          />
        );
      })}
      {STAIR_RAILS.map((spec, index) => <Beam key={index} spec={spec} radius={0.035} color="#c7d2d8" />)}
    </group>
    <group ref={ascentRef} position={[0, TERRAIN_Y, 14]}>
      <Cylinder position={[0, 3.55, 0]} scale={[1.45, 2.65, 1.45]} color="#e6ebed" />
      <mesh castShadow position={[0, 5.55, 0]} scale={[1.35, 1.5, 1.35]}>
        <CachedGeometry geometry={G.cone} />
        <meshStandardMaterial color="#f3f5f6" metalness={0.42} roughness={0.36} />
      </mesh>
      <Cylinder position={[0, 1.7, 0]} scale={[0.62, 1.05, 0.62]} color="#3f4b52" metalness={0.8} />
      <Box position={[0, 4.25, -1.37]} scale={[1.05, 0.32, 0.06]} color="#15364a" emissive="#6bd5ef" emissiveIntensity={0.45} />
      <NasaDecal position={[0, 3.55, -1.47]} scale={[0.78, 0.78, 0.78]} rotation={[0, Math.PI, 0]} />
      <Box position={[0, 3.4, -2]} scale={[1.4, 2.4, 0.12]} color="#101820" roughness={0.85} />
      <Box position={[-0.78, 3.4, -2.08]} scale={[0.12, 2.52, 0.18]} color="#c8d2d7" />
      <Box position={[0.78, 3.4, -2.08]} scale={[0.12, 2.52, 0.18]} color="#c8d2d7" />
      <Box position={[0, 4.64, -2.08]} scale={[1.66, 0.12, 0.18]} color="#c8d2d7" />
      <pointLight position={[0, 3.65, -2.35]} color="#fde047" intensity={1.5} distance={4} />
      <group ref={doorPivotRef} position={[0.7, 3.4, -2.14]} rotation={[0, -1.55, 0]}>
        <Box position={[-0.7, 0, 0]} scale={[1.4, 2.4, 0.1]} color="#cbd5da" metalness={0.66} roughness={0.32} />
        <Cylinder position={[-0.7, 0.42, -0.07]} scale={[0.22, 0.035, 0.22]} rotation={[Math.PI / 2, 0, 0]} color="#123148" />
      </group>
      <group ref={flamesRef} visible={false}>
        <mesh position={[0, -1.15, 0]} rotation={[0, 0, Math.PI]} scale={[0.8, 4.7, 0.8]}>
          <CachedGeometry geometry={G.cone} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.78} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh position={[0, -0.62, 0]} rotation={[0, 0, Math.PI]} scale={[0.4, 3.5, 0.4]}>
          <CachedGeometry geometry={G.cone} />
          <meshBasicMaterial color="#fff7ed" transparent opacity={0.96} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <pointLight position={[0, 0.9, 0]} color="#ff8a38" intensity={20} distance={28} />
      </group>
    </group>
  </group>
);

const MarsAscentDust = ({ elapsedRef }: { elapsedRef: RefObject<number> }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    meshRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = elapsedRef.current - 4.2;
    mesh.visible = time >= 0 && elapsedRef.current < 8;
    if (!mesh.visible) return;
    for (let index = 0; index < DUST_COUNT; index += 1) {
      const offset = index * 4;
      const life = (time * (0.32 + DUST_SEEDS[offset + 3]! * 0.16) + DUST_SEEDS[offset]!) % 1;
      const angle = DUST_SEEDS[offset + 1]! * Math.PI * 2;
      const radius = 0.7 + life * (5 + DUST_SEEDS[offset + 2]! * 4);
      const scale = (0.4 + life * 2.2) * Math.sin(life * Math.PI);
      PARTICLE_TRANSFORM.position.set(
        Math.cos(angle) * radius,
        TERRAIN_Y + 0.18 + life * 1.7,
        14 + Math.sin(angle) * radius,
      );
      PARTICLE_TRANSFORM.quaternion.copy(state.camera.quaternion);
      PARTICLE_TRANSFORM.scale.setScalar(scale);
      PARTICLE_TRANSFORM.updateMatrix();
      PARTICLE_MATRIX.copy(PARTICLE_TRANSFORM.matrix);
      mesh.setMatrixAt(index, PARTICLE_MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, DUST_COUNT]} visible={false} frustumCulled={false}>
      <CachedGeometry geometry={G.plane} />
      <shaderMaterial uniforms={MARS_DUST_UNIFORMS} vertexShader={SOFT_PARTICLE_VERTEX_SHADER} fragmentShader={SOFT_PARTICLE_FRAGMENT_SHADER} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
};

const DeepSpaceTransit = ({ elapsedRef }: { elapsedRef: RefObject<number> }) => {
  const marsRef = useRef<THREE.Group>(null);
  const earthRef = useRef<THREE.Group>(null);
  const transitShipRef = useRef<THREE.Group>(null);
  const crewRef = useRef<THREE.Group>(null);
  const serviceRef = useRef<THREE.Group>(null);
  const engineRef = useRef<THREE.Group>(null);
  const plasmaMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const time = elapsedRef.current;
    const progress = easeInOut((time - 8) / 6);
    const separation = easeInOut((time - 11.8) / 1.25);
    if (marsRef.current) {
      marsRef.current.rotation.y = time * 0.08;
      marsRef.current.position.z = -14 - progress * 7;
      marsRef.current.scale.setScalar(1 - progress * 0.36);
    }
    if (earthRef.current) {
      earthRef.current.rotation.y = time * 0.065;
      earthRef.current.position.set(16 - progress * 4, 2, -12 + progress * 3);
      earthRef.current.scale.setScalar(0.68 + progress * 0.5);
    }
    if (transitShipRef.current) transitShipRef.current.position.x = THREE.MathUtils.lerp(-6.5, 6.5, progress);
    if (crewRef.current) crewRef.current.rotation.x = separation * Math.PI;
    if (serviceRef.current) {
      serviceRef.current.position.y = -separation * 4.2;
      serviceRef.current.rotation.x = separation * 0.22;
    }
    if (engineRef.current) {
      engineRef.current.visible = time < 11.8;
      engineRef.current.scale.y = 0.94 + Math.sin(state.clock.elapsedTime * 19) * 0.06;
    }
    if (plasmaMaterialRef.current) {
      plasmaMaterialRef.current.opacity = easeInOut((time - 11.8) / 1.1) * (0.5 + Math.sin(state.clock.elapsedTime * 9) * 0.06);
    }
  });

  return (
    <>
      <Stars radius={110} depth={55} count={1800} factor={2.5} saturation={0.1} fade speed={0.25} />
      <ambientLight intensity={0.5} color="#bfd8ff" />
      <directionalLight position={[8, 12, 10]} intensity={2.8} color="#ffe3ba" />
      <group ref={marsRef} position={[-16, -2.5, -14]}>
        <mesh>
          <CachedGeometry geometry={G.marsGlobe} />
          <meshStandardMaterial map={T.mars} roughness={0.95} />
        </mesh>
      </group>
      <group ref={earthRef} position={[16, 2, -12]} scale={0.68}>
        <mesh>
          <CachedGeometry geometry={G.earthGlobe} />
          <meshStandardMaterial map={T.earth} roughness={0.76} emissive="#075985" emissiveIntensity={0.12} />
        </mesh>
        <mesh scale={1.045}>
          <CachedGeometry geometry={G.earthGlobe} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.13} side={THREE.BackSide} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <group ref={transitShipRef} position={[-6.5, 0, 0]} rotation={[0, 0, -Math.PI / 2 + 0.15]}>
        <group ref={crewRef} position={[0, 1.35, 0]}>
          <mesh castShadow>
            <CachedGeometry geometry={G.transitCrew} />
            <meshStandardMaterial color="#f1f5f9" metalness={0.4} roughness={0.45} />
          </mesh>
          <Cylinder position={[0, -0.77, 0]} scale={[1.34, 0.18, 1.34]} color="#292d31" metalness={0.62} roughness={0.72} />
          <NasaDecal position={[0, -0.15, 1.06]} scale={[0.55, 0.55, 0.55]} />
          {[-0.34, 0.34].map((x) => (
            <group key={x} position={[x, 0.25, 0.79]}>
              <mesh scale={[0.28, 0.28, 0.28]}>
                <CachedGeometry geometry={G.plane} />
                <meshStandardMaterial color="#0f2940" emissive="#7dd3fc" emissiveIntensity={0.55} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.79, 0]}>
            <CachedGeometry geometry={G.plasma} />
            <meshBasicMaterial ref={plasmaMaterialRef} color="#fb923c" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
        <group ref={serviceRef}>
          <mesh castShadow position={[0, -0.3, 0]}>
            <CachedGeometry geometry={G.transitService} />
            <meshStandardMaterial color="#aab7c2" metalness={0.82} roughness={0.3} />
          </mesh>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
            <group key={angle} position={[0, -0.3, 0]} rotation={[0, angle, 0]}>
              <Box position={[2.45, 0, 0]} scale={[2.5, 1.05, 0.07]} color="#1e40af" metalness={0.62} roughness={0.3} />
              {[-1.2, -0.4, 0.4, 1.2].map((x) => (
                <Box key={x} position={[2.45 + x, 0, 0.045]} scale={[0.025, 1.02, 0.018]} color="#d4a72c" metalness={0.7} />
              ))}
              <Box position={[1.25, 0, 0]} scale={[0.65, 0.08, 0.08]} color="#d4a72c" />
            </group>
          ))}
          <Cylinder position={[0, -1.27, 0]} scale={[0.42, 0.36, 0.42]} color="#334155" metalness={0.85} />
          <group ref={engineRef} position={[0, -2.25, 0]}>
            <mesh rotation={[0, 0, Math.PI]} scale={[0.42, 1.8, 0.42]}>
              <CachedGeometry geometry={G.cone} />
              <meshBasicMaterial color="#67e8f9" transparent opacity={0.82} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <pointLight color="#80d9ff" intensity={7} distance={10} />
          </group>
        </group>
      </group>
    </>
  );
};

const EarthCapsule = ({ earthCapsuleRef, doorPivotRef, parachutesRef }: {
  earthCapsuleRef: RefObject<THREE.Group | null>;
  doorPivotRef: RefObject<THREE.Group | null>;
  parachutesRef: RefObject<THREE.Group | null>;
}) => (
  <group ref={earthCapsuleRef} position={[0, 36, 0]}>
    <Cylinder position={[0, 0.17, 0]} scale={[1.4, 0.34, 1.4]} color="#292d31" metalness={0.52} roughness={0.72} />
    <mesh castShadow position={[0, 1.55, 0]}>
      <CachedGeometry geometry={G.earthCrew} />
      <meshStandardMaterial color="#e8edef" metalness={0.45} roughness={0.42} />
    </mesh>
    <Cylinder position={[0, 2.83, 0]} scale={[0.5, 0.26, 0.5]} color="#c9d2d7" />
    <Box position={[0, 1.55, 1.04]} scale={[1.18, 2.4, 0.07]} color="#111a22" roughness={0.85} />
    <group ref={doorPivotRef} position={[0.59, 1.55, 1.15]}>
      <Box position={[-0.59, 0, 0]} scale={[1.18, 2.4, 0.1]} color="#cbd5da" metalness={0.66} roughness={0.32} />
      <Cylinder position={[-0.59, 0.43, 0.07]} scale={[0.22, 0.035, 0.22]} rotation={[Math.PI / 2, 0, 0]} color="#123148" />
    </group>
    <NasaDecal position={[-0.77, 2.05, 0.91]} scale={[0.45, 0.45, 0.45]} />
    <pointLight position={[0, 1.75, 1.35]} color="#fde047" intensity={1.1} distance={3} />
    <group ref={parachutesRef}>
      {PARACHUTE_POSITIONS.map((position, index) => (
        <mesh key={index} castShadow position={position}>
          <CachedGeometry geometry={G.canopy} />
          <meshStandardMaterial map={T.parachute} side={THREE.DoubleSide} roughness={0.84} />
        </mesh>
      ))}
      {PARACHUTE_LINES.map((spec, index) => (
        <mesh key={index} position={spec.position} quaternion={spec.quaternion} scale={[1, spec.length / 9.2, 1]}>
          <CachedGeometry geometry={G.parachuteLine} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.65} />
        </mesh>
      ))}
    </group>
  </group>
);

const EarthLandingMist = ({ elapsedRef }: { elapsedRef: RefObject<number> }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    meshRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = elapsedRef.current - 18.55;
    mesh.visible = time >= 0 && time < 1.05;
    if (!mesh.visible) return;
    for (let index = 0; index < MIST_COUNT; index += 1) {
      const offset = index * 4;
      const life = (time * 0.85 + MIST_SEEDS[offset]!) % 1;
      const angle = MIST_SEEDS[offset + 1]! * Math.PI * 2;
      const radius = 0.5 + life * (2 + MIST_SEEDS[offset + 2]! * 2.4);
      const scale = (0.3 + life * 1.2) * Math.sin(life * Math.PI);
      PARTICLE_TRANSFORM.position.set(Math.cos(angle) * radius, PAD_DECK_Y + 0.12 + life * 0.65, Math.sin(angle) * radius);
      PARTICLE_TRANSFORM.quaternion.copy(state.camera.quaternion);
      PARTICLE_TRANSFORM.scale.setScalar(scale);
      PARTICLE_TRANSFORM.updateMatrix();
      PARTICLE_MATRIX.copy(PARTICLE_TRANSFORM.matrix);
      mesh.setMatrixAt(index, PARTICLE_MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MIST_COUNT]} visible={false} frustumCulled={false}>
      <CachedGeometry geometry={G.plane} />
      <shaderMaterial uniforms={EARTH_MIST_UNIFORMS} vertexShader={SOFT_PARTICLE_VERTEX_SHADER} fragmentShader={SOFT_PARTICLE_FRAGMENT_SHADER} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
};

const RecoveryZone = () => (
  <group>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} scale={[220, 220, 220]}>
      <CachedGeometry geometry={G.plane} />
      <meshStandardMaterial map={T.grass} color="#ffffff" roughness={0.98} />
    </mesh>
    <mesh receiveShadow position={[0, PAD_DECK_Y * 0.5, 2.5]} scale={[7.5, PAD_DECK_Y, 7.5]}>
      <CachedGeometry geometry={G.cylinder} />
      <meshStandardMaterial color="#737b80" roughness={0.92} metalness={0.05} />
    </mesh>
    {[2.2, 4.8, 7.1].map((radius) => (
      <mesh key={radius} position={[0, PAD_DECK_Y + 0.012, 2.5]} rotation={[-Math.PI / 2, 0, 0]} scale={radius}>
        <CachedGeometry geometry={G.ring} />
        <meshBasicMaterial color="#f8fafc" side={THREE.DoubleSide} />
      </mesh>
    ))}
    <NasaDecal position={[0, PAD_DECK_Y + 0.018, 2.5]} scale={[2.4, 2.4, 2.4]} rotation={[-Math.PI / 2, 0, 0]} />
    {[[-6.5, -2.5], [6.5, -2.5], [-6.5, 7.5], [6.5, 7.5]].map(([x, z]) => (
      <group key={`${x}-${z}`} position={[x!, 0, z!]}>
        <Cylinder position={[0, 2.7, 0]} scale={[0.08, 5.4, 0.08]} color="#64748b" />
        <Box position={[0, 5.45, 0]} scale={[0.75, 0.3, 0.25]} color="#e2e8f0" emissive="#e0f2fe" emissiveIntensity={1.3} />
      </group>
    ))}
    <group position={[15, 0, -34]}>
      <Box position={[0, 3.8, 0]} scale={[1.1, 7.6, 1.1]} color="#87949b" />
      <Box position={[0, 7.9, 0]} scale={[4.8, 0.5, 1.4]} color="#a5b0b6" />
      <Box position={[2.1, 4.2, 0]} scale={[0.45, 8.4, 0.45]} color="#6c7980" />
    </group>
  </group>
);

const GoldenSamplePack = () => (
  <group position={[0.28, 1.05, -0.28]}>
    <Box position={[0, 0, 0]} scale={[0.48, 0.42, 0.17]} color="#b78920" metalness={0.82} roughness={0.24} emissive="#8b5e0b" emissiveIntensity={0.25} />
    {[-0.15, -0.05, 0.05, 0.15].map((x) => (
      <Cylinder key={x} position={[x, 0, -0.12]} scale={[0.035, 0.34, 0.035]} color="#f7c948" metalness={0.85} roughness={0.2} />
    ))}
  </group>
);

const GoldenCelebration = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < SPARKLE_COUNT; index += 1) {
      mesh.setColorAt(index, index % 3 === 0 ? SPARKLE_WHITE : SPARKLE_GOLD);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.visible = useGameStore.getState().victoryPhase === 'EARTH_WELCOME_CEREMONY';
    if (!mesh.visible) return;
    const elapsed = state.clock.elapsedTime;
    for (let index = 0; index < SPARKLE_COUNT; index += 1) {
      const offset = index * 4;
      const life = (elapsed * 0.12 + SPARKLE_SEEDS[offset]!) % 1;
      PARTICLE_TRANSFORM.position.set(
        (SPARKLE_SEEDS[offset + 1]! - 0.5) * 9,
        PAD_DECK_Y + 0.8 + (1 - life) * 5,
        3 + SPARKLE_SEEDS[offset + 2]! * 4,
      );
      PARTICLE_TRANSFORM.rotation.set(elapsed + index, elapsed * 0.8, life * Math.PI * 3);
      PARTICLE_TRANSFORM.scale.setScalar((0.04 + SPARKLE_SEEDS[offset + 3]! * 0.05) * Math.sin(life * Math.PI));
      PARTICLE_TRANSFORM.updateMatrix();
      PARTICLE_MATRIX.copy(PARTICLE_TRANSFORM.matrix);
      mesh.setMatrixAt(index, PARTICLE_MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, SPARKLE_COUNT]} frustumCulled={false}>
      <CachedGeometry geometry={G.octahedron} />
      <meshStandardMaterial color="#ffffff" emissive="#facc15" emissiveIntensity={1.5} toneMapped={false} />
    </instancedMesh>
  );
};

const getPhaseForElapsed = (elapsed: number): VictoryPhase => {
  if (elapsed < 8) return 'MARS_BOARDING_ASCENT';
  if (elapsed < 14) return 'DEEP_SPACE_TRANSIT';
  if (elapsed < 19) return 'EARTH_PARACHUTE_LANDING';
  return 'EARTH_WELCOME_CEREMONY';
};

export const VictoryCutscene = () => {
  const phase = useGameStore((state) => state.victoryPhase);
  const victoryRunId = useGameStore((state) => state.victoryRunId);
  const gameStatus = useGameStore((state) => state.gameStatus);
  const ascentRef = useRef<THREE.Group>(null);
  const stairwayRef = useRef<THREE.Group>(null);
  const marsDoorRef = useRef<THREE.Group>(null);
  const flamesRef = useRef<THREE.Group>(null);
  const marsCadetRef = useRef<THREE.Group>(null);
  const marsCadetRigRef = useRef<NasaSuitRigHandle>(null);
  const earthCapsuleRef = useRef<THREE.Group>(null);
  const earthDoorRef = useRef<THREE.Group>(null);
  const parachutesRef = useRef<THREE.Group>(null);
  const earthCadetRef = useRef<THREE.Group>(null);
  const earthCadetRigRef = useRef<NasaSuitRigHandle>(null);
  const commanderRigRef = useRef<NasaSuitRigHandle>(null);
  const specialistRigRef = useRef<NasaSuitRigHandle>(null);
  const engineerRigRef = useRef<NasaSuitRigHandle>(null);
  const elapsedRef = useRef(0);
  const previousRunId = useRef(victoryRunId);
  const displayedPhaseRef = useRef<VictoryPhase>('MARS_BOARDING_ASCENT');
  const capsuleYRef = useRef(36);
  const cameraInitialized = useRef(false);
  const rocketSoundStarted = useRef(false);
  const separationSoundPlayed = useRef(false);
  const touchdownPlayed = useRef(false);
  const marsCadetPose = useRef(createSuitPose());
  const earthCadetPose = useRef(createSuitPose());
  const commanderPose = useRef(createSuitPose());
  const specialistPose = useRef(createSuitPose());
  const engineerPose = useRef(createSuitPose());

  useLayoutEffect(() => {
    elapsedRef.current = 0;
    previousRunId.current = victoryRunId;
    displayedPhaseRef.current = 'MARS_BOARDING_ASCENT';
    capsuleYRef.current = 36;
    cameraInitialized.current = false;
    rocketSoundStarted.current = false;
    separationSoundPlayed.current = false;
    touchdownPlayed.current = false;
  }, [victoryRunId, gameStatus]);

  useEffect(() => {
    if (phase === 'MARS_BOARDING_ASCENT') rocketSoundStarted.current = false;
    else stopRocketLaunchSound();
    if (phase === 'EARTH_PARACHUTE_LANDING') {
      touchdownPlayed.current = false;
      startMarsEntryAndRetroSound();
    } else {
      stopMarsEntryAndRetroSound();
    }
  }, [phase]);

  useEffect(() => () => {
    stopRocketLaunchSound();
    stopMarsEntryAndRetroSound();
    stopVictoryFanfare();
  }, []);

  useFrame((state, delta) => {
    const gameState = useGameStore.getState();
    if (gameState.gameStatus !== 'VICTORY') return;
    if (previousRunId.current !== gameState.victoryRunId) {
      previousRunId.current = gameState.victoryRunId;
      displayedPhaseRef.current = 'MARS_BOARDING_ASCENT';
      elapsedRef.current = 0;
      capsuleYRef.current = 36;
      cameraInitialized.current = false;
      rocketSoundStarted.current = false;
      separationSoundPlayed.current = false;
      touchdownPlayed.current = false;
    }
    const frameDelta = Math.min(delta, 0.05);
    elapsedRef.current += frameDelta;
    const time = elapsedRef.current;
    const timelinePhase = getPhaseForElapsed(time);
    if (displayedPhaseRef.current !== timelinePhase) {
      displayedPhaseRef.current = timelinePhase;
      cameraInitialized.current = timelinePhase === 'EARTH_WELCOME_CEREMONY';
      gameState.setVictoryPhase(timelinePhase);
    }
    if (time >= 11.8 && !separationSoundPlayed.current) {
      separationSoundPlayed.current = true;
      playStationComplete();
    }

    if (timelinePhase === 'MARS_BOARDING_ASCENT') {
      state.scene.fog = MARS_FOG;
      state.scene.background = MARS_SKY_COLOR;
      const ascentProgress = easeInOut((time - 4.2) / 3.8);
      const ascentY = ascentProgress * 120;
      if (ascentProgress < 0.55) {
        MARS_SKY_COLOR.copy(MARS_BASE_COLOR).lerp(MARS_TWILIGHT_COLOR, ascentProgress / 0.55);
      } else {
        MARS_SKY_COLOR.copy(MARS_TWILIGHT_COLOR).lerp(SPACE_BACKGROUND, (ascentProgress - 0.55) / 0.45);
      }
      MARS_FOG.density = THREE.MathUtils.lerp(0.004, 0.0001, ascentProgress);
      if (ascentRef.current) ascentRef.current.position.y = TERRAIN_Y + ascentY;
      if (stairwayRef.current) {
        const retract = easeInOut((time - 3.2) / 1);
        stairwayRef.current.rotation.x = retract * 1.38;
        stairwayRef.current.scale.set(1, 1 - retract * 0.82, 1 - retract * 0.82);
      }
      if (marsDoorRef.current) {
        marsDoorRef.current.rotation.y = THREE.MathUtils.damp(
          marsDoorRef.current.rotation.y,
          time < 3.2 ? -1.55 : 0,
          10,
          frameDelta,
        );
      }
      if (marsCadetRef.current) {
        const cadet = marsCadetRef.current;
        cadet.visible = time < 3.2;
        if (time < 0.35) {
          cadet.position.set(0, TERRAIN_Y, 9.2);
        } else if (time < 2.7) {
          const climb = easeInOut((time - 0.35) / 2.35);
          cadet.position.set(0, TERRAIN_Y + climb * 2.2, THREE.MathUtils.lerp(9.2, 11.8, climb));
        } else {
          const enter = easeInOut((time - 2.7) / 0.5);
          cadet.position.set(0, TERRAIN_Y + 2.2, THREE.MathUtils.lerp(11.8, 12.6, enter));
        }
      }
      updateWalkPose(marsCadetPose.current, time, time > 0.35 && time < 3.1 ? 0.72 : 0);
      marsCadetRigRef.current?.applyPose(marsCadetPose.current, frameDelta);
      if (time >= 4.2) {
        if (flamesRef.current) {
          flamesRef.current.visible = true;
          flamesRef.current.scale.y = 0.95 + Math.sin(state.clock.elapsedTime * 25) * 0.05;
        }
        if (!rocketSoundStarted.current) {
          rocketSoundStarted.current = true;
          startRocketLaunchSound();
        }
        if (ascentRef.current) updateRocketLaunchDistance(state.camera.position.distanceTo(ascentRef.current.position));
        CAMERA_DESTINATION.set(14, TERRAIN_Y + 7.5, 0);
        CAMERA_LOOK_TARGET.set(0, TERRAIN_Y + 5 + ascentY * 0.45, 14);
      } else {
        CAMERA_DESTINATION.set(9.5, TERRAIN_Y + 6.2, 1.5);
        CAMERA_LOOK_TARGET.set(0, TERRAIN_Y + 4.2, 12.5);
      }
    } else if (timelinePhase === 'DEEP_SPACE_TRANSIT') {
      state.scene.fog = null;
      if (!(state.scene.background instanceof THREE.Color)) state.scene.background = SPACE_BACKGROUND;
      state.scene.background.set('#030712');
      state.camera.position.set(0, 2.2, 15);
      CAMERA_LOOK_SMOOTH.set(0, 0, 0);
      state.camera.lookAt(CAMERA_LOOK_SMOOTH);
      cameraInitialized.current = false;
    } else if (timelinePhase === 'EARTH_PARACHUTE_LANDING') {
      if (!(state.scene.background instanceof THREE.Color)) state.scene.background = EARTH_BACKGROUND;
      state.scene.background.set('#68aee8');
      state.scene.fog = EARTH_FOG;
      const descent = easeInOut((time - 14) / 4.65);
      capsuleYRef.current = Math.max(PAD_DECK_Y, THREE.MathUtils.lerp(36, PAD_DECK_Y, descent));
      if (earthCapsuleRef.current) earthCapsuleRef.current.position.y = capsuleYRef.current;
      if (parachutesRef.current) parachutesRef.current.visible = capsuleYRef.current > PAD_DECK_Y + 0.04;
      updateMarsLandingAudio(capsuleYRef.current - PAD_DECK_Y);
      if (capsuleYRef.current <= PAD_DECK_Y + 0.01 && !touchdownPlayed.current) {
        touchdownPlayed.current = true;
        playMarsTouchdownThud();
      }
      CAMERA_DESTINATION.set(0, 6.5, 18);
      CAMERA_LOOK_TARGET.set(0, capsuleYRef.current + 2.5, 0);
    } else {
      if (!(state.scene.background instanceof THREE.Color)) state.scene.background = EARTH_BACKGROUND;
      state.scene.background.set('#68aee8');
      state.scene.fog = EARTH_FOG;
      const ceremonyTime = time - 19;
      capsuleYRef.current = PAD_DECK_Y;
      if (earthCapsuleRef.current) earthCapsuleRef.current.position.y = PAD_DECK_Y;
      if (parachutesRef.current) parachutesRef.current.visible = false;
      if (earthCadetRef.current) {
        const cadet = earthCadetRef.current;
        cadet.visible = ceremonyTime >= 0.45;
        const walk = easeInOut((ceremonyTime - 0.45) / 1.8);
        cadet.position.set(0, PAD_DECK_Y, THREE.MathUtils.lerp(1.15, 4.5, walk));
        cadet.rotation.y = -0.25 * easeInOut((ceremonyTime - 2.25) / 0.7);
        updateWalkPose(earthCadetPose.current, time, walk > 0 && walk < 1 ? 0.68 : 0);
        earthCadetRigRef.current?.applyPose(earthCadetPose.current, frameDelta);
      }
      commanderPose.current.rightShoulder = -1.3 + Math.sin(state.clock.elapsedTime * 1.8) * 0.08;
      commanderPose.current.rightElbow = -1.05;
      commanderRigRef.current?.applyPose(commanderPose.current, frameDelta);
      specialistPose.current.rightShoulder = -1.05 + Math.sin(state.clock.elapsedTime * 3) * 0.22;
      specialistPose.current.rightElbow = -0.55;
      specialistRigRef.current?.applyPose(specialistPose.current, frameDelta);
      engineerPose.current.leftShoulder = -0.75 + Math.sin(state.clock.elapsedTime * 3.3) * 0.18;
      engineerPose.current.rightShoulder = -0.75 - Math.sin(state.clock.elapsedTime * 3.3) * 0.18;
      engineerPose.current.leftElbow = -0.88;
      engineerPose.current.rightElbow = -0.88;
      engineerRigRef.current?.applyPose(engineerPose.current, frameDelta);
      CAMERA_DESTINATION.set(0, PAD_DECK_Y + 2.2, 11.2);
      CAMERA_LOOK_TARGET.set(0, PAD_DECK_Y + 1.3, 4.2);
    }

    if (timelinePhase === 'EARTH_PARACHUTE_LANDING' || timelinePhase === 'EARTH_WELCOME_CEREMONY') {
      if (earthDoorRef.current) {
        earthDoorRef.current.rotation.y = THREE.MathUtils.damp(
          earthDoorRef.current.rotation.y,
          time >= 19.25 ? 1.55 : 0,
          9,
          frameDelta,
        );
      }
    }

    if (timelinePhase !== 'DEEP_SPACE_TRANSIT') {
      if (!cameraInitialized.current) {
        state.camera.position.copy(CAMERA_DESTINATION);
        CAMERA_LOOK_SMOOTH.copy(CAMERA_LOOK_TARGET);
        cameraInitialized.current = true;
      }
      const cameraBlend = 1 - Math.exp(-Math.min(delta, 0.1) * 5);
      state.camera.position.lerp(CAMERA_DESTINATION, cameraBlend);
      CAMERA_LOOK_SMOOTH.lerp(CAMERA_LOOK_TARGET, cameraBlend);
      state.camera.lookAt(CAMERA_LOOK_SMOOTH);
    }
    if (state.camera instanceof THREE.PerspectiveCamera) {
      state.camera.fov = THREE.MathUtils.damp(state.camera.fov, timelinePhase === 'MARS_BOARDING_ASCENT' ? 55 : 50, 6, frameDelta);
      state.camera.updateProjectionMatrix();
    }
  });

  return (
    <>
      {phase === 'MARS_BOARDING_ASCENT' && (
        <>
          <ambientLight intensity={0.55} color="#f4c6a5" />
          <hemisphereLight args={['#fcd8b8', '#5b2419', 0.8]} />
          <directionalLight castShadow position={[24, 34, 4]} intensity={2.4} color="#ffe1c2" />
          <MarsLanderAssembly ascentRef={ascentRef} stairwayRef={stairwayRef} doorPivotRef={marsDoorRef} flamesRef={flamesRef} />
          <MarsAscentDust elapsedRef={elapsedRef} />
          <group ref={marsCadetRef} position={[0, TERRAIN_Y, 9.2]}>
            <NasaSuitRig ref={marsCadetRigRef} scale={0.92} />
          </group>
        </>
      )}
      {phase === 'DEEP_SPACE_TRANSIT' && <DeepSpaceTransit elapsedRef={elapsedRef} />}
      {(phase === 'EARTH_PARACHUTE_LANDING' || phase === 'EARTH_WELCOME_CEREMONY') && (
        <>
          <ambientLight intensity={1} color="#dceeff" />
          <hemisphereLight args={['#dceeff', '#68735e', 0.9]} />
          <directionalLight castShadow position={[24, 38, 16]} color="#fff4dd" intensity={2.8} />
          <RecoveryZone />
          <EarthCapsule earthCapsuleRef={earthCapsuleRef} doorPivotRef={earthDoorRef} parachutesRef={parachutesRef} />
          <EarthLandingMist elapsedRef={elapsedRef} />
        </>
      )}
      <group visible={phase === 'EARTH_WELCOME_CEREMONY'}>
        <group ref={earthCadetRef} position={[0, PAD_DECK_Y, 1.15]} visible={false}>
          <NasaSuitRig ref={earthCadetRigRef} scale={0.92} />
          <GoldenSamplePack />
        </group>
        <group position={[-2.2, PAD_DECK_Y, 5]} rotation={[0, 0.28, 0]}>
          <NasaSuitRig ref={commanderRigRef} isCommander />
        </group>
        <group position={[2.2, PAD_DECK_Y, 5]} rotation={[0, -0.28, 0]}>
          <NasaSuitRig ref={specialistRigRef} />
        </group>
        <group position={[-3.8, PAD_DECK_Y, 5.8]} rotation={[0, 0.38, 0]}>
          <NasaSuitRig ref={engineerRigRef} />
        </group>
        <GoldenCelebration />
      </group>
    </>
  );
};
