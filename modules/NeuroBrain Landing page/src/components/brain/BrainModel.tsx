import React, { useMemo, useRef, useEffect, Suspense } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { BrainMaterialPreset, TumorSubRegionId } from "../../types";
import { ProceduralBrainFallback } from "./ProceduralBrainFallback";

interface BrainModelProps {
  modelPath?: string;
  preset?: BrainMaterialPreset;
  activeSubRegion?: TumorSubRegionId | "all";
  autoRotate?: boolean;
  rotationSpeed?: number;
  wireframe?: boolean;
  opacity?: number;
}

// Inner Model Error Boundary to catch any GLTF fetch/parse issues and seamlessly fall back to 3D procedural brain
class ModelErrorBoundary extends React.Component<
  {
    fallback: React.ReactNode;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("GLTF brain asset note (seamlessly falling back to 3D procedural cortex):", error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/** The actual GLTF Mesh loader */
const GltfBrainMesh: React.FC<BrainModelProps> = ({
  modelPath = "/models/brain-model.glb",
  preset = "wireframe-silver",
  wireframe = false,
  opacity = 0.96,
  autoRotate = true,
  rotationSpeed = 0.5,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useGLTF(modelPath) as unknown as { scene: THREE.Group } | null;

  const isWire = preset === "wireframe-silver" || wireframe;

  // Material setup matching the reference translucent glass or fine silver wireframe
  const customMaterial = useMemo(() => {
    if (isWire) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFFFFF"),
        emissive: new THREE.Color("#D8E8FC"),
        emissiveIntensity: 0.44,
        roughness: 0.15,
        metalness: 0.08,
        wireframe: true,
        transparent: true,
        opacity: 0.92,
      });
    } else if (preset === "glass-silver") {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#FFFFFF"),
        emissive: new THREE.Color("#240A12"),
        emissiveIntensity: 0.12,
        roughness: 0.11,
        metalness: 0.16,
        transmission: 0.74,
        ior: 1.52,
        thickness: 2.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        specularIntensity: 1.25,
        specularColor: new THREE.Color("#FFF1D6"),
        attenuationColor: new THREE.Color("#E8C9A0"),
        attenuationDistance: 3.2,
        transparent: true,
        opacity: opacity,
        wireframe: wireframe,
        side: THREE.DoubleSide,
      });
    } else if (preset === "bioluminescent-cyan") {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#6B2639"),
        emissive: new THREE.Color("#9F2E4A"),
        emissiveIntensity: 0.45,
        roughness: 0.18,
        metalness: 0.1,
        transmission: 0.6,
        ior: 1.45,
        clearcoat: 0.8,
        transparent: true,
        opacity: opacity,
        wireframe: wireframe,
      });
    } else if (preset === "synapse-xray") {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#FFF1D6"),
        emissive: new THREE.Color("#4D1623"),
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.85,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
      });
    } else {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color("#EAD2B0"),
        roughness: 0.35,
        metalness: 0.15,
        wireframe: wireframe,
        transparent: true,
        opacity: opacity,
      });
    }
  }, [preset, wireframe, opacity, isWire]);

  // Clone, scale and center scene geometry safely
  const clonedScene = useMemo(() => {
    if (!gltf || !gltf.scene) return null;
    const scene = gltf.scene.clone(true);

    // Compute bounding box and normalize
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = 3.6 / (maxDim || 1);

    scene.position.sub(center.multiplyScalar(targetScale));
    scene.scale.set(targetScale, targetScale, targetScale);

    const depthCoreMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#14050A"),
      roughness: 0.9,
      metalness: 0.05,
      transparent: true,
      opacity: 0.78,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    // Collect meshes first to avoid mutating during traversal
    const targetMeshes: THREE.Mesh[] = [];
    scene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        targetMeshes.push(child as THREE.Mesh);
      }
    });

    // Apply materials and inner depth core
    for (const mesh of targetMeshes) {
      mesh.material = customMaterial;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      if (isWire) {
        // Inner depth core gives authentic 3D sulcal occlusion behind wireframe lines
        const coreMesh = new THREE.Mesh(mesh.geometry.clone(), depthCoreMaterial);
        coreMesh.scale.setScalar(0.993);
        coreMesh.name = "__wireframe_inner_core";
        coreMesh.renderOrder = 0;
        mesh.renderOrder = 1;
        mesh.add(coreMesh);
      }
    }

    return scene;
  }, [gltf, customMaterial, isWire]);

  // Update material on primary meshes when preset changes, preserving inner core
  useEffect(() => {
    if (clonedScene) {
      clonedScene.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh && child.name !== "__wireframe_inner_core") {
          (child as THREE.Mesh).material = customMaterial;
        }
      });
    }
  }, [clonedScene, customMaterial]);

  // Floating and auto-rotation
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (groupRef.current) {
      if (autoRotate) {
        groupRef.current.rotation.y = elapsed * 0.15 * rotationSpeed;
      }
      groupRef.current.position.y = Math.sin(elapsed * 0.8) * 0.05;
    }
  });

  if (!clonedScene) {
    return (
      <ProceduralBrainFallback preset={preset} wireframe={wireframe} autoRotate={autoRotate} />
    );
  }

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
};

export const BrainModel: React.FC<BrainModelProps> = (props) => {
  const fallback = (
    <ProceduralBrainFallback
      preset={props.preset}
      wireframe={props.wireframe || props.preset === "wireframe-silver"}
      autoRotate={props.autoRotate}
    />
  );

  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GltfBrainMesh {...props} />
      </Suspense>
    </ModelErrorBoundary>
  );
};

// Safe browser-only preload
if (typeof window !== "undefined") {
  try {
    useGLTF.preload("/models/brain-model.glb");
  } catch {
    // Ignore preload errors in non-browser environments
  }
}
