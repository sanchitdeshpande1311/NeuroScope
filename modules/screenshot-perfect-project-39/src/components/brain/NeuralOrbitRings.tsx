import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface NeuralOrbitRingsProps {
  radius?: number;
  speed?: number;
  accentColor?: string;
}

export const NeuralOrbitRings: React.FC<NeuralOrbitRingsProps> = ({
  radius = 2.45,
  speed = 0.45,
  accentColor = '#e05663', // Luminous Crimson Coral
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const bead1Ref = useRef<THREE.Mesh>(null);
  const bead2Ref = useRef<THREE.Mesh>(null);
  const bead3Ref = useRef<THREE.Mesh>(null);
  const bead4Ref = useRef<THREE.Mesh>(null);

  // Helper to generate 3D curved elliptical trajectories with realistic inclination
  const createEllipse = (xRadius: number, yRadius: number, segments = 128) => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * xRadius, Math.sin(theta) * yRadius, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  };

  const ring1Geom = useMemo(() => createEllipse(radius * 1.08, radius * 0.94), [radius]);
  const ring2Geom = useMemo(() => createEllipse(radius * 1.18, radius * 0.86), [radius]);
  const ring3Geom = useMemo(() => createEllipse(radius * 0.96, radius * 1.12), [radius]);

  // Pre-instantiate line materials with glowing transparency
  const matRing1 = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color(accentColor),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
  }), [accentColor]);

  const matRing2 = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color('#be3440'), // Editorial Crimson
    transparent: true,
    opacity: 0.38,
    blending: THREE.AdditiveBlending,
  }), []);

  const matRing3 = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color('#c8b7aa'), // Warm Sepia Cream
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  }), []);

  // Pre-create Line objects
  const line1 = useMemo(() => new THREE.Line(ring1Geom, matRing1), [ring1Geom, matRing1]);
  const line2 = useMemo(() => new THREE.Line(ring2Geom, matRing2), [ring2Geom, matRing2]);
  const line3 = useMemo(() => new THREE.Line(ring3Geom, matRing3), [ring3Geom, matRing3]);

  // Animated satellite nodes along the orbital curves
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.12;
    }

    // Bead 1 (Pure White / Vanilla Cream)
    if (bead1Ref.current) {
      const a = t * 1.25;
      bead1Ref.current.position.set(
        Math.cos(a) * (radius * 1.08),
        Math.sin(a) * (radius * 0.94),
        0
      );
    }

    // Bead 2 (Cyan / Sky-Blue Spark)
    if (bead2Ref.current) {
      const a = -t * 0.95 + 1.8;
      bead2Ref.current.position.set(
        Math.cos(a) * (radius * 1.18),
        Math.sin(a) * (radius * 0.86),
        0
      );
    }

    // Bead 3 (Golden Amber Bead)
    if (bead3Ref.current) {
      const a = t * 0.78 + 3.4;
      bead3Ref.current.position.set(
        Math.cos(a) * (radius * 0.96),
        Math.sin(a) * (radius * 1.12),
        0
      );
    }

    // Bead 4 (Opposite side spark on Ring 1)
    if (bead4Ref.current) {
      const a = t * 1.25 + Math.PI;
      bead4Ref.current.position.set(
        Math.cos(a) * (radius * 1.08),
        Math.sin(a) * (radius * 0.94),
        0
      );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Orbit 1: Diagonal Silver / Cream (Dominant ring from reference image) */}
      <group rotation={[Math.PI / 3.2, Math.PI / 5.5, 0]}>
        <primitive object={line1} />
        {/* Orbiting Satellite 1 */}
        <mesh ref={bead1Ref}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
        {/* Glow halo */}
        <mesh ref={bead4Ref}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshBasicMaterial color="#e05663" />
        </mesh>
      </group>

      {/* Orbit 2: Inclined Editorial Crimson Coral */}
      <group rotation={[-Math.PI / 2.8, Math.PI / 4, Math.PI / 6]}>
        <primitive object={line2} />
        {/* Orbiting Satellite 2 */}
        <mesh ref={bead2Ref}>
          <sphereGeometry args={[0.042, 16, 16]} />
          <meshBasicMaterial color="#be3440" />
        </mesh>
      </group>

      {/* Orbit 3: Transverse Warm Sepia / Alabaster */}
      <group rotation={[Math.PI / 2.6, -Math.PI / 4.5, Math.PI / 7]}>
        <primitive object={line3} />
        {/* Orbiting Satellite 3 */}
        <mesh ref={bead3Ref}>
          <sphereGeometry args={[0.038, 16, 16]} />
          <meshBasicMaterial color="#c8b7aa" />
        </mesh>
      </group>
    </group>
  );
};
