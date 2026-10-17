import React, { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { TumorSubRegionId } from "../../types";

interface TumorMarkerProps {
  visible?: boolean;
  activeSubRegion?: TumorSubRegionId | "all";
  onMarkerClick?: () => void;
  showAnnotationCard?: boolean;
}

export const TumorMarker: React.FC<TumorMarkerProps> = ({
  visible = true,
  activeSubRegion = "et",
  onMarkerClick,
  showAnnotationCard = true,
}) => {
  const pulseRingRef = useRef<THREE.Mesh>(null);
  const coreSphereRef = useRef<THREE.Mesh>(null);

  // Colors aligned with the Cherry Cola & Vanilla Cream luxury palette
  const colorMap = {
    wt: "#2DD4BF", // Whole tumor (Soft luminous teal)
    tc: "#F59E0B", // Tumor core (Warm amber)
    et: "#FB7185", // Enhancing tumor (Vibrant Rose/Coral)
    all: "#FDA4AF",
  };

  const markerColor = colorMap[activeSubRegion] || "#F59E0B";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (pulseRingRef.current) {
      const scale = 1 + ((t * 2) % 1.5);
      pulseRingRef.current.scale.set(scale, scale, scale);
      const mat = pulseRingRef.current.material as THREE.MeshBasicMaterial;
      if (mat) {
        mat.opacity = Math.max(0, 0.75 - (scale - 1) / 1.5);
      }
    }
    if (coreSphereRef.current) {
      const pulse = 1 + Math.sin(t * 4) * 0.12;
      coreSphereRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  if (!visible) return null;

  // Approximate right temporal/parietal cortex coordinate
  const markerPosition: [number, number, number] = [0.92, 0.38, 0.65];

  return (
    <group position={markerPosition}>
      {/* Inner glowing core */}
      <mesh ref={coreSphereRef} onClick={() => onMarkerClick?.()}>
        <sphereGeometry args={[0.075, 24, 24]} />
        <meshBasicMaterial color={markerColor} />
      </mesh>

      {/* Volumetric glow halo */}
      <mesh>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshBasicMaterial
          color={markerColor}
          transparent
          opacity={0.35}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Expanding radar pulse ring */}
      <mesh ref={pulseRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.08, 0.14, 32]} />
        <meshBasicMaterial
          color={markerColor}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Thin leader line to surface */}
      <line>
        <bufferGeometry attach="geometry">
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([0, 0, 0, 0.15, 0.25, 0.1]), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={markerColor} transparent opacity={0.65} />
      </line>

      {/* 3D Annotation Card */}
      {showAnnotationCard && (
        <Html
          position={[0.2, 0.35, 0.1]}
          distanceFactor={6}
          zIndexRange={[100, 0]}
          transform
          sprite
        >
          <div
            onClick={onMarkerClick}
            className="group cursor-pointer select-none pointer-events-auto transition-transform duration-200 hover:scale-105"
          >
            <div className="bg-[#240A12]/95 backdrop-blur-xl border border-[#E8C9A0]/30 rounded-2xl p-3 shadow-2xl shadow-[#240A12]/80 min-w-[210px] text-xs">
              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#FFF1D6]/10">
                <span className="flex items-center gap-1.5 font-semibold text-[#FFF1D6] font-heading">
                  <span className="inline-block w-2 h-2 rounded-full bg-[#E8C9A0] animate-ping" />
                  MOCK TARGET
                </span>
                <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#6B2639]/50 text-[#E8C9A0] font-mono border border-[#6B2639]">
                  DEMO ONLY
                </span>
              </div>
              <div className="mt-2 space-y-1.5 text-[#E8C9A0]">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#E8C9A0]/70">Cortical Region:</span>
                  <span className="font-medium text-[#FFF1D6]">R. Fronto-Temporal</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#E8C9A0]/70">Sub-Region:</span>
                  <span className="font-mono text-[#FFF1D6] font-medium uppercase">
                    {activeSubRegion === "wt"
                      ? "Whole Tumor (WT)"
                      : activeSubRegion === "tc"
                        ? "Tumor Core (TC)"
                        : "Enhancing (ET)"}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#E8C9A0]/70">Simulated Vol:</span>
                  <span className="font-mono text-[#FFF1D6] font-bold">
                    {activeSubRegion === "wt"
                      ? "44.8 cm³"
                      : activeSubRegion === "tc"
                        ? "22.3 cm³"
                        : "9.6 cm³"}
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-[#FFF1D6]/10 text-[9px] text-[#E8C9A0]/60 italic font-sans">
                * Illustrative demonstration — not a diagnostic prediction.
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
};
