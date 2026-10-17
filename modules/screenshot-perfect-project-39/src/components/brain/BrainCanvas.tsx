import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BrainModel } from './BrainModel';
import { NeuralOrbitRings } from './NeuralOrbitRings';
import { NeuralParticles } from './NeuralParticles';
import { TumorMarker } from './TumorMarker';
import { BrainMaterialPreset, TumorSubRegionId } from '../../types';
import { Loader2, AlertCircle } from 'lucide-react';

interface BrainCanvasProps {
  preset?: BrainMaterialPreset;
  activeSubRegion?: TumorSubRegionId | 'all';
  showTumorMarker?: boolean;
  autoRotate?: boolean;
  rotationSpeed?: number;
  interactiveOrbit?: boolean;
  showRings?: boolean;
  showParticles?: boolean;
  cameraDistance?: number;
  onMarkerClick?: () => void;
  showAnnotationCard?: boolean;
  className?: string;
}

const CanvasLoadingState: React.FC = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-20 pointer-events-none">
    <div className="relative">
      <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    </div>
    <p className="mt-3 text-xs font-mono tracking-widest text-primary uppercase">
      Synthesizing 3D Crystal Cortex...
    </p>
  </div>
);

// Fallback if WebGL context creation fails
class WebGLErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-umber-deep/90 rounded-3xl border border-primary/30">
          <AlertCircle className="w-10 h-10 text-primary mb-3" />
          <h4 className="text-sm font-semibold text-[#f8eee5]">3D Acceleration Active in Fallback</h4>
          <p className="text-xs text-[#c8b7aa] max-w-sm mt-1">
            Loading interactive neural matrix...
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export const BrainCanvas: React.FC<BrainCanvasProps> = ({
  preset = 'glass-silver',
  activeSubRegion = 'et',
  showTumorMarker = true,
  autoRotate = true,
  rotationSpeed = 0.6,
  interactiveOrbit = true,
  showRings = true,
  showParticles = true,
  cameraDistance = 4.9,
  onMarkerClick,
  showAnnotationCard = true,
  className = 'w-full h-full',
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <div className={`relative ${className} min-h-[320px] select-none`}>
      <WebGLErrorBoundary>
        <Suspense fallback={<CanvasLoadingState />}>
          <Canvas
            camera={{ position: [0, 0.25, cameraDistance], fov: 42 }}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              alpha: true,
            }}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          >
            {/* Ambient Smoky Dusk Umber base */}
            <ambientLight intensity={1.1} color="#4a2c2c" />

            {/* KEY LIGHT (Pure Silver-White specular gleams) */}
            <directionalLight
              position={[5, 4, 4.5]}
              intensity={3.4}
              color="#FFFFFF"
            />

            {/* EDITORIAL CRIMSON CORAL RIM LIGHT */}
            <directionalLight
              position={[-5, 3.2, -4]}
              intensity={4.8}
              color="#be3440"
            />

            {/* LUMINOUS CORAL ACCENT LIGHT */}
            <directionalLight
              position={[3.5, -2.8, -2.5]}
              intensity={2.8}
              color="#e05663"
            />

            {/* WARM ALABASTER TOP LIGHT */}
            <directionalLight
              position={[-2.5, 4.5, 2]}
              intensity={2.0}
              color="#f8eee5"
            />

            {/* Frontal Soft Light for sulcal fissure depth */}
            <pointLight position={[0, 2.2, 4]} intensity={1.8} color="#f8eee5" distance={10} />

            {/* Floating Organic Breathing & Oscillation */}
            <Float
              speed={1.6}
              rotationIntensity={0.25}
              floatIntensity={0.35}
              floatingRange={[-0.06, 0.06]}
            >
              <group position={[0, 0, 0]}>
                {/* 3D Iridescent Crystal Brain Mesh */}
                <BrainModel
                  preset={preset}
                  activeSubRegion={activeSubRegion}
                  autoRotate={autoRotate}
                  rotationSpeed={rotationSpeed}
                />

                {/* Illustrative Tumor Marker */}
                {showTumorMarker && (
                  <TumorMarker
                    visible={showTumorMarker}
                    activeSubRegion={activeSubRegion}
                    {...(onMarkerClick ? { onMarkerClick } : {})}
                    showAnnotationCard={showAnnotationCard}
                  />
                )}

                {/* Orbital Glowing Rings & Animated Satellites */}
                {showRings && <NeuralOrbitRings radius={2.35} speed={0.45} />}

                {/* Floating Neural Sparkling Dust */}
                {showParticles && <NeuralParticles count={85} radius={3.2} />}
              </group>
            </Float>

            {/* 3D Orbit Interaction with Smooth Damping */}
            {interactiveOrbit && (
              <OrbitControls
                ref={controlsRef}
                enablePan={false}
                enableZoom={true}
                minDistance={3.2}
                maxDistance={7.5}
                dampingFactor={0.06}
                rotateSpeed={0.8}
                maxPolarAngle={Math.PI * 0.82}
                minPolarAngle={Math.PI * 0.18}
              />
            )}
          </Canvas>
        </Suspense>
      </WebGLErrorBoundary>
    </div>
  );
};
export default BrainCanvas;
