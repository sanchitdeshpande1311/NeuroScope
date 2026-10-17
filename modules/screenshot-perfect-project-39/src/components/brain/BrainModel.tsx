import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { BrainMaterialPreset, TumorSubRegionId } from '../../types';
import { ProceduralBrainFallback } from './ProceduralBrainFallback';

interface BrainModelProps {
  modelPath?: string;
  preset?: BrainMaterialPreset;
  activeSubRegion?: TumorSubRegionId | 'all';
  autoRotate?: boolean;
  rotationSpeed?: number;
  wireframe?: boolean;
  opacity?: number;
}

const GLTFModelRenderer: React.FC<{
  modelPath: string;
  preset: BrainMaterialPreset;
  autoRotate: boolean;
  rotationSpeed: number;
  wireframe: boolean;
  opacity: number;
}> = ({ modelPath, preset, autoRotate, rotationSpeed, wireframe, opacity }) => {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(modelPath);

  const customMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#FFFFFF'),
      emissive: new THREE.Color('#1F1424'),
      emissiveIntensity: 0.12,
      roughness: 0.08,
      metalness: 0.12,
      transmission: 0.90,
      ior: 1.54,
      thickness: 2.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      specularIntensity: 1.6,
      specularColor: new THREE.Color('#FFF1D6'),
      attenuationColor: new THREE.Color('#E8C9A0'),
      attenuationDistance: 2.8,
      transparent: true,
      opacity: opacity,
      wireframe: wireframe,
      side: THREE.DoubleSide,
    });
  }, [opacity, wireframe]);

  const clonedScene = useMemo(() => {
    if (!gltf || !gltf.scene) return null;
    const scene = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = 3.6 / (maxDim || 1);
    scene.position.sub(center.multiplyScalar(targetScale));
    scene.scale.set(targetScale, targetScale, targetScale);

    scene.traverse((child: any) => {
      if (child.isMesh) {
        child.material = customMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return scene;
  }, [gltf, customMaterial]);

  useEffect(() => {
    if (clonedScene) {
      clonedScene.traverse((child: any) => {
        if (child.isMesh) {
          child.material = customMaterial;
        }
      });
    }
  }, [clonedScene, customMaterial]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (groupRef.current) {
      if (autoRotate) {
        groupRef.current.rotation.y = elapsed * 0.15 * rotationSpeed;
      }
      groupRef.current.position.y = Math.sin(elapsed * 0.8) * 0.05;
    }
  });

  if (!clonedScene) return null;

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
};

export const BrainModel: React.FC<BrainModelProps> = ({
  modelPath = '',
  preset = 'glass-silver',
  activeSubRegion = 'all',
  autoRotate = true,
  rotationSpeed = 0.5,
  wireframe = false,
  opacity = 0.96,
}) => {
  if (modelPath) {
    return (
      <GLTFModelRenderer
        modelPath={modelPath}
        preset={preset}
        autoRotate={autoRotate}
        rotationSpeed={rotationSpeed}
        wireframe={wireframe}
        opacity={opacity}
      />
    );
  }

  return <ProceduralBrainFallback preset={preset} autoRotate={autoRotate} />;
};
