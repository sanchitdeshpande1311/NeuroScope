import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BrainMaterialPreset } from '../../types';

interface ProceduralBrainProps {
  preset?: BrainMaterialPreset;
  autoRotate?: boolean;
}

export const ProceduralBrainFallback: React.FC<ProceduralBrainProps> = ({
  preset = 'glass-silver',
  autoRotate = true,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const innerCoreRef = useRef<THREE.Group>(null);
  const cerebellumRef = useRef<THREE.Mesh>(null);
  const stemRef = useRef<THREE.Mesh>(null);

  // 1. High-fidelity Cerebral Hemisphere Geometry with realistic sulci & gyri folds
  const createHemisphereGeo = (isRight: boolean) => {
    const geo = new THREE.SphereGeometry(1.28, 96, 96);
    const pos = geo.attributes["position"]!;
    const v = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      normal.copy(v).normalize();

      // Proportional human cerebral shaping:
      // Anteroposterior elongation, lateral curvature, superior dome, inferior flatten
      v.z *= 1.34; // Longer front-to-back
      v.x *= 0.88; // Medial compression
      v.y *= 1.02; // Vertical height

      // Interhemispheric fissure: flatten medial surface
      const medialSign = isRight ? 1 : -1;
      if (v.x * medialSign < 0.1) {
        v.x = Math.max(v.x, 0.05 * medialSign);
      }

      // Temporal lobe depression and inferior swoop
      const isTemporal = v.y < 0.1 && v.z > -0.3 && v.z < 0.5;
      if (isTemporal) {
        v.y += Math.sin(v.z * 4.0) * 0.12;
        v.x *= 1.08;
      }

      // Occipital lobe curve tapering down
      if (v.z < -0.4 && v.y < 0.2) {
        v.y *= 0.92;
      }

      // Frontal lobe curving down smoothly
      if (v.z > 0.6) {
        v.y *= 0.94;
      }

      // Deep, liquid-crystal cerebral sulci / gyri folds:
      // Multi-harmonic smooth organic displacement
      const freq1 = 7.5;
      const fold1 = Math.sin(v.x * freq1) * Math.sin(v.y * freq1 * 1.1) * Math.sin(v.z * freq1 * 0.8);
      
      const freq2 = 14.0;
      const fold2 = Math.cos(v.x * freq2 + 1.4) * Math.sin(v.z * freq2 + 0.6) * 0.5;

      const freq3 = 24.0;
      const fold3 = Math.sin(v.y * freq3 + v.x * 12.0) * 0.22;

      // Displacement along surface normal
      const displacement = fold1 * 0.11 + fold2 * 0.045 + fold3 * 0.02;
      v.addScaledVector(normal, displacement);

      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  };

  const leftHemiGeo = useMemo(() => createHemisphereGeo(false), []);
  const rightHemiGeo = useMemo(() => createHemisphereGeo(true), []);

  // 2. Cerebellum Geometry with fine horizontal glass striations / lamellae
  const cerebellumGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.72, 64, 64);
    const pos = geo.attributes["position"]!;
    const v = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      normal.copy(v).normalize();

      // Shape into flattened horizontal oval
      v.x *= 1.25;
      v.y *= 0.68;
      v.z *= 0.85;

      // Fine parallel horizontal folia striations matching the reference image!
      const striations = Math.sin(v.y * 62.0) * 0.032 + Math.cos(v.y * 30.0) * 0.015;
      v.addScaledVector(normal, striations);

      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 3. Brainstem Geometry (Pons & Medulla tapering gracefully downward)
  const brainstemGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.24, 0.16, 1.1, 32, 24);
    const pos = geo.attributes["position"]!;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // Gentle anterior curving stalk
      const curve = (v.y + 0.55) * (v.y + 0.55) * 0.08;
      v.z += curve;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 4. Internal Glowing Neural Nodes (Sparkling points inside the glass)
  const [internalPositions, internalColors] = useMemo(() => {
    const count = 55;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const cCrimson = new THREE.Color('#be3440');
    const cCoral = new THREE.Color('#e05663');
    const cWhite = new THREE.Color('#f8eee5');

    for (let i = 0; i < count; i++) {
      // Confine inside brain volume
      pos[i * 3] = (Math.random() - 0.5) * 1.5;
      pos[i * 3 + 1] = (Math.random() - 0.45) * 1.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.8;

      const pick = Math.random();
      const color = pick > 0.6 ? cCrimson : pick > 0.3 ? cCoral : cWhite;
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
    }
    return [pos, col];
  }, []);

  // 5. Iridescent Crystal Glass Material
  const glassMaterial = useMemo(() => {
    if (preset === 'glass-silver') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#FFFFFF'),
        emissive: new THREE.Color('#2c1719'),
        emissiveIntensity: 0.12,
        roughness: 0.08,
        metalness: 0.12,
        transmission: 0.90, // Crystal liquid transmission
        ior: 1.54, // Optical flint glass IOR
        thickness: 2.2, // Deep subsurface dispersion
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        specularIntensity: 1.6,
        specularColor: new THREE.Color('#FFFFFF'),
        attenuationColor: new THREE.Color('#f8eee5'), // Warm alabaster inner caustics
        attenuationDistance: 2.8,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
      });
    } else if (preset === 'bioluminescent-cyan') {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#8a202a'),
        emissive: new THREE.Color('#be3440'),
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.1,
        transmission: 0.82,
        ior: 1.48,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      });
    } else {
      // Synapse X-Ray
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#e05663'),
        emissive: new THREE.Color('#2c1719'),
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.85,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });
    }
  }, [preset]);

  // Subtle internal chromatic halo material
  const innerHaloMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#e05663'),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
  }, []);

  // Cerebellum slightly distinct material for sharp striated specular glints
  const cerebellumMaterial = useMemo(() => {
    const mat = glassMaterial.clone();
    mat.roughness = 0.05;
    mat.clearcoat = 1.0;
    mat.clearcoatRoughness = 0.02;
    mat.attenuationColor = new THREE.Color('#E0F2FE'); // Cool sky-blue subsurface
    return mat;
  }, [glassMaterial]);

  // Animation Loop: Smooth organic breathing, floating, and auto-rotation
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (groupRef.current) {
      if (autoRotate) {
        groupRef.current.rotation.y = elapsed * 0.16;
      }
      // Floating sinusoidal levitation & subtle pitch/roll sway
      groupRef.current.position.y = Math.sin(elapsed * 0.9) * 0.08;
      groupRef.current.rotation.z = Math.sin(elapsed * 0.6) * 0.025;
      groupRef.current.rotation.x = Math.cos(elapsed * 0.7) * 0.02;
    }

    if (innerCoreRef.current) {
      innerCoreRef.current.rotation.y = -elapsed * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Left Cerebral Hemisphere */}
      <mesh
        geometry={leftHemiGeo}
        material={glassMaterial}
        position={[-0.62, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* Right Cerebral Hemisphere */}
      <mesh
        geometry={rightHemiGeo}
        material={glassMaterial}
        position={[0.62, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* Cerebellum with horizontal folia striations */}
      <mesh
        ref={cerebellumRef}
        geometry={cerebellumGeo}
        material={cerebellumMaterial}
        position={[0, -0.72, -0.68]}
        rotation={[0.1, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* Brainstem (Pons & Medulla) */}
      <mesh
        ref={stemRef}
        geometry={brainstemGeo}
        material={glassMaterial}
        position={[0, -1.18, -0.22]}
        rotation={[0.22, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* Inner Luminescent Core & Neural Sparks */}
      <group ref={innerCoreRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[internalPositions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[internalColors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.065}
            vertexColors
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>

        {/* Soft volumetric inner halo */}
        <mesh scale={[0.85, 0.75, 1.1]} material={innerHaloMaterial}>
          <sphereGeometry args={[0.9, 32, 32]} />
        </mesh>
      </group>
    </group>
  );
};
