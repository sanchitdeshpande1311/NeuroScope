import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowDown, Mouse, Sparkles, Orbit } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { CurvedDivider } from "./CurvedDivider";
import { Particles } from "./Particles";
import { usePrefersReducedMotion } from "./useReveal";

// The 3D crystal brain is WebGL-based; load dynamically after hydration
const BrainCanvas = lazy(() =>
  import("@/components/brain/BrainCanvas").then((m) => ({ default: m.BrainCanvas })),
);

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="home" className="relative min-h-[100svh] overflow-hidden bg-editorial-hero pb-32 pt-20 md:pt-24">
      <Particles />
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-6 pt-10 md:min-h-[calc(100svh-4rem)] md:grid-cols-[1.1fr_1.1fr] md:pt-0">
        <div className="relative z-20 order-2 md:order-1 pt-4 md:pt-0">
          {/* Eyebrow matching reference */}
          <div className="mb-4">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              GEOSPATIAL INTELLIGENCE &bull; 3D CORTEX
            </span>
          </div>

          {/* Heading matching reference */}
          <h1 className="font-serif text-5xl font-bold tracking-tight text-ink sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.05]">
            Pollution is <br />
            <span className="text-primary font-serif">Spatial.</span>
          </h1>

          {/* Thin accent rule under heading */}
          <div className="mt-5 h-[1.5px] w-20 bg-border-rule" />

          {/* Subtitle paragraph */}
          <p className="mt-6 max-w-lg text-base text-body-text leading-relaxed font-sans">
            Explore how neural structures and tumor regions move across 3D coordinates. Understand spatial patterns with interactive MRI volumetric visualization.
          </p>

          {/* Action buttons matching reference */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#how-it-works"
              className="group inline-flex items-center gap-3 rounded-full border border-primary bg-canvas/60 px-6 py-3 text-sm font-semibold text-primary transition-all duration-300 hover:bg-primary hover:text-primary-foreground shadow-sm"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full border border-current text-xs transition-transform duration-300 group-hover:translate-x-0.5">
                →
              </span>
              <span>Explore the Layers</span>
            </a>
            <Link
              to="/chat/$threadId"
              params={{ threadId: "default" }}
              className="inline-flex items-center gap-2 rounded-full border border-canvas-border bg-canvas-card px-5 py-3 text-sm font-medium text-ink transition-all hover:border-primary/50 hover:bg-canvas-subtle"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Ask AI Assistant</span>
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-3 text-xs text-sepia font-mono">
            <Orbit className="h-4 w-4 text-primary" />
            <span>Click & drag to rotate • Scroll to zoom</span>
          </div>
        </div>

        {/* 3D Brain Container */}
        <div className="relative order-1 h-[56vh] min-h-[380px] w-full md:order-2 md:h-[82vh] flex items-center justify-center">
          {/* Luminous ambient background glows */}
          <div aria-hidden className="absolute inset-[8%] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div aria-hidden className="absolute -top-10 -right-10 h-72 w-72 rounded-full bg-crimson-subtle blur-3xl pointer-events-none" />

          {mounted ? (
            <Suspense
              fallback={
                <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none">
                  <div className="relative flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full border border-primary/40 border-t-primary animate-spin" />
                    <Sparkles className="w-6 h-6 text-primary animate-pulse absolute" />
                  </div>
                  <span className="mt-4 text-xs font-mono tracking-widest text-sepia uppercase">
                    Crystalizing 3D Neural Cortex...
                  </span>
                </div>
              }
            >
              <BrainCanvas
                className="h-full w-full"
                preset="glass-silver"
                autoRotate={!reduced}
                rotationSpeed={0.65}
                showTumorMarker={false}
                showAnnotationCard={false}
                showRings={true}
                showParticles={true}
                cameraDistance={4.8}
              />
            </Suspense>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none">
              <div className="w-20 h-20 rounded-full border border-primary/30 border-t-primary/50 animate-spin" />
            </div>
          )}
        </div>
      </div>

      <a
        href="#how-it-works"
        className="absolute bottom-16 left-6 z-20 flex flex-col items-center gap-1 text-xs text-sepia md:left-[12%] transition-colors hover:text-ink"
      >
        <Mouse className="h-5 w-5 text-sepia" strokeWidth={1.3} />
        <span className="font-mono text-[11px] tracking-wider">Scroll to explore</span>
        <ArrowDown className="h-3.5 w-3.5 text-primary animate-bob" />
      </a>
      <CurvedDivider to="cream" variant={0} />
    </section>
  );
}
