import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface NeuralOrbitRingsProps {
  radius?: number;
  speed?: number;
  accentColor?: string;
}

export const NeuralOrbitRings: React.FC<NeuralOrbitRingsProps> = ({
  radius = 2.4,
  speed = 0.4,
  accentColor = "#FFF1D6",
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const nodeBead1 = useRef<THREE.Mesh>(null);
  const nodeBead2 = useRef<THREE.Mesh>(null);
  const nodeBead3 = useRef<THREE.Mesh>(null);

  // Generate 3 elegant orbital ring curves tilted at diverse angles
  const { ring1Points, ring2Points, ring3Points } = useMemo(() => {
    const createEllipse = (xRadius: number, yRadius: number, segments = 120) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * xRadius, Math.sin(theta) * yRadius, 0));
      }
      return points;
    };

    return {
      ring1Points: createEllipse(radius * 1.05, radius * 0.95),
      ring2Points: createEllipse(radius * 1.15, radius * 0.88),
      ring3Points: createEllipse(radius * 0.98, radius * 1.1),
    };
  }, [radius]);

  const ring1Geom = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(ring1Points),
    [ring1Points],
  );
  const ring2Geom = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(ring2Points),
    [ring2Points],
  );
  const ring3Geom = useMemo(
    () => new THREE.BufferGeometry().setFromPoints(ring3Points),
    [ring3Points],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed;
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.15;
    }

    // Move orbiting synapse beads along their elliptical rings
    if (nodeBead1.current) {
      const angle = t * 1.2;
      nodeBead1.current.position.set(
        Math.cos(angle) * (radius * 1.05),
        Math.sin(angle) * (radius * 0.95),
        0,
      );
    }
    if (nodeBead2.current) {
      const angle = -t * 0.9 + 1.5;
      nodeBead2.current.position.set(
        Math.cos(angle) * (radius * 1.15),
        Math.sin(angle) * (radius * 0.88),
        0,
      );
    }
    if (nodeBead3.current) {
      const angle = t * 0.7 + 3.2;
      nodeBead3.current.position.set(
        Math.cos(angle) * (radius * 0.98),
        Math.sin(angle) * (radius * 1.1),
        0,
      );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Orbit 1: Vanilla Cream highlight */}
      <group rotation={[Math.PI / 4, Math.PI / 6, 0]}>
        <primitive
          object={
            new THREE.Line(
              ring1Geom,
              new THREE.LineBasicMaterial({
                color: new THREE.Color(accentColor),
                transparent: true,
                opacity: 0.38,
                blending: THREE.AdditiveBlending,
              }),
            )
          }
        />
        {/* Synapse bead on Ring 1 */}
        <mesh ref={nodeBead1}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#FFF1D6" />
        </mesh>
      </group>

      {/* Orbit 2: Restrained Soft Ice-Blue */}
      <group rotation={[-Math.PI / 3, Math.PI / 4, Math.PI / 5]}>
        <primitive
          object={
            new THREE.Line(
              ring2Geom,
              new THREE.LineBasicMaterial({
                color: new THREE.Color("#7DD3FC"),
                transparent: true,
                opacity: 0.28,
                blending: THREE.AdditiveBlending,
              }),
            )
          }
        />
        {/* Synapse bead on Ring 2 */}
        <mesh ref={nodeBead2}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshBasicMaterial color="#93C5FD" />
        </mesh>
      </group>

      {/* Orbit 3: Warm Amber */}
      <group rotation={[Math.PI / 2.8, -Math.PI / 5, Math.PI / 8]}>
        <primitive
          object={
            new THREE.Line(
              ring3Geom,
              new THREE.LineBasicMaterial({
                color: new THREE.Color("#E8C9A0"),
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending,
              }),
            )
          }
        />
        {/* Synapse bead on Ring 3 */}
        <mesh ref={nodeBead3}>
          <sphereGeometry args={[0.03, 16, 16]} />
          <meshBasicMaterial color="#F59E0B" />
        </mesh>
      </group>
    </group>
  );
};
