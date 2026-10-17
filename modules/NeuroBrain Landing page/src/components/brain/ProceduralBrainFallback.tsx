import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { BrainMaterialPreset } from "../../types";

interface ProceduralBrainProps {
  preset?: BrainMaterialPreset;
  wireframe?: boolean;
  autoRotate?: boolean;
}

export const ProceduralBrainFallback: React.FC<ProceduralBrainProps> = ({
  preset = "glass-silver",
  wireframe = false,
  autoRotate = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  // Generate procedural hemisphere geometry with cerebral sulci folds
  const hemisphereGeometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(1.2, 64, 64);
    const pos = geo.attributes["position"]!;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Elongate into brain shape (longer anteroposteriorly, flatter medially)
      v.x *= 0.85; // lateral width
      v.y *= 0.95; // height
      v.z *= 1.25; // length (AP axis)

      // Sulci / Gyri procedural folds using multi-octave harmonic noise
      const freq1 = 8.0;
      const fold1 = Math.sin(v.x * freq1) * Math.sin(v.y * freq1) * Math.sin(v.z * freq1);
      const freq2 = 16.0;
      const fold2 = Math.cos(v.x * freq2 + 1.2) * Math.sin(v.z * freq2) * 0.5;

      const displacement = fold1 * 0.08 + fold2 * 0.04;
      v.addScaledVector(v.clone().normalize(), displacement);

      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => {
    if (preset === "wireframe-silver" || wireframe) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFFFFF"),
        emissive: new THREE.Color("#D8E8FC"),
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.1,
        wireframe: true,
        transparent: true,
        opacity: 0.92,
      });
    } else if (preset === "glass-silver") {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#f8fafc"),
        roughness: 0.12,
        metalness: 0.2,
        transmission: 0.75,
        ior: 1.5,
        thickness: 1.8,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        attenuationColor: new THREE.Color("#93c5fd"),
        attenuationDistance: 2.2,
        transparent: true,
        opacity: 0.96,
      });
    } else if (preset === "bioluminescent-cyan") {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#0284c7"),
        emissive: new THREE.Color("#0369a1"),
        emissiveIntensity: 0.3,
        roughness: 0.18,
        metalness: 0.1,
        transmission: 0.6,
        transparent: true,
        opacity: 0.9,
      });
    } else if (preset === "synapse-xray") {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#38bdf8"),
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      });
    } else {
      // mri-phantom
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#94a3b8"),
        roughness: 0.4,
        metalness: 0.1,
      });
    }
  }, [preset, wireframe]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 0.8) * 0.05;
      if (autoRotate) groupRef.current.rotation.y = clock.getElapsedTime() * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Left Hemisphere */}
      <mesh
        geometry={hemisphereGeometry}
        material={material}
        position={[-0.65, 0, 0]}
        scale={[1, 1, 1]}
      />
      {/* Right Hemisphere */}
      <mesh
        geometry={hemisphereGeometry}
        material={material}
        position={[0.65, 0, 0]}
        scale={[-1, 1, 1]}
      />
      {/* Cerebellum base */}
      <mesh position={[0, -0.7, -0.6]} scale={[1.1, 0.6, 0.8]}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <primitive object={material} attach="material" />
      </mesh>
      {/* Brainstem */}
      <mesh position={[0, -1.1, -0.2]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.16, 0.9, 24]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
};
