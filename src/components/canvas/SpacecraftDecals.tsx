/* oxlint-disable react/only-export-components */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

interface SpacecraftTextures {
  meatball: THREE.CanvasTexture;
  worm: THREE.CanvasTexture;
  flag: THREE.CanvasTexture;
}

const createCanvas = (): [HTMLCanvasElement, CanvasRenderingContext2D] | null => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  return context ? [canvas, context] : null;
};

const createMeatball = (): THREE.CanvasTexture | null => {
  const surface = createCanvas();
  if (!surface) return null;
  const [canvas, context] = surface;
  context.save();
  context.beginPath();
  context.arc(256, 256, 238, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = '#0b3d91';
  context.fillRect(0, 0, 512, 512);

  let seed = 1701;
  for (let index = 0; index < 75; index += 1) {
    seed = (seed * 16807) % 2147483647;
    const x = (seed / 2147483647) * 512;
    seed = (seed * 16807) % 2147483647;
    const y = (seed / 2147483647) * 512;
    const radius = index % 9 === 0 ? 3 : 1.6;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = '#fc3d21';
  context.beginPath();
  context.moveTo(20, 331);
  context.bezierCurveTo(136, 305, 183, 176, 264, 127);
  context.bezierCurveTo(216, 210, 215, 278, 272, 290);
  context.bezierCurveTo(340, 298, 413, 277, 494, 230);
  context.bezierCurveTo(412, 325, 305, 364, 220, 341);
  context.bezierCurveTo(144, 319, 85, 324, 20, 331);
  context.fill();

  context.strokeStyle = '#ffffff';
  context.lineWidth = 6;
  context.beginPath();
  context.ellipse(256, 258, 219, 62, -0.42, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.font = 'bold 142px Georgia, "Times New Roman", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('NASA', 256, 264);
  context.restore();

  return new THREE.CanvasTexture(canvas);
};

const createWorm = (): THREE.CanvasTexture | null => {
  const surface = createCanvas();
  if (!surface) return null;
  const [canvas, context] = surface;
  context.fillStyle = '#f4f6f7';
  context.fillRect(0, 0, 512, 512);
  context.save();
  context.translate(256, 256);
  context.rotate(-Math.PI / 2);
  context.fillStyle = '#fc3d21';
  context.font = '900 120px Arial, Helvetica, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('N A S A', 0, 5, 472);
  context.restore();
  return new THREE.CanvasTexture(canvas);
};

const createFlag = (): THREE.CanvasTexture | null => {
  const surface = createCanvas();
  if (!surface) return null;
  const [canvas, context] = surface;
  context.fillStyle = '#f4f6f7';
  context.fillRect(0, 0, 512, 512);
  const flagX = 54;
  const flagY = 108;
  const flagWidth = 404;
  const flagHeight = 250;
  const stripeHeight = flagHeight / 13;
  for (let stripe = 0; stripe < 13; stripe += 1) {
    context.fillStyle = stripe % 2 === 0 ? '#b22234' : '#ffffff';
    context.fillRect(flagX, flagY + stripe * stripeHeight, flagWidth, stripeHeight + 0.5);
  }
  context.fillStyle = '#3c3b6e';
  context.fillRect(flagX, flagY, flagWidth * 0.42, stripeHeight * 7);
  context.fillStyle = '#ffffff';
  for (let row = 0; row < 9; row += 1) {
    const count = row % 2 === 0 ? 6 : 5;
    for (let column = 0; column < count; column += 1) {
      context.beginPath();
      context.arc(flagX + 14 + column * 27 + (count === 5 ? 13.5 : 0), flagY + 12 + row * 17.5, 3.2, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.fillStyle = '#334155';
  context.font = 'bold 34px Arial, Helvetica, sans-serif';
  context.textAlign = 'center';
  context.fillText('JEZERO EXPEDITION', 256, 420);
  return new THREE.CanvasTexture(canvas);
};

const createSpacecraftTextures = (): SpacecraftTextures | null => {
  const meatball = createMeatball();
  const worm = createWorm();
  const flag = createFlag();
  if (!meatball || !worm || !flag) return null;
  for (const texture of [meatball, worm, flag]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
  return { meatball, worm, flag };
};

export const useSpacecraftTextures = (): SpacecraftTextures | null => {
  const textures = useMemo(() => createSpacecraftTextures(), []);

  useEffect(() => () => {
    textures?.meatball.dispose();
    textures?.worm.dispose();
    textures?.flag.dispose();
  }, [textures]);

  return textures;
};

export const HullDecal = ({ texture, radius, height, centerY, thetaStart = -0.45, arc = 0.9 }: {
  texture: THREE.CanvasTexture;
  radius: number;
  height: number;
  centerY: number;
  thetaStart?: number;
  arc?: number;
}) => (
  <mesh position={[0, centerY, 0]} renderOrder={2}>
    <cylinderGeometry args={[radius + 0.02, radius + 0.02, height, 32, 1, true, thetaStart, arc]} />
    <meshStandardMaterial
      map={texture}
      transparent
      alphaTest={0.02}
      depthWrite={false}
      polygonOffset
      polygonOffsetFactor={-2}
      roughness={0.48}
      metalness={0.08}
      side={THREE.DoubleSide}
    />
  </mesh>
);

export const NasaHullMarkings = ({ textures, radius, centerY, size }: {
  textures: SpacecraftTextures | null;
  radius: number;
  centerY: number;
  size: number;
}) => {
  if (!textures) return null;
  return (
    <group>
      <HullDecal texture={textures.meatball} radius={radius} height={size} centerY={centerY} />
      <HullDecal texture={textures.worm} radius={radius} height={size * 1.5} centerY={centerY} thetaStart={-1.22} arc={0.55} />
      <HullDecal texture={textures.flag} radius={radius} height={size * 0.62} centerY={centerY} thetaStart={0.72} arc={0.62} />
    </group>
  );
};
