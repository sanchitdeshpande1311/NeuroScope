import React, { Suspense, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Float } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BrainModel } from "./BrainModel";
import { NeuralOrbitRings } from "./NeuralOrbitRings";
import { NeuralParticles } from "./NeuralParticles";
import { TumorMarker } from "./TumorMarker";
import { BrainMaterialPreset, TumorSubRegionId } from "../../types";
import { Loader2 } from "lucide-react";

interface BrainCanvasProps {
  preset?: BrainMaterialPreset;
  activeSubRegion?: TumorSubRegionId | "all";
  showTumorMarker?: boolean;
  autoRotate?: boolean;
  rotationSpeed?: number;
  interactiveOrbit?: boolean;
  cursorInteractive?: boolean;
  cursorSensitivity?: number;
  showRings?: boolean;
  showParticles?: boolean;
  cameraDistance?: number;
  onMarkerClick?: () => void;
  showAnnotationCard?: boolean;
  className?: string;
  wireframe?: boolean;
}

interface CursorResponsiveRigProps {
  children: React.ReactNode;
  enabled?: boolean;
  hoveredRef: React.MutableRefObject<boolean>;
  sensitivity?: number;
}

/** Smooth cursor-responsive tilt with critically-damped return to center */
const CursorResponsiveRig: React.FC<CursorResponsiveRigProps> = ({
  children,
  enabled = true,
  hoveredRef,
  sensitivity = 1.0,
}) => {
  const rigRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!rigRef.current) return;

    let targetX = 0;
    let targetY = 0;
    let targetZ = 0;

    if (enabled && hoveredRef.current) {
      const px = Math.max(-1, Math.min(1, state.pointer.x));
      const py = Math.max(-1, Math.min(1, state.pointer.y));

      targetY = px * 0.38 * sensitivity;
      targetX = -py * 0.26 * sensitivity;
      targetZ = -px * 0.1 * sensitivity;
    }

    rigRef.current.rotation.x = THREE.MathUtils.damp(
      rigRef.current.rotation.x,
      targetX,
      3.8,
      delta,
    );
    rigRef.current.rotation.y = THREE.MathUtils.damp(
      rigRef.current.rotation.y,
      targetY,
      3.8,
      delta,
    );
    rigRef.current.rotation.z = THREE.MathUtils.damp(
      rigRef.current.rotation.z,
      targetZ,
      3.8,
      delta,
    );
  });

  return <group ref={rigRef}>{children}</group>;
};

const CanvasLoadingState: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#240A12]/85 backdrop-blur-md z-20">
    <div className="relative">
      <div className="w-14 h-14 rounded-full border-2 border-[#E8C9A0]/20 border-t-[#FFF1D6] animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#FFF1D6] animate-spin" />
      </div>
    </div>
    <p className="mt-4 text-[11px] font-mono tracking-widest text-[#FFF1D6] uppercase">
      Synthesizing 3D Neural Cortex...
    </p>
  </div>
);

/**
 * Deliberate, elegant fallback plate if WebGL context creation is genuinely unsupported.
 * Never displays harsh error panels or broken UI.
 */
export const ElegantWireframeFallback: React.FC<{ className?: string }> = ({
  className = "w-full h-full",
}) => {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-3xl border border-rose/20 bg-cola-deep/60 ${className}`}
    >
      <div className="absolute inset-0 bg-radial from-rose/10 via-transparent to-transparent opacity-60" />

      {/* SVG stylized technical wireframe cortex projection */}
      <svg
        viewBox="0 0 360 360"
        className="h-full w-full max-w-[340px] animate-pulse duration-[4000ms]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="fallback-wire" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#D8E8FC" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Orbital Rings */}
        <ellipse
          cx="180"
          cy="180"
          rx="150"
          ry="60"
          stroke="#f4e2c4"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.35"
          transform="rotate(-22 180 180)"
        />
        <ellipse
          cx="180"
          cy="180"
          rx="140"
          ry="75"
          stroke="#f43f5e"
          strokeWidth="1"
          strokeDasharray="4 2"
          opacity="0.3"
          transform="rotate(35 180 180)"
        />

        {/* Brain Silhouette Wireframe Facets */}
        <g stroke="url(#fallback-wire)" strokeWidth="1.1" strokeLinejoin="round" opacity="0.85">
          {/* Left / Frontal Lobes */}
          <polygon points="180,70 145,95 190,115" />
          <polygon points="145,95 110,85 130,125" />
          <polygon points="110,85 75,115 105,145" />
          <polygon points="75,115 65,155 100,175" />
          <polygon points="65,155 70,205 115,200" />
          <polygon points="70,205 105,245 140,230" />
          <polygon points="105,245 155,275 165,240" />

          {/* Right / Parietal / Occipital Lobes */}
          <polygon points="180,70 215,95 190,115" />
          <polygon points="215,95 250,85 230,125" />
          <polygon points="250,85 285,115 255,145" />
          <polygon points="285,115 295,155 260,175" />
          <polygon points="295,155 290,205 245,200" />
          <polygon points="290,205 255,245 220,230" />
          <polygon points="255,245 205,275 195,240" />

          {/* Central Sulcus / Interhemispheric Fissure Wireframe Lines */}
          <polygon points="190,115 145,95 130,125" />
          <polygon points="190,115 215,95 230,125" />
          <polygon points="190,115 160,165 180,185" />
          <polygon points="190,115 200,165 180,185" />
          <polygon points="130,125 105,145 140,165" />
          <polygon points="230,125 255,145 220,165" />
          <polygon points="105,145 100,175 140,185" />
          <polygon points="255,145 260,175 220,185" />
          <polygon points="100,175 115,200 150,215" />
          <polygon points="260,175 245,200 210,215" />
          <polygon points="180,185 150,215 180,235" />
          <polygon points="180,185 210,215 180,235" />
          <polygon points="140,230 165,240 180,235" />
          <polygon points="220,230 195,240 180,235" />
          <polygon points="165,240 180,235 180,290" />
          <polygon points="195,240 180,235 180,290" />

          {/* Brainstem / Cerebellum Base */}
          <polygon points="155,275 180,290 170,320" />
          <polygon points="205,275 180,290 190,320" />
          <polygon points="170,320 180,290 190,320" />
        </g>

        {/* Nodes */}
        <circle cx="180" cy="70" r="3" fill="#FFFFFF" />
        <circle cx="145" cy="95" r="2.5" fill="#FFF1D6" />
        <circle cx="215" cy="95" r="2.5" fill="#FFF1D6" />
        <circle cx="180" cy="185" r="3.5" fill="#fbbf24" />
        <circle cx="150" cy="215" r="2.5" fill="#f43f5e" />
        <circle cx="210" cy="215" r="2.5" fill="#38bdf8" />
        <circle cx="180" cy="290" r="3" fill="#FFFFFF" />
      </svg>
    </div>
  );
};

// Resilient WebGL Error Boundary
class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("WebGL notice (rendering graceful wireframe projection):", error);
  }

  override render() {
    if (this.state.hasError) {
      return <ElegantWireframeFallback />;
    }
    return this.props.children;
  }
}

/** Check if WebGL is supported in client environment */
function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

export const BrainCanvas: React.FC<BrainCanvasProps> = ({
  preset = "wireframe-silver",
  activeSubRegion = "all",
  showTumorMarker = false,
  autoRotate = true,
  rotationSpeed = 0.5,
  interactiveOrbit = false,
  cursorInteractive = true,
  cursorSensitivity = 1.0,
  showRings = true,
  showParticles = true,
  cameraDistance = 4.8,
  onMarkerClick,
  showAnnotationCard = false,
  className = "w-full h-full",
  wireframe = true,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const hoveredRef = useRef<boolean>(false);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    setWebGLAvailable(detectWebGL());
  }, []);

  const isWireframe = preset === "wireframe-silver" || wireframe;

  // If WebGL is confirmed unavailable, render the elegant technical wireframe fallback
  if (webGLAvailable === false) {
    return <ElegantWireframeFallback className={className} />;
  }

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
      }}
    >
      <WebGLErrorBoundary>
        <Suspense fallback={<CanvasLoadingState />}>
          <Canvas
            camera={{ position: [0, 0.35, cameraDistance], fov: 42 }}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              powerPreference: "default",
              alpha: true,
              failIfMajorPerformanceCaveat: false,
              preserveDrawingBuffer: true,
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            {/* Ambient Base Light */}
            <ambientLight
              intensity={isWireframe ? 0.55 : 0.65}
              color={isWireframe ? "#380D1D" : "#4D1623"}
            />

            {/* KEY LIGHT (Silver-White for wireframe) */}
            <directionalLight
              position={[5, 4, 4]}
              intensity={isWireframe ? 3.0 : 2.5}
              color={isWireframe ? "#FFFFFF" : "#FFF1D6"}
            />

            {/* RIM LIGHT (Cool silver-blue specular) */}
            <directionalLight
              position={[-5, 2.5, -4]}
              intensity={isWireframe ? 3.8 : 4.2}
              color={isWireframe ? "#D8EAFE" : "#F59E0B"}
            />

            {/* CYAN ACCENT LIGHT */}
            <directionalLight
              position={[3, -3.5, -2]}
              intensity={isWireframe ? 2.2 : 2.0}
              color="#38BDF8"
            />

            {/* Frontal Soft Light for sulcal depth */}
            <pointLight
              position={[0, 2.5, 3]}
              intensity={isWireframe ? 1.8 : 1.4}
              color={isWireframe ? "#FFFFFF" : "#FAF0DC"}
              distance={10}
            />

            {/* Subtle Point Light */}
            <pointLight
              position={[-3, 1, -2]}
              intensity={isWireframe ? 2.8 : 2.6}
              color={isWireframe ? "#C4DCFC" : "#E8C9A0"}
              distance={8}
            />

            {/* Cursor-responsive smooth tilt rig */}
            <CursorResponsiveRig
              enabled={cursorInteractive}
              hoveredRef={hoveredRef}
              sensitivity={cursorSensitivity}
            >
              <Float
                speed={1.5}
                rotationIntensity={0.2}
                floatIntensity={0.3}
                floatingRange={[-0.05, 0.05]}
              >
                <group position={[0, 0, 0]}>
                  {/* 3D Brain Mesh with seamless procedural fallback */}
                  <BrainModel
                    preset={preset}
                    wireframe={wireframe}
                    activeSubRegion={activeSubRegion}
                    autoRotate={autoRotate}
                    rotationSpeed={rotationSpeed}
                  />

                  {/* Illustrative Tumor Marker */}
                  <TumorMarker
                    visible={showTumorMarker}
                    activeSubRegion={activeSubRegion}
                    {...(onMarkerClick ? { onMarkerClick } : {})}
                    showAnnotationCard={showAnnotationCard}
                  />

                  {/* Orbital Neural Rings */}
                  {showRings && <NeuralOrbitRings radius={2.2} speed={0.4} />}

                  {/* Floating Neural Particles */}
                  {showParticles && <NeuralParticles count={75} radius={3.0} />}
                </group>
              </Float>
            </CursorResponsiveRig>

            {/* Interactive Orbit Controls */}
            {interactiveOrbit && (
              <OrbitControls
                ref={controlsRef}
                enablePan={false}
                enableZoom={true}
                minDistance={3.0}
                maxDistance={7.5}
                dampingFactor={0.06}
                rotateSpeed={0.8}
                maxPolarAngle={Math.PI * 0.8}
                minPolarAngle={Math.PI * 0.2}
              />
            )}
          </Canvas>
        </Suspense>
      </WebGLErrorBoundary>
    </div>
  );
};
