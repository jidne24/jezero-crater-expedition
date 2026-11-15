import { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/* oxlint-disable react/only-export-components */

export interface NasaSuitPose {
  hipDip: number;
  hipBob: number;
  hipYaw: number;
  hipRoll: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  headPitch: number;
  headYaw: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftAnkle: number;
  rightAnkle: number;
  leftShoulder: number;
  rightShoulder: number;
  leftElbow: number;
  rightElbow: number;
}

export interface NasaSuitRigHandle {
  applyPose: (pose: NasaSuitPose, delta: number, immediate?: boolean) => void;
}

interface NasaSuitRigProps {
  scale?: number;
  isCommander?: boolean;
}

type JointName =
  | 'hips'
  | 'torso'
  | 'head'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow';

interface BuiltRig {
  mesh: THREE.SkinnedMesh;
  joints: Record<JointName, THREE.Bone>;
  dispose: () => void;
}

const MODEL_HEIGHT = 2;
const HIP_HEIGHT = MODEL_HEIGHT * 0.47;
const KNEE_DROP = MODEL_HEIGHT * 0.22;
const BONE_NAMES = [
  'root',
  'hips',
  'torso',
  'head',
  'leftHip',
  'leftKnee',
  'leftAnkle',
  'rightHip',
  'rightKnee',
  'rightAnkle',
  'leftShoulder',
  'leftElbow',
  'rightShoulder',
  'rightElbow',
] as const;

const smoothstep = (minimum: number, maximum: number, value: number): number => {
  const normalized = THREE.MathUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

export const createSuitPose = (): NasaSuitPose => ({
  hipDip: 0,
  hipBob: 0,
  hipYaw: 0,
  hipRoll: 0,
  torsoPitch: 0,
  torsoYaw: 0,
  torsoRoll: 0,
  headPitch: 0,
  headYaw: 0,
  leftHip: 0,
  rightHip: 0,
  leftKnee: 0.08,
  rightKnee: 0.08,
  leftAnkle: 0,
  rightAnkle: 0,
  leftShoulder: 0,
  rightShoulder: 0,
  leftElbow: -0.32,
  rightElbow: -0.32,
});

const addWeight = (
  indices: number[],
  weights: number[],
  boneIndex: number,
  weight: number,
): void => {
  if (weight <= 0 || indices.includes(boneIndex)) return;
  indices.push(boneIndex);
  weights.push(weight);
};

const applyProceduralSkinning = (
  geometry: THREE.BufferGeometry,
  centerZ: number,
  depthD: number,
): void => {
  const position = geometry.getAttribute('position');
  const skinIndices = new Uint16Array(position.count * 4);
  const skinWeights = new Float32Array(position.count * 4);

  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const nx = position.getX(vertex) / MODEL_HEIGHT;
    const ny = position.getY(vertex) / MODEL_HEIGHT;
    const nz = (position.getZ(vertex) - centerZ) / depthD;
    const absoluteNx = Math.abs(nx);
    const side = nx < 0 ? 'left' : 'right';
    const indices: number[] = [];
    const weights: number[] = [];
    const isHelmet = ny > 0.75 && absoluteNx < 0.16;
    const isArm = absoluteNx >= 0.13 && ny >= 0.35 && ny <= 0.73;
    const isLeg = ny < 0.42 && absoluteNx < 0.125 && nz >= -0.05;

    if (isHelmet || ny >= 0.76) {
      addWeight(indices, weights, BONE_NAMES.indexOf('head'), 1);
    } else if (isArm) {
      const armWeight =
        THREE.MathUtils.smoothstep(absoluteNx, 0.125, 0.17) *
        smoothstep(0.35, 0.4, ny) *
        (1 - smoothstep(0.7, 0.73, ny));
      addWeight(indices, weights, BONE_NAMES.indexOf('torso'), 1 - armWeight);
      addWeight(indices, weights, BONE_NAMES.indexOf(`${side}Shoulder`), armWeight);
    } else if (isLeg) {
      const legWeight = 1 - smoothstep(0.38, 0.42, ny);
      const shinWeight = 1 - smoothstep(0.25, 0.34, ny);
      const footWeight = 1 - smoothstep(0.03, 0.09, ny);

      addWeight(indices, weights, BONE_NAMES.indexOf('torso'), 1 - legWeight);
      addWeight(
        indices,
        weights,
        BONE_NAMES.indexOf(`${side}Hip`),
        legWeight * (1 - shinWeight),
      );
      addWeight(
        indices,
        weights,
        BONE_NAMES.indexOf(`${side}Knee`),
        legWeight * shinWeight * (1 - footWeight),
      );
      addWeight(
        indices,
        weights,
        BONE_NAMES.indexOf(`${side}Ankle`),
        legWeight * shinWeight * footWeight,
      );
    } else {
      const headWeight =
        smoothstep(0.7, 0.76, ny) *
        (1 - smoothstep(0.15, 0.2, absoluteNx));
      addWeight(indices, weights, BONE_NAMES.indexOf('torso'), 1 - headWeight);
      addWeight(indices, weights, BONE_NAMES.indexOf('head'), headWeight);
    }

    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    for (let influence = 0; influence < 4; influence += 1) {
      skinIndices[vertex * 4 + influence] = indices[influence] ?? 0;
      skinWeights[vertex * 4 + influence] = (weights[influence] ?? 0) / total;
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
};

const createBone = (name: string, x: number, y: number): THREE.Bone => {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(x, y, 0);
  return bone;
};

const buildRig = (source: THREE.Group, isCommander: boolean): BuiltRig => {
  const clonedScene = cloneSkeleton(source);
  clonedScene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(clonedScene);
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = MODEL_HEIGHT / Math.max(0.001, bounds.max.y - bounds.min.y);
  const normalization = new THREE.Matrix4().makeScale(scale, scale, scale);
  normalization.setPosition(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  const centerZ = center.z * scale + normalization.elements[14]!;
  const depthD = Math.max(0.001, (bounds.max.z - bounds.min.z) * scale);
  const sourceMeshes: THREE.Mesh[] = [];
  clonedScene.traverse((object) => {
    if (object instanceof THREE.Mesh) sourceMeshes.push(object);
  });
  if (sourceMeshes.length === 0) throw new Error('The NASA astronaut model contains no meshes.');

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  const root = createBone('root', 0, 0);
  const hips = createBone('hips', 0, HIP_HEIGHT);
  const torso = createBone('torso', 0, 0.12);
  const head = createBone('head', 0, MODEL_HEIGHT * 0.78 - HIP_HEIGHT - 0.12);
  const leftHip = createBone('leftHip', -0.2, 0);
  const rightHip = createBone('rightHip', 0.2, 0);
  const leftKnee = createBone('leftKnee', 0, -KNEE_DROP);
  const rightKnee = createBone('rightKnee', 0, -KNEE_DROP);
  const leftAnkle = createBone('leftAnkle', 0, -KNEE_DROP);
  const rightAnkle = createBone('rightAnkle', 0, -KNEE_DROP);
  const shoulderHeight = MODEL_HEIGHT * 0.7 - HIP_HEIGHT - 0.12;
  const leftShoulder = createBone('leftShoulder', -0.15 * MODEL_HEIGHT, shoulderHeight);
  const rightShoulder = createBone('rightShoulder', 0.15 * MODEL_HEIGHT, shoulderHeight);
  const leftElbow = createBone('leftElbow', -0.04 * MODEL_HEIGHT, -0.15 * MODEL_HEIGHT);
  const rightElbow = createBone('rightElbow', 0.04 * MODEL_HEIGHT, -0.15 * MODEL_HEIGHT);
  root.add(hips);
  hips.add(torso, leftHip, rightHip);
  torso.add(head, leftShoulder, rightShoulder);
  leftHip.add(leftKnee);
  rightHip.add(rightKnee);
  leftKnee.add(leftAnkle);
  rightKnee.add(rightAnkle);
  leftShoulder.add(leftElbow);
  rightShoulder.add(rightElbow);
  const bones = [
    root,
    hips,
    torso,
    head,
    leftHip,
    leftKnee,
    leftAnkle,
    rightHip,
    rightKnee,
    rightAnkle,
    leftShoulder,
    leftElbow,
    rightShoulder,
    rightElbow,
  ];

  if (isCommander) {
    const star = new THREE.Shape();
    for (let point = 0; point < 10; point += 1) {
      const angle = Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 === 0 ? 0.072 : 0.032;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) star.moveTo(x, y);
      else star.lineTo(x, y);
    }
    star.closePath();
    const badgeGeometry = new THREE.ShapeGeometry(star);
    const badgeMaterial = new THREE.MeshStandardMaterial({
      color: '#f4c85a',
      emissive: '#8a5a12',
      emissiveIntensity: 0.18,
      metalness: 0.72,
      roughness: 0.24,
      side: THREE.DoubleSide,
    });
    const badge = new THREE.Mesh(badgeGeometry, badgeMaterial);
    badge.name = 'NASA Commander Chest Star';
    badge.position.set(0.12, 0.24, 0.3);
    torso.add(badge);
    geometries.push(badgeGeometry);
    materials.push(badgeMaterial);
  }

  for (const sourceMesh of sourceMeshes) {
    const geometry = sourceMesh.geometry.clone();
    geometry.applyMatrix4(sourceMesh.matrixWorld);
    geometry.applyMatrix4(normalization);
    applyProceduralSkinning(geometry, centerZ, depthD);
    geometry.computeBoundingSphere();
    const clonedMaterials = (Array.isArray(sourceMesh.material)
      ? sourceMesh.material
      : [sourceMesh.material]
    ).map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      if (material instanceof THREE.MeshStandardMaterial) material.flatShading = false;
      materials.push(material);
      return material;
    });
    const mesh = new THREE.SkinnedMesh(
      geometry,
      Array.isArray(sourceMesh.material) ? clonedMaterials : clonedMaterials[0]!,
    );
    mesh.name = isCommander ? 'NASA Commander xEMU' : 'NASA Junior xEMU';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (skinnedMeshes.length === 0) mesh.add(root);
    mesh.updateMatrixWorld(true);
    mesh.bind(skinnedMeshes[0]?.skeleton ?? new THREE.Skeleton(bones));
    geometries.push(geometry);
    skinnedMeshes.push(mesh);
  }

  const mesh = skinnedMeshes[0]!;
  for (let index = 1; index < skinnedMeshes.length; index += 1) {
    const child = skinnedMeshes[index]!;
    mesh.add(child);
  }

  return {
    mesh,
    joints: {
      hips,
      torso,
      head,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      mesh.skeleton.dispose();
    },
  };
};

const dampAngle = (bone: THREE.Bone, axis: 'x' | 'y' | 'z', target: number, blend: number): void => {
  bone.rotation[axis] = THREE.MathUtils.lerp(bone.rotation[axis], target, blend);
};

export const NasaSuitRig = forwardRef<NasaSuitRigHandle, NasaSuitRigProps>(
  function NasaSuitRig({ scale = 1, isCommander = false }, ref) {
    const { scene } = useGLTF('/models/astronaut.glb');
    const rig = useMemo(() => buildRig(scene, isCommander), [scene, isCommander]);

    useImperativeHandle(
      ref,
      () => ({
        applyPose: (pose, delta, immediate = false) => {
          const blend = immediate ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 12);
          const { joints } = rig;
          joints.hips.position.y = THREE.MathUtils.lerp(
            joints.hips.position.y,
            HIP_HEIGHT - pose.hipDip + pose.hipBob,
            blend,
          );
          dampAngle(joints.hips, 'y', pose.hipYaw, blend);
          dampAngle(joints.hips, 'z', pose.hipRoll, blend);
          dampAngle(joints.torso, 'x', pose.torsoPitch, blend);
          dampAngle(joints.torso, 'y', pose.torsoYaw, blend);
          dampAngle(joints.torso, 'z', pose.torsoRoll, blend);
          dampAngle(joints.head, 'x', pose.headPitch, blend);
          dampAngle(joints.head, 'y', pose.headYaw, blend);
          dampAngle(joints.leftHip, 'x', pose.leftHip, blend);
          dampAngle(joints.rightHip, 'x', pose.rightHip, blend);
          dampAngle(joints.leftKnee, 'x', pose.leftKnee, blend);
          dampAngle(joints.rightKnee, 'x', pose.rightKnee, blend);
          dampAngle(joints.leftAnkle, 'x', pose.leftAnkle, blend);
          dampAngle(joints.rightAnkle, 'x', pose.rightAnkle, blend);
          dampAngle(joints.leftShoulder, 'x', pose.leftShoulder, blend);
          dampAngle(joints.rightShoulder, 'x', pose.rightShoulder, blend);
          dampAngle(joints.leftElbow, 'x', pose.leftElbow, blend);
          dampAngle(joints.rightElbow, 'x', pose.rightElbow, blend);
        },
      }),
      [rig],
    );

    useEffect(() => () => rig.dispose(), [rig]);

    return <group scale={scale}><primitive object={rig.mesh} /></group>;
  },
);

useGLTF.preload('/models/astronaut.glb');
