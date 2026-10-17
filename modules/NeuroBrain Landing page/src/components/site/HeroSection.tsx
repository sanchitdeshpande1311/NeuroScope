import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowDown, Mouse } from "lucide-react";
import { CurvedDivider } from "./CurvedDivider";
import { Particles } from "./Particles";
import { usePrefersReducedMotion } from "./useReveal";

// The provided 3D brain is browser-only (WebGL), so load it after hydration.
const BrainCanvas = lazy(() =>
  import("@/components/brain/BrainCanvas").then((m) => ({ default: m.BrainCanvas })),
);

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const reduced = usePrefersReducedMotion();
  useEffect(() => setMounted(true), []);

  return (
    <section
      id="home"
      className="relative min-h-[100svh] overflow-hidden bg-cola-gradient pb-32 pt-16"
    >
      <Particles />
      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-6 pt-10 md:min-h-[calc(100svh-4rem)] md:grid-cols-[1fr_1.1fr] md:pt-0">
        <div className="relative z-20 order-2 md:order-1">
          <h1 className="font-hero-serif text-4xl font-light tracking-tight text-[#F4E2C4] sm:text-5xl md:text-6xl lg:text-[4.5rem] xl:text-[5.2rem] leading-[1.08] md:whitespace-nowrap">
            Neuro<span className="italic text-rose-glow">Scope</span>{" "}
            <span className="font-light text-[#F4E2C4]">3D</span>
          </h1>
          <p className="mt-4 text-lg font-light tracking-[0.25em] text-ivory sm:text-xl md:text-2xl">
            Unfolding the Unseen
          </p>
          <div className="relative mt-8 h-px w-40 bg-gradient-to-r from-ivory/70 to-transparent">
            <span className="absolute -top-[3px] left-10 h-[7px] w-[7px] rounded-full bg-rose shadow-glow animate-travel" />
          </div>
          <div className="mt-8">
            <button
              type="button"
              onClick={() => {
                // NeuroScope 3D integration: open the segmentation workspace (same origin by default;
                // set VITE_WORKSPACE_URL at build time when the workspace is served from another origin).
                window.location.assign(import.meta.env.VITE_WORKSPACE_URL || "/upload");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-rose/40 bg-cola-deep/80 px-6 py-2.5 text-sm font-medium tracking-wide text-[#F4E2C4] shadow-sm backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-rose hover:bg-rose/15 hover:text-[#FFF1D6] hover:shadow-[0_0_24px_rgba(232,93,117,0.3)] focus-visible:outline-2 focus-visible:outline-rose focus-visible:outline-offset-2 active:translate-y-0 motion-reduce:transform-none"
            >
              Start Segmentation
            </button>
          </div>
        </div>
        <div className="relative order-1 h-[52vh] min-h-[340px] md:order-2 md:h-[78vh]">
          <div aria-hidden className="absolute inset-[10%] rounded-full bg-rose/15 blur-3xl" />
          {mounted && (
            <Suspense fallback={null}>
              <BrainCanvas
                className="h-full w-full"
                preset="wireframe-silver"
                wireframe={true}
                autoRotate={!reduced}
                rotationSpeed={0.45}
                showTumorMarker={false}
                showAnnotationCard={false}
                cameraDistance={5.0}
                interactiveOrbit={false}
                cursorInteractive={!reduced}
                cursorSensitivity={1.1}
              />
            </Suspense>
          )}
        </div>
      </div>
      <a
        href="#how-it-works"
        className="absolute bottom-36 left-6 z-20 flex flex-col items-center gap-1 text-xs text-mist md:left-[18%]"
      >
        <Mouse className="h-6 w-6" strokeWidth={1.3} />
        Scroll to explore
        <ArrowDown className="h-4 w-4 animate-bob" />
      </a>
      <CurvedDivider to="cream" variant={0} />
    </section>
  );
}
