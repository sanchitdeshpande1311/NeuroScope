import { useState, useRef } from "react";
import { ChevronRight } from "lucide-react";
import mriGrid from "@/assets/mri-grid.jpg";
import mriLayers from "@/assets/mri-layers.jpg";
import brainWireframePreview from "@/assets/brain-wireframe-preview.jpg";
import { CurvedDivider } from "./CurvedDivider";
import { SectionLabel } from "./SectionLabel";
import { useReveal, usePrefersReducedMotion } from "./useReveal";

const SEQ = ["T1", "T1Gd", "T2", "FLAIR"];

function MriStrip() {
  return (
    <div className="flex w-full justify-center gap-1.5 sm:gap-2">
      {SEQ.map((s, i) => (
        <figure key={s} className="text-center">
          <figcaption className="mb-1 text-[10px] font-semibold tracking-wider text-ink sm:text-[11px]">
            {s}
          </figcaption>
          <div className="h-20 w-11 overflow-hidden rounded-md bg-ink shadow-soft sm:h-26 sm:w-14 md:h-20 md:w-11 lg:h-26 lg:w-14">
            <img
              src={mriGrid}
              alt={`${s} MRI sequence slice`}
              loading="lazy"
              className="h-[200%] w-[200%] max-w-none object-cover"
              style={{ transform: `translate(${i % 2 ? "-50%" : "0"}, ${i > 1 ? "-50%" : "0"})` }}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}

const STAGES = [
  {
    n: 1,
    title: "Input",
    subtitle: "FOUR MRI SEQUENCES",
    primaryText: "Four sequences reveal complementary brain information.",
    keyLabels: ["T1", "T1Gd", "T2", "FLAIR"],
    visual: <MriStrip />,
  },
  {
    n: 2,
    title: "Interpretation",
    subtitle: "MULTI-PLANAR CONTEXT",
    primaryText: "MRI data provides complementary anatomical context.",
    visual: (
      <img
        src={mriLayers}
        alt="Layered MRI planes"
        loading="lazy"
        className="mx-auto h-32 w-32 rounded-xl object-cover mix-blend-multiply sm:h-36 sm:w-36"
      />
    ),
  },
  {
    n: 3,
    title: "Segmentation",
    subtitle: "TUMOUR COMPARTMENTS",
    primaryText: "AI predicts tumour regions in the MRI.",
    keyLabels: ["WT", "TC", "ET"],
    visual: (
      <div className="w-full text-center">
        <div className="relative mx-auto h-28 w-28 overflow-hidden rounded-full border border-rose/30 bg-[#0a0205] shadow-inner sm:h-32 sm:w-32">
          <img
            src={mriLayers}
            alt="Axial brain MRI slice with predicted tumour regions"
            loading="lazy"
            className="h-full w-full object-cover grayscale contrast-125 brightness-95"
          />
          <svg
            viewBox="0 0 100 100"
            className="pointer-events-none absolute inset-0 h-full w-full"
            fill="none"
          >
            <circle
              cx="58"
              cy="48"
              r="16"
              fill="rgba(244, 63, 94, 0.25)"
              stroke="#f43f5e"
              strokeWidth="1.2"
              strokeDasharray="3 2"
            />
            <circle
              cx="60"
              cy="47"
              r="10"
              fill="rgba(56, 189, 248, 0.32)"
              stroke="#38bdf8"
              strokeWidth="1.2"
            />
            <circle
              cx="61"
              cy="46"
              r="5"
              fill="rgba(251, 191, 36, 0.45)"
              stroke="#fbbf24"
              strokeWidth="1.4"
            />
          </svg>
        </div>
        <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-ink">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose" /> WT
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan" /> TC
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gold" /> ET
          </span>
        </div>
      </div>
    ),
  },
  {
    n: 4,
    title: "Visualization",
    subtitle: "3D EXPLORATION",
    primaryText: "Explore predicted regions in interactive 3D.",
    visual: (
      <img
        src={brainWireframePreview}
        alt="3D wireframe brain visualization"
        loading="lazy"
        className="mx-auto h-32 w-32 rounded-full object-cover sm:h-36 sm:w-36"
      />
    ),
  },
];

function StageCard({
  stage,
  index,
  isLineVisible,
  reduced,
}: {
  stage: (typeof STAGES)[0];
  index: number;
  isLineVisible: boolean;
  reduced: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, hovered: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === "touch") return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;

    setTilt({
      x: -py * 8, // gentle pitch (max 4 deg)
      y: px * 8, // gentle yaw (max 4 deg)
      hovered: true,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ x: 0, y: 0, hovered: false });
  };

  return (
    <li
      className={`reveal ${isLineVisible ? "is-visible" : ""} relative pl-14 sm:pl-16 md:px-3 md:pl-3 md:text-center ${
        index > 0 ? "md:border-l md:border-rose/15" : ""
      }`}
      style={{ transitionDelay: `${150 + index * 160}ms` }}
    >
      {/* Stage Number Marker Circle */}
      <span
        className={`absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full text-sm font-bold ring-4 ring-cream transition-all duration-500 md:relative md:mx-auto md:h-8 md:w-8 ${
          index === 0 || isLineVisible ? "bg-rose-deep text-ivory shadow-glow" : "bg-blush text-ink"
        }`}
      >
        {stage.n}
      </span>

      {/* Interactive 3D Card Shell */}
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: tilt.hovered
            ? `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(-5px)`
            : "perspective(700px) rotateX(0deg) rotateY(0deg) translateY(0px)",
          transition: tilt.hovered
            ? "transform 0.08s ease-out, box-shadow 0.25s ease-out"
            : "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s ease-out",
        }}
        className={`group mt-3 rounded-2xl border p-4 transition-all duration-300 md:mt-4 ${
          tilt.hovered
            ? "border-rose/35 bg-ivory/95 shadow-xl shadow-cola/10"
            : "border-transparent bg-ivory/55 hover:border-rose/20 shadow-soft"
        }`}
      >
        <h3 className="text-lg font-bold text-ink">{stage.title}</h3>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-deep">
          {stage.subtitle}
        </p>

        {/* Visual Container: well-constrained to prevent any timeline overlap */}
        <div className="mt-4 flex min-h-36 items-center justify-center overflow-hidden">
          {stage.visual}
        </div>

        <p className="mt-3 text-xs font-normal leading-relaxed text-ink/80">{stage.primaryText}</p>
        {stage.keyLabels && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-mono font-medium text-rose-deep">
            {stage.keyLabels.map((lbl, idx) => (
              <span key={lbl} className="inline-flex items-center gap-1">
                <span className="rounded border border-rose/20 bg-cream/90 px-1.5 py-0.5 font-semibold text-ink">
                  {lbl}
                </span>
                {idx < stage.keyLabels!.length - 1 && <span className="text-rose/40">·</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inter-stage connecting Chevron (desktop only) */}
      {index < 3 && (
        <ChevronRight
          aria-hidden
          className="pointer-events-none absolute -right-3 top-36 z-20 hidden h-5 w-5 text-rose md:block"
        />
      )}
    </li>
  );
}

export function ProcessSection() {
  const head = useReveal<HTMLDivElement>();
  const line = useReveal<HTMLDivElement>(0.25);
  const reduced = usePrefersReducedMotion();

  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-cream-gradient pb-40 pt-20 md:pt-24"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[300px_1fr]">
        <div ref={head.ref} className={head.cls}>
          <SectionLabel num="02" text="The Process" />
          <h2 className="mt-6 text-4xl font-bold leading-tight text-ink md:text-5xl">
            From Slices <br />
            to <span className="text-rose-gradient">Structure.</span>
          </h2>
          <p className="mt-5 max-w-xs text-dusk">
            Four MRI sequences. Deep-learning segmentation. Interactive 3D cortical analysis.
          </p>
        </div>

        <div ref={line.ref} className="relative">
          {/* Desktop Timeline: Cleanly anchored between marker 1 center (12.5%) and marker 4 center (87.5%) */}
          <div
            aria-hidden
            className="absolute left-[12.5%] right-[12.5%] top-4 z-0 hidden h-px bg-rose/25 md:block"
          >
            <div
              className={`h-full origin-left bg-rose transition-transform duration-[1400ms] ease-premium ${
                line.visible ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </div>

          {/* Mobile Timeline: Anchored behind markers with proper offset */}
          <div
            aria-hidden
            className="absolute bottom-6 left-[1.125rem] top-4 z-0 w-px bg-rose/25 md:hidden"
          />

          <ol className="grid gap-8 md:grid-cols-4 md:gap-0">
            {STAGES.map((s, i) => (
              <StageCard
                key={s.n}
                stage={s}
                index={i}
                isLineVisible={line.visible}
                reduced={reduced}
              />
            ))}
          </ol>
        </div>
      </div>
      <CurvedDivider to="cola" variant={1} />
    </section>
  );
}
