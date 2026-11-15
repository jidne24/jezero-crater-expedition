import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NasaHullMarkings, useSpacecraftTextures } from './SpacecraftDecals';

export const LANDER_X = 0;
export const LANDER_Z = 14;
export const LANDER_HATCH_HEIGHT = 2.2;
export const STAIR_TOP_Z = 12.2;
export const STAIR_BOTTOM_Z = 10.2;

const AIRLOCK_WIDTH = 1.4;
const AIRLOCK_HEIGHT = 2.4;
const AIRLOCK_BOTTOM_Y = LANDER_HATCH_HEIGHT;
const AIRLOCK_TOP_Y = AIRLOCK_BOTTOM_Y + AIRLOCK_HEIGHT;
const AIRLOCK_CENTER_Y = AIRLOCK_BOTTOM_Y + AIRLOCK_HEIGHT * 0.5;

type VectorTuple = [number, number, number];

const LANDING_LEG_POSITIONS: [number, number][] = [
  [-1.65, -1.65],
  [1.65, -1.65],
  [-1.65, 1.65],
  [1.65, 1.65],
];
const FOOTPAD_HEIGHT = 0.18;
const VENT_COUNT = 72;
const VENT_TRANSFORM = new THREE.Object3D();
const VENT_SEEDS = new Float32Array(VENT_COUNT * 4);
const VENT_EMITTERS: VectorTuple[] = [
  [-1.65, 0.84, -1.65],
  [1.65, 0.84, -1.65],
  [-1.65, 0.84, 1.65],
  [1.65, 0.84, 1.65],
  [-1.9, 1.4, 0],
  [1.9, 1.4, 0],
];
const VENT_UNIFORMS = {
  uColor: { value: new THREE.Color('#dbe2e5') },
  uOpacity: { value: 0.18 },
};
const VENT_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const VENT_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float softness = 1.0 - smoothstep(0.05, 0.5, length(vUv - 0.5));
    gl_FragColor = vec4(uColor, softness * uOpacity);
  }
`;

let ventSeed = 47821;
for (let index = 0; index < VENT_SEEDS.length; index += 1) {
  ventSeed = (ventSeed * 16807) % 2147483647;
  VENT_SEEDS[index] = (ventSeed - 1) / 2147483646;
}

const Beam = ({ start, end, radius = 0.04, color = '#9aa9b0' }: {
  start: VectorTuple;
  end: VectorTuple;
  radius?: number;
  color?: string;
}) => {
  const transform = useMemo(() => {
    const from = new THREE.Vector3(...start);
    const direction = new THREE.Vector3(...end).sub(from);
    return {
      position: from.clone().addScaledVector(direction, 0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [start, end]);

  return (
    <mesh castShadow position={transform.position} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius, radius, transform.length, 10]} />
      <meshStandardMaterial color={color} metalness={0.78} roughness={0.3} />
    </mesh>
  );
};

export const LanderVentMist = ({ groundY, active, phaseTime }: {
  groundY: number;
  active: boolean;
  phaseTime?: RefObject<number>;
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < VENT_COUNT; index += 1) {
      VENT_TRANSFORM.position.set(0, -20, 0);
      VENT_TRANSFORM.scale.setScalar(0);
      VENT_TRANSFORM.updateMatrix();
      mesh.setMatrixAt(index, VENT_TRANSFORM.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const visible = active && (!phaseTime || phaseTime.current >= 3.5);
    mesh.visible = visible;
    if (!visible) return;
    const elapsed = state.clock.elapsedTime;

    const airlockPuff = phaseTime && phaseTime.current >= 4.4 && phaseTime.current < 5.2;
    for (let index = 0; index < VENT_COUNT; index += 1) {
      const offset = index * 4;
      const life = (elapsed * (airlockPuff ? 0.85 : 0.2) + VENT_SEEDS[offset]!) % 1;
      const angle = VENT_SEEDS[offset + 1]! * Math.PI * 2 + elapsed * 0.16;
      const radius = 0.06 + life * (0.35 + VENT_SEEDS[offset + 2]! * 0.35);
      const emitter = VENT_EMITTERS[index % VENT_EMITTERS.length]!;
      const scale = Math.sin(life * Math.PI) * (airlockPuff ? 0.28 + life * 0.38 : 0.24 + life * 0.62);
      if (airlockPuff && index < 28) {
        VENT_TRANSFORM.position.set(
          LANDER_X + Math.cos(angle) * radius * 0.65,
          LANDER_HATCH_HEIGHT + 0.85 + life * 1.15,
          STAIR_TOP_Z - 0.16 - life * 0.75,
        );
      } else {
        VENT_TRANSFORM.position.set(
          emitter[0] + Math.cos(angle) * radius + life * 0.28,
          emitter[1] + life * (1.15 + VENT_SEEDS[offset + 3]! * 0.8),
          emitter[2] + Math.sin(angle) * radius - life * 0.12,
        );
      }
      VENT_TRANSFORM.quaternion.copy(state.camera.quaternion);
      VENT_TRANSFORM.scale.set(scale * 1.25, scale, scale);
      VENT_TRANSFORM.updateMatrix();
      mesh.setMatrixAt(index, VENT_TRANSFORM.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[LANDER_X, groundY, LANDER_Z]}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, VENT_COUNT]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={VENT_UNIFORMS}
          vertexShader={VENT_VERTEX_SHADER}
          fragmentShader={VENT_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
};

export const MarsLanderModel = ({
  groundY,
  stairGroundY,
  deployed = true,
  landerRef,
  thrustersRef,
  stairwayRef,
  doorPivotRef,
  sealMaterialRef,
}: {
  groundY: number;
  stairGroundY: number;
  deployed?: boolean;
  landerRef?: RefObject<THREE.Group | null>;
  thrustersRef?: RefObject<THREE.Group | null>;
  stairwayRef?: RefObject<THREE.Group | null>;
  doorPivotRef?: RefObject<THREE.Group | null>;
  sealMaterialRef?: RefObject<THREE.MeshStandardMaterial | null>;
}) => {
  const textures = useSpacecraftTextures();
  const stairBottom = stairGroundY - groundY - LANDER_HATCH_HEIGHT;

  return (
    <group ref={landerRef} position={[LANDER_X, groundY, LANDER_Z]} rotation={[0, Math.PI, 0]}>
      <mesh castShadow position={[0, 3.425, 0]}>
        <cylinderGeometry args={[1.8, 2.2, 3.15, 32, 1, true, 0.27, Math.PI * 2 - 0.54]} />
        <meshStandardMaterial color="#d9dfe1" metalness={0.62} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, AIRLOCK_TOP_Y + 0.2, 0]}>
        <cylinderGeometry args={[1.8, 1.851, 0.4, 8, 1, false, -0.27, 0.54]} />
        <meshStandardMaterial color="#d9dfe1" metalness={0.62} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 2.025, 0]}>
        <cylinderGeometry args={[2.15, 2.2, 0.35, 8, 1, false, -0.27, 0.54]} />
        <meshStandardMaterial color="#d9dfe1" metalness={0.62} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 5, 0]}>
        <sphereGeometry args={[1.5, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e9edee" metalness={0.45} roughness={0.38} />
      </mesh>
      <mesh position={[0, 4.81, 1.84]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[1.5, 0.32, 0.055]} />
        <meshStandardMaterial color="#18384b" emissive="#68cfea" emissiveIntensity={0.52} metalness={0.62} roughness={0.2} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.55, 4.65, 0.94]} rotation={[0, side * 1.03, 0]}>
          <boxGeometry args={[0.58, 0.36, 0.055]} />
          <meshStandardMaterial color="#17354a" emissive="#58b7d4" emissiveIntensity={0.38} metalness={0.62} roughness={0.2} />
        </mesh>
      ))}
      <NasaHullMarkings textures={textures} radius={1.99} centerY={3.83} size={0.68} />

      <group>
        <mesh position={[0, AIRLOCK_CENTER_Y, 1.24]}>
          <boxGeometry args={[AIRLOCK_WIDTH, AIRLOCK_HEIGHT, 0.08]} />
          <meshStandardMaterial color="#101820" roughness={0.85} metalness={0.12} />
        </mesh>
        {[-(AIRLOCK_WIDTH * 0.5 + 0.04), AIRLOCK_WIDTH * 0.5 + 0.04].map((x) => (
          <mesh key={x} position={[x, AIRLOCK_CENTER_Y, 1.63]}>
            <boxGeometry args={[0.08, AIRLOCK_HEIGHT, 0.82]} />
            <meshStandardMaterial color="#26333b" roughness={0.65} metalness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, AIRLOCK_TOP_Y + 0.04, 1.63]}>
          <boxGeometry args={[AIRLOCK_WIDTH + 0.08, 0.08, 0.82]} />
          <meshStandardMaterial color="#27353e" metalness={0.52} roughness={0.4} />
        </mesh>
        <mesh receiveShadow position={[0, AIRLOCK_BOTTOM_Y - 0.04, 1.63]}>
          <boxGeometry args={[AIRLOCK_WIDTH + 0.08, 0.08, 0.82]} />
          <meshStandardMaterial color="#75858e" metalness={0.72} roughness={0.34} />
        </mesh>
        <mesh position={[0, AIRLOCK_TOP_Y - 0.12, 1.48]}>
          <boxGeometry args={[1, 0.035, 0.18]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
        <pointLight position={[0, AIRLOCK_CENTER_Y + 0.15, 1.76]} color="#fde047" intensity={1.5} distance={3.5} decay={2} />
        {[-(AIRLOCK_WIDTH * 0.5 + 0.05), AIRLOCK_WIDTH * 0.5 + 0.05].map((x) => (
          <mesh key={x} castShadow position={[x, AIRLOCK_CENTER_Y, 2.02]}>
            <boxGeometry args={[0.1, AIRLOCK_HEIGHT, 0.16]} />
            <meshStandardMaterial color="#c8d2d7" metalness={0.75} roughness={0.27} />
          </mesh>
        ))}
        <mesh castShadow position={[0, AIRLOCK_TOP_Y + 0.05, 2.02]}>
          <boxGeometry args={[AIRLOCK_WIDTH + 0.2, 0.1, 0.16]} />
          <meshStandardMaterial color="#c8d2d7" metalness={0.75} roughness={0.27} />
        </mesh>
        <mesh castShadow position={[0, AIRLOCK_BOTTOM_Y - 0.05, 2.02]}>
          <boxGeometry args={[AIRLOCK_WIDTH + 0.2, 0.1, 0.24]} />
          <meshStandardMaterial color="#82949e" metalness={0.75} roughness={0.3} />
        </mesh>
        <group name="LanderAirlockDoorPivot" ref={doorPivotRef} position={[AIRLOCK_WIDTH * 0.5, AIRLOCK_CENTER_Y, 2.075]}>
          <mesh castShadow position={[-AIRLOCK_WIDTH * 0.5, 0, 0]}>
            <boxGeometry args={[AIRLOCK_WIDTH, AIRLOCK_HEIGHT, 0.1]} />
            <meshStandardMaterial color="#c5d0d5" metalness={0.72} roughness={0.28} />
          </mesh>
          <mesh position={[-AIRLOCK_WIDTH * 0.5, 0.45, 0.064]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.23, 0.23, 0.028, 32]} />
            <meshStandardMaterial color="#102c3d" emissive="#4a9eba" emissiveIntensity={0.24} metalness={0.65} roughness={0.2} />
          </mesh>
          <mesh position={[-AIRLOCK_WIDTH * 0.5, 0.45, 0.083]}>
            <torusGeometry args={[0.255, 0.032, 8, 32]} />
            <meshStandardMaterial color="#e3e9ec" metalness={0.8} roughness={0.24} />
          </mesh>
          <mesh position={[-AIRLOCK_WIDTH + 0.14, -0.25, 0.085]}>
            <boxGeometry args={[0.055, 0.28, 0.065]} />
            <meshStandardMaterial color="#43545e" metalness={0.78} roughness={0.26} />
          </mesh>
          {[-0.86, 0.86].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <cylinderGeometry args={[0.055, 0.055, 0.28, 12]} />
              <meshStandardMaterial color="#6c7e87" metalness={0.8} roughness={0.26} />
            </mesh>
          ))}
        </group>
        <mesh position={[-AIRLOCK_WIDTH * 0.5 - 0.1, AIRLOCK_TOP_Y - 0.13, 2.115]}>
          <sphereGeometry args={[0.045, 12, 8]} />
          <meshStandardMaterial ref={sealMaterialRef} color="#4ade80" emissive="#22c55e" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
      </group>

      <mesh position={[0, 2.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2, 0.12, 10, 32]} />
        <meshStandardMaterial color="#c66a30" metalness={0.62} roughness={0.4} />
      </mesh>
      {LANDING_LEG_POSITIONS.map(([x, z]) => (
        <group key={`${x}-${z}`}>
          <Beam start={[Math.sign(x) * 1.25, 1.95, Math.sign(z) * 1.25]} end={[x, 0.16, z]} radius={0.12} color="#697780" />
          <mesh position={[x, FOOTPAD_HEIGHT * 0.5, z]} castShadow>
            <cylinderGeometry args={[0.5, 0.6, FOOTPAD_HEIGHT, 20]} />
            <meshStandardMaterial color="#545e63" metalness={0.7} roughness={0.45} />
          </mesh>
          <mesh position={[x, 1.1, z]}>
            <cylinderGeometry args={[0.18, 0.32, 0.46, 20]} />
            <meshStandardMaterial color="#79503a" emissive="#ff6426" emissiveIntensity={0.9} metalness={0.68} roughness={0.28} />
          </mesh>
          <mesh position={[x, 0.855, z]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.045, 8, 20]} />
            <meshBasicMaterial color="#ff8b42" transparent opacity={0.75} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.42, 0.72, 0.75, 24]} />
        <meshStandardMaterial color="#63483b" emissive="#ff5522" emissiveIntensity={0.78} metalness={0.72} roughness={0.3} />
      </mesh>
      <pointLight position={[0, 0.9, 0]} color="#ff7138" intensity={5} distance={5} decay={2} />
      <group ref={thrustersRef} visible={!deployed}>
        {LANDING_LEG_POSITIONS.map(([x, z]) => (
          <group key={`${x}-${z}`} position={[x, 0.78, z]}>
            <mesh position={[0, -0.65, 0]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.32, 1.6, 16]} />
              <meshBasicMaterial color="#ff8533" transparent opacity={0.68} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            <mesh position={[0, -0.45, 0]} scale={[0.52, 0.78, 0.52]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.32, 1.6, 16]} />
              <meshBasicMaterial color="#fff3d5" transparent opacity={0.94} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
        ))}
        <pointLight position={[0, 0.4, 0]} color="#ff8b42" intensity={70} distance={16} decay={2} />
      </group>
      <group
        ref={stairwayRef}
        position={[0, LANDER_HATCH_HEIGHT, 1.8]}
        rotation={[deployed ? 0 : -1.18, 0, 0]}
        scale={[1, 1, deployed ? 1 : 0.15]}
        visible={deployed}
      >
        <mesh castShadow position={[0, -0.075, 0.18]}>
          <boxGeometry args={[1.32, 0.15, 0.75]} />
          <meshStandardMaterial color="#7f919a" metalness={0.78} roughness={0.3} />
        </mesh>
        {Array.from({ length: 8 }, (_, index) => {
          const ratio = index / 7;
          return (
            <mesh key={index} castShadow position={[0, THREE.MathUtils.lerp(-0.06, stairBottom - 0.06, ratio), ratio * 2]}>
              <boxGeometry args={[1.18, 0.12, 0.34]} />
              <meshStandardMaterial color="#a5b2b8" metalness={0.76} roughness={0.34} />
            </mesh>
          );
        })}
        {[-0.67, 0.67].map((x) => (
          <group key={x}>
            <Beam start={[x, 0.94, 0.05]} end={[x, stairBottom + 0.94, 2.02]} radius={0.035} />
            {[1, 3, 5, 7].map((index) => {
              const ratio = index / 7;
              const treadY = THREE.MathUtils.lerp(-0.06, stairBottom - 0.06, ratio);
              return <Beam key={index} start={[x, treadY, ratio * 2]} end={[x, treadY + 0.91, ratio * 2]} radius={0.024} />;
            })}
          </group>
        ))}
      </group>
    </group>
  );
};
