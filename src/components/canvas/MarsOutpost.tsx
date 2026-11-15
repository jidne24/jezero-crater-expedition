/* oxlint-disable react/only-export-components */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../../store/useGameStore';
import type { ActiveStation, SolTasks } from '../../store/useGameStore';
import { LanderVentMist, MarsLanderModel } from './MarsLander';

export type StationId = Exclude<ActiveStation, 'NONE'>;

export interface StationDefinition {
  id: StationId;
  label: string;
  position: [number, number, number];
  radius: number;
  marsTrekCoords: string;
  resourceName: string;
  resourceRole: string;
}

type PowerKey = 'thrusterPower' | 'thermalPower' | 'shieldSensorPower';

interface ConduitDefinition {
  curve: THREE.CatmullRomCurve3;
  powerKey: PowerKey;
  color: string;
}

const smoothstep = (minimum: number, maximum: number, value: number): number => {
  const normalized = THREE.MathUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

export const getTerrainHeight = (x: number, z: number): number => {
  const distance = Math.hypot(x, z);
  const baseBlend = smoothstep(18, 34, distance);
  const centralFloor = Math.sin(x * 0.24) * Math.cos(z * 0.21) * 0.045;
  const rollingRegolith =
    Math.sin(x * 0.052) * Math.cos(z * 0.046) * 1.15 +
    Math.sin((x + z) * 0.093) * 0.48 +
    Math.cos((x - z) * 0.137) * 0.27;
  const rimDistance = (distance - 91) / 16;
  const craterRim = Math.exp(-rimDistance * rimDistance) * 4.8;
  const outerRidges = Math.sin(distance * 0.16 + Math.atan2(z, x) * 3) * 0.32;

  return centralFloor * (1 - baseBlend) + (rollingRegolith + craterRim + outerRidges) * baseBlend;
};

const createStation = (
  id: StationId,
  label: string,
  x: number,
  z: number,
  radius: number,
  marsTrekCoords: string,
  resourceName: string,
  resourceRole: string,
): StationDefinition => ({
  id,
  label,
  position: [x, getTerrainHeight(x, z), z],
  radius,
  marsTrekCoords,
  resourceName,
  resourceRole,
});

interface SolidObstacle {
  x: number;
  z: number;
  radius: number;
}

interface BuildingCenter {
  x: number;
  z: number;
}

const BUILDING_CENTERS: Record<StationId, BuildingCenter> = {
  HYDROPONICS: { x: -28, z: -28.5 },
  SOLAR_ARRAY: { x: 38, z: -49 },
  RADAR_TOWER: { x: -48, z: 29 },
  ROVER: { x: 52, z: 21 },
};

const getBuildingPosition = (id: StationId): [number, number, number] => {
  const center = BUILDING_CENTERS[id];
  return [center.x, getTerrainHeight(center.x, center.z), center.z];
};

export const STATIONS: StationDefinition[] = [
  createStation(
    'HYDROPONICS',
    'CSA Hydroponics Greenhouse Dome',
    -28,
    -22,
    2.3,
    '18.4447°N, 77.4508°E • Elev -2,540m • Neretva Vallis Delta',
    'CSA Food Production Toolkit',
    'Heated recirculating trays grow tomatoes, lettuce, and radishes without soil; Thermal [2] protects crop health.',
  ),
  createStation(
    'SOLAR_ARRAY',
    'Kilopower Ridge Solar Farm',
    38,
    -42,
    2.3,
    '18.4447°N, 77.4508°E • Elev -2,540m • Crater Floor Solar Ridge',
    'NASA Mars Trek + NASA Open APIs',
    'A Jezero power waypoint where optical-depth dust blocks sunlight and cleaning restores available energy.',
  ),
  createStation(
    'RADAR_TOWER',
    'DONKI Space Weather Rim Dish',
    -48,
    35,
    2.3,
    '18.4447°N, 77.4508°E • Elev -2,540m • Crater Rim Ridge',
    'NASA DONKI + RadLab',
    'Tracks flare, CME, SEP, and absorbed-dose alerts; Shield [3] protects communications and outpost integrity.',
  ),
  createStation(
    'ROVER',
    'Perseverance Rover & MOXIE Delta Site',
    52,
    28,
    2.3,
    '18.4447°N, 77.4508°E • Elev -2,540m • Octavia E. Butler Landing',
    'NASA OSDR + Mars Trek',
    'Links each sample to spaceflight biology findings about bones, muscles, immunity, gravity, and plant nutrition.',
  ),
];

const STRUCTURE_OBSTACLES: SolidObstacle[] = [
  { x: -28, z: -28.5, radius: 5.45 },
  { x: 34.92, z: -48.12, radius: 3.05 },
  { x: 41.08, z: -49.88, radius: 3.05 },
  { x: 38, z: -49, radius: 1.2 },
  { x: -48, z: 29, radius: 2.35 },
  { x: 52, z: 21, radius: 4.2 },
  ...STATIONS.map((station) => ({
    x: station.position[0],
    z: station.position[2],
    radius: 0.5,
  })),
];

export const PLAYER_POSITION = { x: 0, z: 9.2 };

export const stationNeedsAttention = (
  station: StationId,
  tasks: SolTasks,
  dustLevel: number,
): boolean => {
  switch (station) {
    case 'SOLAR_ARRAY':
      return dustLevel > 0.5;
    case 'HYDROPONICS':
      return !tasks.cropsHarvested;
    case 'RADAR_TOWER':
      return !tasks.dishAligned;
    case 'ROVER':
      return tasks.samplesAnalyzed < 1;
  }
};

export const SAMPLE_TUBES: { id: number; position: [number, number, number] }[] = [
  [5, -32],
  [45, -7],
  [2, 31.5],
  [-38, 6.5],
  [12, 3],
].map(([x, z], id) => ({
  id,
  position: [x!, getTerrainHeight(x!, z!) + 0.62, z!],
}));

const GUIDE_BEACONS: [number, number, number][] = [];
for (const station of STATIONS) {
  const distance = Math.hypot(station.position[0], station.position[2]);
  const steps = Math.floor(distance / 4);
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    const x = station.position[0] * ratio;
    const z = station.position[2] * ratio;
    GUIDE_BEACONS.push([x, getTerrainHeight(x, z) + 0.09, z]);
  }
}
const BIO_BED_POSITIONS: [number, number, number][] = [
  [-1.8, 0.72, -1.15],
  [1.8, 0.72, -1.15],
  [-1.8, 0.72, 1.15],
  [1.8, 0.72, 1.15],
];
const RADAR_LEG_ANGLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
const ROVER_PAD_LIGHTS: [number, number][] = [
  [-3.3, -3.3],
  [3.3, -3.3],
  [-3.3, 3.3],
  [3.3, 3.3],
];
const REGOLITH_DARK = new THREE.Color('#5b1f16');
const REGOLITH_MID = new THREE.Color('#a34629');
const REGOLITH_LIGHT = new THREE.Color('#d47a4a');
const TERRAIN_COLOR = new THREE.Color();
const ROCK_TRANSFORM = new THREE.Object3D();
const ROCK_COLOR = new THREE.Color();
const CONDUIT_DIM_COLOR = new THREE.Color('#172332');
const CONDUIT_TARGET_COLOR = new THREE.Color();
const CONDUIT_GLOW_COLOR = new THREE.Color();
const ROCK_COUNT = 420;

const createSeededRandom = (initialSeed: number) => {
  let seed = initialSeed;
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

interface RockDefinition {
  x: number;
  z: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotation: [number, number, number];
  color: number;
}

const createRockField = (): RockDefinition[] => {
  const random = createSeededRandom(27183);
  const rocks: RockDefinition[] = [];
  let attempts = 0;

  while (rocks.length < ROCK_COUNT && attempts < ROCK_COUNT * 5) {
    attempts += 1;
    const angle = random() * Math.PI * 2;
    const distance = 17 + Math.sqrt(random()) * 91;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const scale = 0.18 + Math.pow(random(), 2) * 1.35;
    const overlapsStructure = STRUCTURE_OBSTACLES.some(
      (obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + scale + 0.8,
    );
    const overlapsTerminal = STATIONS.some(
      (station) =>
        Math.hypot(x - station.position[0], z - station.position[2]) < station.radius + scale + 0.8,
    );

    if (overlapsStructure || overlapsTerminal) {
      continue;
    }

    const scaleX = scale * (0.75 + random() * 0.5);
    const scaleY = scale * (0.55 + random() * 0.55);
    const scaleZ = scale * (0.75 + random() * 0.5);
    const color = new THREE.Color().setHSL(
      0.025 + random() * 0.035,
      0.48 + random() * 0.2,
      0.2 + random() * 0.17,
    );

    rocks.push({
      x,
      z,
      scale,
      scaleX,
      scaleY,
      scaleZ,
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      color: color.getHex(),
    });
  }

  return rocks;
};

const ROCK_DEFINITIONS = createRockField();

export const SOLID_OBSTACLES: Array<{ x: number; z: number; radius: number }> = [
  { x: 0, z: 14, radius: 3.6 },
  ...STRUCTURE_OBSTACLES,
  ...ROCK_DEFINITIONS.filter((rock) => rock.scale >= 0.95).map((rock) => ({
    x: rock.x,
    z: rock.z,
    radius: Math.max(rock.scaleX, rock.scaleZ) * 0.82,
  })),
];

const createConduit = (
  station: StationDefinition,
  powerKey: PowerKey,
  color: string,
  conduitIndex: number,
): ConduitDefinition => {
  const startX = 1.5;
  const startZ = -1.5;
  const endX = station.position[0];
  const endZ = station.position[2];
  const deltaX = endX - startX;
  const deltaZ = endZ - startZ;
  const distance = Math.max(0.001, Math.hypot(deltaX, deltaZ));
  const perpendicularX = -deltaZ / distance;
  const perpendicularZ = deltaX / distance;
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= 6; index += 1) {
    const progress = index / 6;
    const bend = Math.sin(progress * Math.PI) * (conduitIndex % 2 === 0 ? 1.2 : -1.2);
    const x = startX + deltaX * progress + perpendicularX * bend;
    const z = startZ + deltaZ * progress + perpendicularZ * bend;
    points.push(new THREE.Vector3(x, getTerrainHeight(x, z) + 0.11, z));
  }

  return {
    curve: new THREE.CatmullRomCurve3(points),
    powerKey,
    color,
  };
};

const CONDUITS = [
  createConduit(STATIONS[0]!, 'thermalPower', '#fb7185', 0),
  createConduit(STATIONS[1]!, 'shieldSensorPower', '#67e8f9', 1),
  createConduit(STATIONS[2]!, 'shieldSensorPower', '#8b5cf6', 2),
  createConduit(STATIONS[3]!, 'thrusterPower', '#fbbf24', 3),
];

interface StationComponentProps {
  station: StationDefinition;
}

const createTerrainTextures = (): { color: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null => {
    const size = 1024;
    const colorCanvas = document.createElement('canvas');
    const bumpCanvas = document.createElement('canvas');
    colorCanvas.width = size;
    colorCanvas.height = size;
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const colorContext = colorCanvas.getContext('2d');
    const bumpContext = bumpCanvas.getContext('2d');

    if (!colorContext || !bumpContext) {
      return null;
    }

    const colorImage = colorContext.createImageData(size, size);
    const bumpImage = bumpContext.createImageData(size, size);
    const random = createSeededRandom(9371);
    const dark: readonly [number, number, number] = [110, 44, 22];
    const base: readonly [number, number, number] = [140, 59, 32];
    const light: readonly [number, number, number] = [166, 75, 42];

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const broadVariation =
          Math.sin(x * 0.013 + y * 0.009) * 0.19 +
          Math.cos(x * 0.031 - y * 0.017) * 0.13;
        const ripple = Math.sin(y * 0.29 + Math.sin(x * 0.021) * 3.4 + x * 0.016);
        const grit = (random() - 0.5) * 2;
        const pebble = random() > 0.988 ? (random() > 0.5 ? 1 : -1) : 0;
        const tone = THREE.MathUtils.clamp(0.5 + broadVariation + grit * 0.09, 0, 1);
        const lowerColor = tone < 0.5 ? dark : base;
        const upperColor = tone < 0.5 ? base : light;
        const blend = tone < 0.5 ? tone * 2 : (tone - 0.5) * 2;
        const shade = 1 + ripple * 0.075 + grit * 0.12 + pebble * 0.18;

        for (let channel = 0; channel < 3; channel += 1) {
          colorImage.data[offset + channel] = Math.round(
            THREE.MathUtils.clamp(
              (lowerColor[channel]! + (upperColor[channel]! - lowerColor[channel]!) * blend) * shade,
              0,
              255,
            ),
          );
        }
        colorImage.data[offset + 3] = 255;
        const bumpValue = Math.round(
          THREE.MathUtils.clamp(128 + ripple * 44 + grit * 32 + pebble * 58, 20, 238),
        );
        bumpImage.data[offset] = bumpValue;
        bumpImage.data[offset + 1] = bumpValue;
        bumpImage.data[offset + 2] = bumpValue;
        bumpImage.data[offset + 3] = 255;
      }
    }

    colorContext.putImageData(colorImage, 0, 0);
    bumpContext.putImageData(bumpImage, 0, 0);
    const color = new THREE.CanvasTexture(colorCanvas);
    const bump = new THREE.CanvasTexture(bumpCanvas);

    for (const texture of [color, bump]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(12, 12);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    color.colorSpace = THREE.SRGBColorSpace;
    bump.colorSpace = THREE.NoColorSpace;
    return { color, bump };
};

const MartianTerrain = () => {
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  const terrainTextures = useMemo(() => createTerrainTextures(), []);

  useEffect(
    () => () => {
      terrainTextures?.color.dispose();
      terrainTextures?.bump.dispose();
    },
    [terrainTextures],
  );

  useLayoutEffect(() => {
    const geometry = geometryRef.current;

    if (!geometry) {
      return;
    }

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = -positions.getY(index);
      const height = getTerrainHeight(x, z);
      const colorBlend = THREE.MathUtils.clamp((height + 2.2) / 7.5, 0, 1);
      const grain = Math.sin(x * 0.63) * Math.cos(z * 0.57) * 0.055;

      positions.setZ(index, height);
      TERRAIN_COLOR.copy(REGOLITH_DARK).lerp(REGOLITH_MID, Math.min(1, colorBlend * 1.45));

      if (colorBlend > 0.45) {
        TERRAIN_COLOR.lerp(REGOLITH_LIGHT, (colorBlend - 0.45) * 0.8);
      }

      TERRAIN_COLOR.offsetHSL(0, 0, grain);
      TERRAIN_COLOR.toArray(colors, index * 3);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }, []);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry ref={geometryRef} args={[240, 240, 128, 128]} />
      <meshStandardMaterial
        map={terrainTextures?.color}
        roughness={0.96}
        metalness={0.02}
        flatShading={false}
        bumpMap={terrainTextures?.bump}
        bumpScale={0.18}
        roughnessMap={terrainTextures?.bump}
      />
    </mesh>
  );
};

const RockField = () => {
  const rocksRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const rocks = rocksRef.current;

    if (!rocks) {
      return;
    }

    for (let index = 0; index < ROCK_DEFINITIONS.length; index += 1) {
      const rock = ROCK_DEFINITIONS[index]!;
      ROCK_TRANSFORM.position.set(rock.x, getTerrainHeight(rock.x, rock.z) - rock.scale * 0.25, rock.z);
      ROCK_TRANSFORM.rotation.set(...rock.rotation);
      ROCK_TRANSFORM.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ);
      ROCK_TRANSFORM.updateMatrix();
      rocks.setMatrixAt(index, ROCK_TRANSFORM.matrix);
      ROCK_COLOR.setHex(rock.color);
      rocks.setColorAt(index, ROCK_COLOR);
    }

    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) {
      rocks.instanceColor.needsUpdate = true;
    }
    rocks.computeBoundingSphere();
  }, []);

  return (
    <instancedMesh ref={rocksRef} args={[undefined, undefined, ROCK_DEFINITIONS.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffffff" roughness={0.96} metalness={0.02} flatShading />
    </instancedMesh>
  );
};

const GuideBeacons = () => {
  const beaconsRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const beacons = beaconsRef.current;
    if (!beacons) return;

    for (let index = 0; index < GUIDE_BEACONS.length; index += 1) {
      ROCK_TRANSFORM.position.set(...GUIDE_BEACONS[index]!);
      ROCK_TRANSFORM.rotation.set(0, 0, 0);
      ROCK_TRANSFORM.scale.setScalar(1);
      ROCK_TRANSFORM.updateMatrix();
      beacons.setMatrixAt(index, ROCK_TRANSFORM.matrix);
    }
    beacons.instanceMatrix.needsUpdate = true;
    beacons.computeBoundingSphere();
  }, []);

  return (
    <instancedMesh ref={beaconsRef} args={[undefined, undefined, GUIDE_BEACONS.length]}>
      <cylinderGeometry args={[0.13, 0.2, 0.12, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.4} roughness={0.45} />
    </instancedMesh>
  );
};

const SAMPLE_HOVER_HEIGHT = 0.9;

const SampleTubeField = () => {
  const collectedIds = useGameStore((state) => state.collectedSampleTubeIds);
  const tubesRef = useRef<(THREE.Group | null)[]>([]);

  useFrame((frameState) => {
    for (let index = 0; index < SAMPLE_TUBES.length; index += 1) {
      const tube = tubesRef.current[index];
      if (!tube) continue;
      tube.rotation.y = frameState.clock.elapsedTime * 1.4 + index;
      tube.position.y = SAMPLE_HOVER_HEIGHT + Math.sin(frameState.clock.elapsedTime * 2 + index) * 0.07;
    }
  });

  return (
    <group>
      {SAMPLE_TUBES.map((sample, index) => (
        <group key={sample.id} position={[sample.position[0], sample.position[1] - 0.62, sample.position[2]]}>
          <mesh receiveShadow castShadow position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.35, 0.45, 0.4, 6]} />
            <meshStandardMaterial color="#393437" roughness={0.96} metalness={0.04} flatShading />
          </mesh>
          <group visible={!collectedIds.includes(sample.id)}>
            <mesh position={[0, 1.03, 0]}>
              <cylinderGeometry args={[0.035, 0.09, 1.45, 12, 1, true]} />
              <meshBasicMaterial color="#fde68a" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
            </mesh>
            <group
              ref={(group) => {
                tubesRef.current[index] = group;
              }}
              position={[0, SAMPLE_HOVER_HEIGHT, 0]}
            >
              <mesh castShadow>
                <cylinderGeometry args={[0.18, 0.18, 0.8, 20]} />
                <meshStandardMaterial color="#f7c948" emissive="#f59e0b" emissiveIntensity={1.25} metalness={0.72} roughness={0.26} />
              </mesh>
              {[-0.38, 0.38].map((y) => (
                <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.18, 0.035, 8, 20]} />
                  <meshStandardMaterial color="#f8fafc" metalness={0.75} roughness={0.25} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      ))}
    </group>
  );
};

const EnergyConduits = () => {
  const materialsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame((frameState, delta) => {
    const gameState = useGameStore.getState();
    const frameDelta = Math.min(delta, 0.1);

    for (let index = 0; index < CONDUITS.length; index += 1) {
      const material = materialsRef.current[index];
      const conduit = CONDUITS[index]!;

      if (!material) {
        continue;
      }

      const powerRatio = gameState[conduit.powerKey] / 80;
      const pulse = 0.88 + Math.sin(frameState.clock.elapsedTime * 2.4 + index * 1.3) * 0.12;
      CONDUIT_TARGET_COLOR.set(conduit.color);
      CONDUIT_GLOW_COLOR.copy(CONDUIT_DIM_COLOR).lerp(CONDUIT_TARGET_COLOR, powerRatio);
      material.emissive.copy(CONDUIT_GLOW_COLOR);
      material.emissiveIntensity = THREE.MathUtils.damp(
        material.emissiveIntensity,
        (0.65 + powerRatio * 2.6) * pulse,
        5,
        frameDelta,
      );
    }
  });

  return (
    <group>
      {CONDUITS.map((conduit, index) => (
        <mesh key={conduit.powerKey + index}>
          <tubeGeometry args={[conduit.curve, 64, 0.07, 6, false]} />
          <meshStandardMaterial
            ref={(material) => {
              materialsRef.current[index] = material;
            }}
            color="#26313a"
            emissive={conduit.color}
            emissiveIntensity={1.2}
            roughness={0.5}
            metalness={0.45}
            toneMapped={false}
          />
        </mesh>
      ))}
      <group position={[1.5, getTerrainHeight(1.5, -1.5), -1.5]}>
        <mesh castShadow position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.65, 0.85, 0.9, 12]} />
          <meshStandardMaterial color="#44515a" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.93, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.08, 16]} />
          <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={2.4} />
        </mesh>
        <pointLight position={[0, 1.15, 0]} color="#67e8f9" intensity={1.2} distance={6} />
      </group>
    </group>
  );
};

const BasaltFoundation = ({ radius, depth = 0.32 }: { radius: number; depth?: number }) => (
  <mesh receiveShadow position={[0, depth * 0.5 - 0.04, 0]}>
    <cylinderGeometry args={[radius, radius * 1.045, depth, 32]} />
    <meshStandardMaterial color="#24262a" roughness={0.96} metalness={0.02} />
  </mesh>
);

const STATION_PAD_PROFILE_CACHE = new Map<StationId, { top: number; skirtDepth: number }>();

const getStationPadProfile = (station: StationDefinition) => {
  const cached = STATION_PAD_PROFILE_CACHE.get(station.id);
  if (cached) return cached;
  const centerX = station.position[0];
  const centerZ = station.position[2];
  const centerY = station.position[1];
  const sampleRadius = station.radius + 0.06;
  let highestTerrain = centerY;
  let lowestTerrain = centerY;
  for (const radiusScale of [0.5, 1]) {
    for (let index = 0; index < 32; index += 1) {
      const angle = index / 32 * Math.PI * 2;
      const height = getTerrainHeight(
        centerX + Math.cos(angle) * sampleRadius * radiusScale,
        centerZ + Math.sin(angle) * sampleRadius * radiusScale,
      );
      highestTerrain = Math.max(highestTerrain, height);
      lowestTerrain = Math.min(lowestTerrain, height);
    }
  }
  const profile = {
    top: highestTerrain - centerY + 0.18,
    skirtDepth: Math.max(0.12, highestTerrain - lowestTerrain - 0.15),
  };
  STATION_PAD_PROFILE_CACHE.set(station.id, profile);
  return profile;
};

export const getWalkableSurfaceHeight = (x: number, z: number): number => {
  let height = getTerrainHeight(x, z);
  for (const station of STATIONS) {
    if (Math.hypot(x - station.position[0], z - station.position[2]) <= station.radius + 0.06) {
      height = Math.max(height, station.position[1] + getStationPadProfile(station).top);
    }
  }
  return height;
};

const EvaTerminal = ({ station }: StationComponentProps) => {
  const pad = getStationPadProfile(station);
  return (
    <group position={station.position}>
      <mesh receiveShadow castShadow position={[0, pad.top - 0.225, 0]}>
        <cylinderGeometry args={[station.radius + 0.06, station.radius + 0.12, 0.45, 48]} />
        <meshStandardMaterial color="#303940" roughness={0.78} metalness={0.22} />
      </mesh>
      <mesh receiveShadow position={[0, pad.top - 0.45 - pad.skirtDepth * 0.5, 0]}>
        <cylinderGeometry args={[station.radius + 0.12, station.radius + 0.28, pad.skirtDepth, 48]} />
        <meshStandardMaterial color="#29282a" roughness={0.97} metalness={0.02} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, pad.top + 0.032, 0]}>
        <torusGeometry args={[1.75, 0.026, 8, 64]} />
        <meshBasicMaterial color="#fc3d21" transparent opacity={0.78} />
      </mesh>
      <group position={[0, pad.top, 0]}>
        <BasaltFoundation radius={0.82} depth={0.24} />
        <group position={[0, 0.18, 0]}>
          <mesh castShadow position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.36, 0.48, 0.7, 12]} />
            <meshStandardMaterial color="#59636d" metalness={0.55} roughness={0.5} />
          </mesh>
          <group position={[0, 0.93, 0]} rotation={[-0.16, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.05, 0.72, 0.42]} />
              <meshStandardMaterial color="#d5d9dc" metalness={0.38} roughness={0.52} />
            </mesh>
            <mesh position={[0, 0.03, 0.218]}>
              <boxGeometry args={[0.79, 0.43, 0.025]} />
              <meshStandardMaterial color="#102534" emissive="#28718c" emissiveIntensity={0.35} roughness={0.4} />
            </mesh>
            <mesh position={[-0.43, 0, 0.225]}>
              <boxGeometry args={[0.07, 0.62, 0.03]} />
              <meshStandardMaterial color="#fc3d21" roughness={0.65} />
            </mesh>
            {[-0.2, 0, 0.2].map((x) => (
              <mesh key={x} position={[x, -0.25, 0.245]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 0.025, 10]} />
                <meshStandardMaterial color={x === 0 ? '#fbbf24' : '#7dd3fc'} roughness={0.5} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
};

const StationRing = ({ station }: StationComponentProps) => {
  const ringRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((frameState, delta) => {
    const ring = ringRef.current;
    const material = materialRef.current;

    if (!ring || !material) {
      return;
    }

    const state = useGameStore.getState();
    const isObjective =
      state.gameStatus === 'PLAYING' &&
      stationNeedsAttention(station.id, state.tasksCompleted, state.dustLevel);
    const pulse = Math.sin(frameState.clock.elapsedTime * 3.2) * 0.5 + 0.5;
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 7);

    ring.scale.setScalar(isObjective ? 1 + pulse * 0.09 : 1);
    material.opacity = THREE.MathUtils.lerp(
      material.opacity,
      isObjective ? 0.62 + pulse * 0.3 : 0.2,
      blend,
    );
  });

  return (
    <group position={station.position}>
      <group ref={ringRef} position={[0, getStationPadProfile(station).top + 0.036, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[station.radius - 0.075, 0.026, 8, 64]} />
          <meshBasicMaterial
            ref={materialRef}
            color="#fc3d21"
            transparent
            opacity={0.2}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
};

const StationBeacon = ({ station }: StationComponentProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((frameState, delta) => {
    const state = useGameStore.getState();
    let nearestObjective: StationId | 'NONE' = 'NONE';
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const candidate of STATIONS) {
      if (!stationNeedsAttention(candidate.id, state.tasksCompleted, state.dustLevel)) continue;
      const offsetX = PLAYER_POSITION.x - candidate.position[0];
      const offsetZ = PLAYER_POSITION.z - candidate.position[2];
      const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
      if (distanceSquared < nearestDistanceSquared) {
        nearestObjective = candidate.id;
        nearestDistanceSquared = distanceSquared;
      }
    }
    const shouldShow = state.gameStatus === 'PLAYING' && station.id === nearestObjective;
    if (groupRef.current) groupRef.current.visible = shouldShow;
    if (targetRef.current) {
      targetRef.current.quaternion.copy(frameState.camera.quaternion);
      targetRef.current.position.y = 4.15 + Math.sin(frameState.clock.elapsedTime * 2.2) * 0.18;
      targetRef.current.scale.setScalar(1 + Math.sin(frameState.clock.elapsedTime * 3.2) * 0.07);
    }
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(
        materialRef.current.opacity,
        shouldShow ? 0.82 : 0,
        6,
        Math.min(delta, 0.05),
      );
    }
  });

  return (
    <group ref={groupRef} position={station.position} visible={false}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.025, 0.09, 4, 8]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <group ref={targetRef} position={[0, 4.15, 0]}>
        <mesh>
          <torusGeometry args={[0.78, 0.045, 8, 48]} />
          <meshBasicMaterial ref={materialRef} color="#a5f3fc" transparent opacity={0.82} depthWrite={false} />
        </mesh>
        <mesh position={[0, -1.02, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.16, 0.34, 4]} />
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.18, 0.23, 4]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
};

const HydroponicsDome = () => {
  const bioBedMaterials = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame((_, delta) => {
    const gameState = useGameStore.getState();
    const targetIntensity =
      (0.25 + (gameState.thermalPower / 100) * 3) * (0.3 + gameState.cropHealth / 100 * 0.7);
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 4);

    for (const material of bioBedMaterials.current) {
      if (material) {
        material.emissiveIntensity = THREE.MathUtils.lerp(
          material.emissiveIntensity,
          targetIntensity,
          blend,
        );
      }
    }
  });

  return (
    <group position={getBuildingPosition('HYDROPONICS')}>
      <BasaltFoundation radius={5.65} depth={0.42} />
      <mesh receiveShadow position={[0, 0.2, 0]}>
        <cylinderGeometry args={[5.1, 5.35, 0.4, 32]} />
        <meshStandardMaterial color="#b8c2c5" metalness={0.7} roughness={0.32} />
      </mesh>
      <mesh castShadow scale={[1, 0.74, 1]} position={[0, 0.4, 0]}>
        <sphereGeometry args={[5.15, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#a8e7e4"
          transparent
          opacity={0.3}
          transmission={0.38}
          thickness={0.35}
          roughness={0.12}
          metalness={0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[5.12, 0.08, 10, 64]} />
        <meshStandardMaterial color="#d5ffff" metalness={0.5} roughness={0.4} />
      </mesh>
      {BIO_BED_POSITIONS.map((position, index) => (
        <group key={position.join(',')} position={position}>
          <mesh castShadow>
            <boxGeometry args={[2.25, 0.5, 1.45]} />
            <meshStandardMaterial color="#314f3c" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.32, 0]}>
            <boxGeometry args={[2.05, 0.18, 1.25]} />
            <meshStandardMaterial
              ref={(material) => {
                bioBedMaterials.current[index] = material;
              }}
              color="#66bd62"
              emissive="#42ff85"
              emissiveIntensity={1.2}
              roughness={0.55}
            />
          </mesh>
          {[-0.65, 0, 0.65].map((x) => (
            <group key={x} position={[x, 0.55, 0]}>
              <mesh castShadow position={[0, 0.2, 0]}>
                <capsuleGeometry args={[0.055, 0.32, 6, 10]} />
                <meshStandardMaterial color="#4c9a46" roughness={0.8} />
              </mesh>
              <mesh castShadow position={[0, 0.48, 0]} scale={[0.22, 0.14, 0.2]}>
                <sphereGeometry args={[1, 12, 8]} />
                <meshStandardMaterial color="#78c850" roughness={0.75} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <mesh castShadow position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.65, 0.8, 2.1, 16]} />
        <meshStandardMaterial color="#d7dfdf" metalness={0.6} roughness={0.3} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <group key={x} position={[x, 0.95, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.5, 1.5, 20]} />
            <meshPhysicalMaterial
              color="#9be7ef"
              transparent
              opacity={0.42}
              transmission={0.3}
              roughness={0.18}
              metalness={0.25}
            />
          </mesh>
          {[0.35, 0, -0.35].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.44, 0.035, 8, 24]} />
              <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.5} />
            </mesh>
          ))}
          <mesh position={[0, -0.82, 0]}>
            <cylinderGeometry args={[0.55, 0.65, 0.18, 16]} />
            <meshStandardMaterial color="#65747b" metalness={0.72} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, 4.65]}>
        <mesh castShadow position={[0, 1.05, 0]}>
          <boxGeometry args={[1.85, 1.85, 1.25]} />
          <meshStandardMaterial color="#8d9da4" metalness={0.72} roughness={0.3} />
        </mesh>
        <mesh position={[0, 1.05, 0.64]}>
          <boxGeometry args={[1.35, 1.45, 0.04]} />
          <meshStandardMaterial color="#173747" emissive="#22d3ee" emissiveIntensity={0.65} />
        </mesh>
        <pointLight position={[0, 1.5, 1]} color="#67e8f9" intensity={1.1} distance={4} />
      </group>
    </group>
  );
};

const SolarArrayField = ({ station }: StationComponentProps) => {
  const dustMaterialsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  useFrame((_, delta) => {
    const dustLevel = useGameStore.getState().dustLevel;
    const targetOpacity = (dustLevel / 100) * 0.68;

    for (const material of dustMaterialsRef.current) {
      if (material) {
        material.opacity = THREE.MathUtils.damp(material.opacity, targetOpacity, 4, delta);
      }
    }
  });

  return (
    <group position={getBuildingPosition(station.id)} rotation={[0, 0.28, 0]}>
      <BasaltFoundation radius={6.55} depth={0.34} />
      {[-3.2, 3.2].map((x, wingIndex) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow position={[0, 1.35, 0]}>
            <cylinderGeometry args={[0.18, 0.28, 2.7, 12]} />
            <meshStandardMaterial color="#aab8bd" metalness={0.85} roughness={0.25} />
          </mesh>
          <group position={[0, 2.8, 0]} rotation={[-0.38, 0, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[5.5, 0.16, 3.7]} />
              <meshStandardMaterial color="#b7c4c8" metalness={0.9} roughness={0.22} />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[5.15, 0.08, 3.35]} />
              <meshStandardMaterial color="#102d52" metalness={0.72} roughness={0.24} />
            </mesh>
            {[-1.7, 0, 1.7].map((panelX) => (
              <mesh key={panelX} position={[panelX, 0.15, 0]}>
                <boxGeometry args={[0.035, 0.025, 3.3]} />
                <meshBasicMaterial color="#5f85aa" />
              </mesh>
            ))}
            {[-1.05, 0, 1.05].map((panelZ) => (
              <mesh key={panelZ} position={[0, 0.15, panelZ]}>
                <boxGeometry args={[5.1, 0.025, 0.035]} />
                <meshBasicMaterial color="#5f85aa" />
              </mesh>
            ))}
            <mesh position={[0, 0.175, 0]}>
              <boxGeometry args={[5.12, 0.018, 3.32]} />
              <meshStandardMaterial
                ref={(material) => {
                  dustMaterialsRef.current[wingIndex] = material;
                }}
                color="#7b472d"
                roughness={1}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          </group>
          <mesh position={[0, 3.35, 0]}>
            <sphereGeometry args={[0.16, 12, 8]} />
            <meshStandardMaterial color="#8affc1" emissive="#32ff91" emissiveIntensity={2.2} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.65, -1.8]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.72, 0.9, 1.3, 20]} />
          <meshStandardMaterial color="#66747a" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.74, 0.07, 8, 24]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
        </mesh>
      </group>
      <mesh castShadow position={[0, 0.8, 1.8]}>
        <boxGeometry args={[1.3, 1.6, 0.9]} />
        <meshStandardMaterial color="#53646d" metalness={0.75} roughness={0.32} />
      </mesh>
      <mesh position={[0, 1.05, 2.26]}>
        <boxGeometry args={[0.8, 0.35, 0.035]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.8} />
      </mesh>
    </group>
  );
};

const RadarTower = ({ station }: StationComponentProps) => {
  const radarRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!radarRef.current) return;
    const isAligned = useGameStore.getState().tasksCompleted.dishAligned;
    if (isAligned) {
      radarRef.current.rotation.y = THREE.MathUtils.damp(
        radarRef.current.rotation.y,
        -0.72,
        5,
        Math.min(delta, 0.05),
      );
    } else {
      radarRef.current.rotation.y += Math.min(delta, 0.1) * 0.42;
    }
  });

  return (
    <group position={getBuildingPosition(station.id)}>
      <BasaltFoundation radius={2.65} depth={0.4} />
      {RADAR_LEG_ANGLES.map((angle) => (
        <mesh
          key={angle}
          castShadow
          position={[Math.cos(angle) * 1.2, 1.8, Math.sin(angle) * 1.2]}
        >
          <cylinderGeometry args={[0.12, 0.2, 3.6, 8]} />
          <meshStandardMaterial color="#65747b" metalness={0.82} roughness={0.28} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.48, 0.85, 5.2, 12]} />
        <meshStandardMaterial color="#aebcc3" metalness={0.82} roughness={0.28} />
      </mesh>
      <mesh receiveShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[2.1, 2.35, 0.6, 20]} />
        <meshStandardMaterial color="#59676c" metalness={0.72} roughness={0.36} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.65, 0]}>
        <torusGeometry args={[0.85, 0.08, 8, 32]} />
        <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={1.8} />
      </mesh>
      <group ref={radarRef} position={[0, 5.5, 0]} rotation={[0.42, 0, 0]}>
        <mesh castShadow rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[2.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial
            color="#d7e0e2"
            metalness={0.72}
            roughness={0.26}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 2.3, 8]} />
          <meshStandardMaterial color="#d7e0e2" metalness={0.8} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <sphereGeometry args={[0.16, 12, 8]} />
          <meshStandardMaterial color="#ff9c76" emissive="#ff4e32" emissiveIntensity={2.5} />
        </mesh>
      </group>
      <group position={[0, 3.65, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 4.6, 10]} />
          <meshStandardMaterial color="#a5b4c0" metalness={0.88} roughness={0.25} />
        </mesh>
        {[-2.3, 2.3].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshStandardMaterial color="#a78bfa" emissive="#8b5cf6" emissiveIntensity={2.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const SHIELD_UNIFORMS = {
  color: { value: new THREE.Color('#7dd3fc') },
  opacity: { value: 0 },
};
const SHIELD_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const SHIELD_FRAGMENT_SHADER = `
  uniform vec3 color;
  uniform float opacity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    float edge = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
    gl_FragColor = vec4(color, opacity * (0.16 + edge * 0.84));
  }
`;
const SHIELD_PYLONS: [number, number][] = [
  [-62, -62],
  [62, -62],
  [-62, 62],
  [62, 62],
];

const ForcefieldDome = () => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    const activeSol = state.solsData[state.currentSolIndex]!;
    const shouldShow =
      state.shieldSensorPower > 40 ||
      state.tasksCompleted.dishAligned ||
      activeSol.weatherType === 'SOLAR_STORM';
    if (groupRef.current) groupRef.current.visible = shouldShow;
    SHIELD_UNIFORMS.opacity.value = THREE.MathUtils.damp(
      SHIELD_UNIFORMS.opacity.value,
      shouldShow ? 0.42 : 0,
      5,
      Math.min(delta, 0.05),
    );
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh position={[0, getTerrainHeight(0, 0) - 2, 0]} scale={[1, 0.48, 1]}>
        <sphereGeometry args={[88, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <shaderMaterial
          uniforms={SHIELD_UNIFORMS}
          vertexShader={SHIELD_VERTEX_SHADER}
          fragmentShader={SHIELD_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {SHIELD_PYLONS.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, getTerrainHeight(x, z), z]}>
          <mesh castShadow position={[0, 1.25, 0]}>
            <cylinderGeometry args={[0.34, 0.58, 2.5, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.62} roughness={0.42} />
          </mesh>
          <mesh position={[0, 2.58, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.2, 16]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const RoverModel = () => {
  const { scene } = useGLTF('/models/perseverance.glb');

  return (
    <group scale={0.7} rotation={[0, -0.55, 0]}>
      <primitive object={scene} />
    </group>
  );
};

const RoverScanner = () => {
  const isScanning = useGameStore(
    (state) => state.activeStation === 'ROVER' && state.tasksCompleted.samplesAnalyzed > 0,
  );

  return (
    <mesh visible={isScanning} position={[1.65, 0.85, 0.6]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.035, 0.035, 1.8, 10]} />
      <meshBasicMaterial color="#67e8f9" transparent opacity={0.85} />
    </mesh>
  );
};

const RoverSite = ({ station }: StationComponentProps) => (
  <group position={getBuildingPosition(station.id)}>
    <BasaltFoundation radius={4.65} depth={0.32} />
    <RoverScanner />
    <mesh receiveShadow position={[0, 0.13, 0]}>
      <cylinderGeometry args={[4.3, 4.5, 0.12, 32]} />
      <meshStandardMaterial color="#303238" roughness={0.94} metalness={0.03} />
    </mesh>
    {ROVER_PAD_LIGHTS.map(([x, z]) => (
      <group key={`${x}-${z}`} position={[x, 0.18, z]}>
        <mesh>
          <cylinderGeometry args={[0.09, 0.13, 0.35, 8]} />
          <meshStandardMaterial color="#53646d" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshBasicMaterial color="#67e8f9" />
        </mesh>
      </group>
    ))}
    <Suspense fallback={null}>
      <RoverModel />
    </Suspense>
    <group position={[2.7, 0.75, 0.6]} rotation={[0, -0.35, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.15, 1.35, 0.9]} />
        <meshStandardMaterial color="#c79a3b" metalness={0.72} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.2, 0.46]}>
        <boxGeometry args={[0.72, 0.28, 0.035]} />
        <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={1.6} />
      </mesh>
      {[-0.32, 0, 0.32].map((x) => (
        <mesh key={x} position={[x, -0.32, 0.47]}>
          <cylinderGeometry args={[0.08, 0.08, 0.42, 10]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
    </group>
    <group position={[-2.6, 0.5, 0.8]}>
      {[0, 0.32, 0.64].map((x) => (
        <mesh key={x} castShadow position={[x, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.13, 0.85, 12]} />
          <meshStandardMaterial color="#d7dde0" metalness={0.72} roughness={0.3} />
        </mesh>
      ))}
    </group>
  </group>
);

const ParkedMarsLander = () => {
  const status = useGameStore((state) => state.gameStatus);
  const groundY = getTerrainHeight(0, 14);

  return (
    <group visible={status !== 'MENU' && status !== 'VICTORY'}>
      <MarsLanderModel groundY={groundY} stairGroundY={getTerrainHeight(0, 10.2)} />
      <LanderVentMist groundY={groundY} active={status !== 'MENU'} />
    </group>
  );
};

export const MarsOutpost = () => (
  <group>
    <MartianTerrain />
    <ParkedMarsLander />
    <RockField />
    <GuideBeacons />
    <SampleTubeField />
    <EnergyConduits />
    <ForcefieldDome />
    {STATIONS.map((station) => (
      <group key={station.id}>
        <EvaTerminal station={station} />
        <StationRing station={station} />
        <StationBeacon station={station} />
      </group>
    ))}
    <HydroponicsDome />
    <SolarArrayField station={STATIONS[1]!} />
    <RadarTower station={STATIONS[2]!} />
    <RoverSite station={STATIONS[3]!} />
  </group>
);

useGLTF.preload('/models/perseverance.glb');
