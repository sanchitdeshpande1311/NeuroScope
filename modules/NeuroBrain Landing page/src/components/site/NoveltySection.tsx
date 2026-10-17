import PolaroidLineCarousel, { type Slide } from "@/components/ui/polaroid-line-carousel";
import { CurvedDivider } from "./CurvedDivider";
import { SectionLabel } from "./SectionLabel";
import { useReveal } from "./useReveal";

/* =========================================================================
   SCIENTIFIC RESEARCH PLATE 1: From MRI to Segmentation
   ========================================================================= */
function PlateSegmentation() {
  return (
    <div className="flex h-full w-full flex-col justify-between p-3.5 text-ivory">
      {/* Header Badge */}
      <div className="flex items-center justify-between border-b border-rose/20 pb-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-gold">
          Stage 01 • MONAI 3D U-Net
        </span>
        <span className="rounded border border-rose/30 bg-cola-deep/80 px-1.5 py-0.5 font-mono text-[9px] text-ivory">
          4 In → 3 Out
        </span>
      </div>

      {/* SVG Flow Architecture */}
      <div className="relative my-auto flex items-center justify-center py-1">
        <svg
          viewBox="0 0 290 135"
          className="h-auto w-full max-w-[280px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="unet-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e85d75" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#f4b251" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#00d2d3" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="flow-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#e85d75" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#f4b251" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* 4 Input Modality Badges */}
          <g transform="translate(4, 10)">
            <text x="0" y="0" fill="#f4e2c4" fontSize="8" fontFamily="monospace" fontWeight="bold">
              MODALITIES (4)
            </text>

            <g transform="translate(0, 8)">
              <rect width="44" height="20" rx="3" fill="#240a12" stroke="#38bdf8" strokeWidth="1" />
              <text x="22" y="13" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">
                T1
              </text>
            </g>

            <g transform="translate(0, 34)">
              <rect width="44" height="20" rx="3" fill="#240a12" stroke="#f43f5e" strokeWidth="1" />
              <text x="22" y="13" fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle">
                T1Gd
              </text>
            </g>

            <g transform="translate(0, 60)">
              <rect width="44" height="20" rx="3" fill="#240a12" stroke="#2dd4bf" strokeWidth="1" />
              <text x="22" y="13" fill="#2dd4bf" fontSize="9" fontWeight="bold" textAnchor="middle">
                T2
              </text>
            </g>

            <g transform="translate(0, 86)">
              <rect width="44" height="20" rx="3" fill="#240a12" stroke="#fbbf24" strokeWidth="1" />
              <text x="22" y="13" fill="#fbbf24" fontSize="9" fontWeight="bold" textAnchor="middle">
                FLAIR
              </text>
            </g>
          </g>

          {/* Convergence lines to 3D U-Net */}
          <path
            d="M52 28 C70 28, 75 58, 88 58"
            stroke="url(#flow-line)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <path
            d="M52 54 C70 54, 75 62, 88 62"
            stroke="url(#flow-line)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <path
            d="M52 80 C70 80, 75 66, 88 66"
            stroke="url(#flow-line)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <path
            d="M52 106 C70 106, 75 70, 88 70"
            stroke="url(#flow-line)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />

          {/* 3D U-Net Schematic Diagram */}
          <g transform="translate(94, 18)">
            <text
              x="46"
              y="-6"
              fill="#f4b251"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="middle"
            >
              3D U-NET PIPELINE
            </text>

            {/* Encoder Stack */}
            <rect
              x="0"
              y="8"
              width="14"
              height="88"
              rx="2"
              fill="#2a0d18"
              stroke="#e85d75"
              strokeWidth="1.2"
            />
            <rect
              x="20"
              y="24"
              width="14"
              height="68"
              rx="2"
              fill="#2a0d18"
              stroke="#e85d75"
              strokeWidth="1.2"
            />
            <rect
              x="40"
              y="44"
              width="14"
              height="48"
              rx="2"
              fill="#2a0d18"
              stroke="#f4b251"
              strokeWidth="1.5"
            />

            {/* Decoder Stack */}
            <rect
              x="60"
              y="24"
              width="14"
              height="68"
              rx="2"
              fill="#2a0d18"
              stroke="#00d2d3"
              strokeWidth="1.2"
            />
            <rect
              x="80"
              y="8"
              width="14"
              height="88"
              rx="2"
              fill="#2a0d18"
              stroke="#00d2d3"
              strokeWidth="1.2"
            />

            {/* Skip Connections */}
            <path
              d="M14 20 L80 20"
              stroke="#f4e2c4"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
            <path
              d="M34 40 L60 40"
              stroke="#f4e2c4"
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />

            {/* Connecting arrows */}
            <path d="M14 55 L20 55" stroke="#e85d75" strokeWidth="1" />
            <path d="M34 65 L40 65" stroke="#f4b251" strokeWidth="1" />
            <path d="M54 65 L60 65" stroke="#00d2d3" strokeWidth="1" />
            <path d="M74 55 L80 55" stroke="#00d2d3" strokeWidth="1" />
          </g>

          {/* Divergence lines to Output Compartments */}
          <path
            d="M192 48 C206 48, 210 32, 224 32"
            stroke="#f43f5e"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <path
            d="M192 64 C206 64, 210 64, 224 64"
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
          <path
            d="M192 80 C206 80, 210 96, 224 96"
            stroke="#fbbf24"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />

          {/* 3 Output Compartment Badges */}
          <g transform="translate(228, 14)">
            <text x="0" y="-4" fill="#f4e2c4" fontSize="8" fontFamily="monospace" fontWeight="bold">
              PREDICTIONS (3)
            </text>

            <g transform="translate(0, 8)">
              <rect width="56" height="22" rx="3" fill="#240a12" stroke="#f43f5e" strokeWidth="1" />
              <text x="8" y="14" fill="#f43f5e" fontSize="9" fontWeight="bold">
                WT
              </text>
              <text x="27" y="13" fill="#f4e2c4" fontSize="7" opacity="0.8">
                Whole
              </text>
            </g>

            <g transform="translate(0, 40)">
              <rect width="56" height="22" rx="3" fill="#240a12" stroke="#38bdf8" strokeWidth="1" />
              <text x="8" y="14" fill="#38bdf8" fontSize="9" fontWeight="bold">
                TC
              </text>
              <text x="27" y="13" fill="#f4e2c4" fontSize="7" opacity="0.8">
                Core
              </text>
            </g>

            <g transform="translate(0, 72)">
              <rect width="56" height="22" rx="3" fill="#240a12" stroke="#fbbf24" strokeWidth="1" />
              <text x="8" y="14" fill="#fbbf24" fontSize="9" fontWeight="bold">
                ET
              </text>
              <text x="27" y="13" fill="#f4e2c4" fontSize="7" opacity="0.8">
                Enhance
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* Compartment Legend Tags */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-t border-rose/15 pt-2 text-[9px] text-mist">
        <span className="flex items-center gap-1 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-rose" /> WT: Whole Tumor
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> TC: Tumor Core
        </span>
        <span className="flex items-center gap-1 font-mono">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> ET: Enhancing
        </span>
      </div>
    </div>
  );
}

/* =========================================================================
   SCIENTIFIC RESEARCH PLATE 2: Graph-Based Spatial Analysis
   ========================================================================= */
function PlateGraphAnalysis() {
  return (
    <div className="flex h-full w-full flex-col justify-between p-3.5 text-ivory">
      {/* Mathematical Formulation Pill */}
      <div className="flex items-center justify-between border-b border-rose/20 pb-2">
        <div className="font-mono text-xs font-bold text-gold">
          G = (<span className="text-rose">V</span>, <span className="text-cyan">E</span>,{" "}
          <span className="text-mist">w</span>)
        </div>
        <span className="rounded border border-gold/40 bg-cola-deep/90 px-2 py-0.5 font-mono text-[9px] text-gold">
          Dijkstra Geodesics
        </span>
      </div>

      {/* SVG Interactive Topological Graph */}
      <div className="relative my-auto flex items-center justify-center py-1">
        <svg
          viewBox="0 0 290 135"
          className="h-auto w-full max-w-[280px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="glow-gold" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="dijkstra-path" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#00d2d3" />
            </linearGradient>
          </defs>

          {/* Background Structural Graph Edges (Non-shortest path) */}
          <g stroke="rgba(244, 226, 196, 0.2)" strokeWidth="1.2">
            <line x1="36" y1="68" x2="90" y2="108" />
            <line x1="90" y1="108" x2="148" y2="106" />
            <line x1="86" y1="36" x2="148" y2="106" />
            <line x1="144" y1="34" x2="148" y2="106" />
            <line x1="148" y1="106" x2="204" y2="70" />
            <line x1="204" y1="70" x2="254" y2="38" />
            <line x1="254" y1="38" x2="260" y2="94" />
          </g>

          {/* Edge Weight Badges on Background Edges */}
          <g fill="#a3969a" fontSize="7" fontFamily="monospace" textAnchor="middle">
            <text x="60" y="98">
              w=2.4
            </text>
            <text x="120" y="115">
              w=1.8
            </text>
            <text x="180" y="100">
              w=1.5
            </text>
            <text x="236" y="50">
              w=1.7
            </text>
          </g>

          {/* HIGHLIGHTED SHORTEST PATH (Dijkstra Traversal): S -> v1 -> v3 -> v5 -> T */}
          <path
            d="M 36 68 L 86 36 L 144 34 L 204 70 L 260 94"
            stroke="url(#dijkstra-path)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow-gold)"
          />

          {/* Animated Travelling Particle along Shortest Path */}
          <circle r="3.5" fill="#ffffff">
            <animateMotion
              path="M 36 68 L 86 36 L 144 34 L 204 70 L 260 94"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Edge Weight Badges along Shortest Path */}
          <g
            fill="#fbbf24"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            <rect
              x="52"
              y="42"
              width="22"
              height="11"
              rx="2"
              fill="#1b060e"
              stroke="#fbbf24"
              strokeWidth="0.8"
            />
            <text x="63" y="50">
              1.2
            </text>

            <rect
              x="108"
              y="26"
              width="22"
              height="11"
              rx="2"
              fill="#1b060e"
              stroke="#fbbf24"
              strokeWidth="0.8"
            />
            <text x="119" y="34">
              0.8
            </text>

            <rect
              x="168"
              y="44"
              width="22"
              height="11"
              rx="2"
              fill="#1b060e"
              stroke="#fbbf24"
              strokeWidth="0.8"
            />
            <text x="179" y="52">
              1.1
            </text>

            <rect
              x="226"
              y="74"
              width="22"
              height="11"
              rx="2"
              fill="#1b060e"
              stroke="#fbbf24"
              strokeWidth="0.8"
            />
            <text x="237" y="82">
              0.9
            </text>
          </g>

          {/* Graph Nodes */}
          {/* Node S (Source Tumor Core Seed) */}
          <circle cx="36" cy="68" r="10" fill="none" stroke="#f43f5e" strokeWidth="1" opacity="0.6">
            <animate attributeName="r" values="7;14;7" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="36" cy="68" r="6" fill="#f43f5e" stroke="#f4e2c4" strokeWidth="1.5" />
          <text
            x="36"
            y="85"
            fill="#f4e2c4"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            S (d=0)
          </text>

          {/* Node v1 */}
          <circle cx="86" cy="36" r="4.5" fill="#fbbf24" stroke="#240a12" strokeWidth="1.2" />
          <text
            x="86"
            y="27"
            fill="#f4e2c4"
            fontSize="7"
            fontFamily="monospace"
            textAnchor="middle"
          >
            d=1.2
          </text>

          {/* Node v2 (Branch) */}
          <circle cx="90" cy="108" r="4" fill="#3a1b26" stroke="#e85d75" strokeWidth="1" />

          {/* Node v3 */}
          <circle cx="144" cy="34" r="4.5" fill="#fbbf24" stroke="#240a12" strokeWidth="1.2" />
          <text
            x="144"
            y="25"
            fill="#f4e2c4"
            fontSize="7"
            fontFamily="monospace"
            textAnchor="middle"
          >
            d=2.0
          </text>

          {/* Node v4 (Branch) */}
          <circle cx="148" cy="106" r="4" fill="#3a1b26" stroke="#e85d75" strokeWidth="1" />

          {/* Node v5 */}
          <circle cx="204" cy="70" r="4.5" fill="#fbbf24" stroke="#240a12" strokeWidth="1.2" />
          <text
            x="204"
            y="60"
            fill="#f4e2c4"
            fontSize="7"
            fontFamily="monospace"
            textAnchor="middle"
          >
            d=3.1
          </text>

          {/* Node v6 (Branch) */}
          <circle cx="254" cy="38" r="4" fill="#3a1b26" stroke="#e85d75" strokeWidth="1" />

          {/* Target Boundary Node T */}
          <circle cx="260" cy="94" r="6" fill="#00d2d3" stroke="#f4e2c4" strokeWidth="1.5" />
          <text
            x="260"
            y="112"
            fill="#00d2d3"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            T (d=4.0)
          </text>
        </svg>
      </div>

      {/* Geodesic Summary Footer */}
      <div className="flex items-center justify-between border-t border-rose/15 pt-2 text-[9px] text-mist">
        <span className="font-mono text-gold">Shortest Path: S → v₁ → v₃ → v₅ → T</span>
        <span className="font-mono text-ivory/80">Cost Σ = 4.0</span>
      </div>
    </div>
  );
}

/* =========================================================================
   SCIENTIFIC RESEARCH PLATE 3: Quantitative Tumour Analysis
   ========================================================================= */
function PlateQuantitative() {
  return (
    <div className="flex h-full w-full flex-col justify-between p-3.5 text-ivory">
      {/* Physical Volume Formulation */}
      <div className="flex items-center justify-between border-b border-rose/20 pb-2">
        <div className="font-mono text-xs font-semibold text-ivory">
          V<sub className="text-[9px]">mm³</sub> = N<sub className="text-[9px]">voxels</sub> × (s
          <sub className="text-[9px]">x</sub> · s<sub className="text-[9px]">y</sub> · s
          <sub className="text-[9px]">z</sub>)
        </div>
        <span className="font-mono text-[10px] text-gold">
          V<sub className="text-[8px]">mL</sub> = V<sub className="text-[8px]">mm³</sub> / 1000
        </span>
      </div>

      {/* Isometric Voxel Grid & Calibrated Measurement Breakdown */}
      <div className="relative my-auto flex items-center justify-between gap-2 py-1">
        {/* Isometric 3D Voxel Cluster SVG */}
        <div className="flex-1">
          <svg
            viewBox="0 0 130 115"
            className="h-auto w-full max-w-[125px]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Isometric Voxel Cubes */}
            {/* Cube 1 (Base Bottom) */}
            <g transform="translate(42, 60)">
              <polygon
                points="0,0 20,-11 40,0 20,11"
                fill="#f43f5e"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="0,0 20,11 20,31 0,20"
                fill="#be123c"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="40,0 20,11 20,31 40,20"
                fill="#9f1239"
                stroke="#240a12"
                strokeWidth="0.8"
              />
            </g>

            {/* Cube 2 (Base Right) */}
            <g transform="translate(62, 49)">
              <polygon
                points="0,0 20,-11 40,0 20,11"
                fill="#f43f5e"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="0,0 20,11 20,31 0,20"
                fill="#be123c"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="40,0 20,11 20,31 40,20"
                fill="#9f1239"
                stroke="#240a12"
                strokeWidth="0.8"
              />
            </g>

            {/* Cube 3 (Mid Tumor Core - Cyan) */}
            <g transform="translate(42, 39)">
              <polygon
                points="0,0 20,-11 40,0 20,11"
                fill="#38bdf8"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="0,0 20,11 20,31 0,20"
                fill="#0284c7"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="40,0 20,11 20,31 40,20"
                fill="#0369a1"
                stroke="#240a12"
                strokeWidth="0.8"
              />
            </g>

            {/* Cube 4 (Top Enhancing Tumor - Gold) */}
            <g transform="translate(42, 18)">
              <polygon
                points="0,0 20,-11 40,0 20,11"
                fill="#fbbf24"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="0,0 20,11 20,31 0,20"
                fill="#d97706"
                stroke="#240a12"
                strokeWidth="0.8"
              />
              <polygon
                points="40,0 20,11 20,31 40,20"
                fill="#b45309"
                stroke="#240a12"
                strokeWidth="0.8"
              />
            </g>

            {/* Dimension Callout Arrows */}
            <line
              x1="16"
              y1="78"
              x2="38"
              y2="90"
              stroke="#f4e2c4"
              strokeWidth="1"
              markerEnd="url(#arrow)"
            />
            <text x="8" y="96" fill="#f4e2c4" fontSize="8" fontFamily="monospace">
              1.0 mm³
            </text>
          </svg>
        </div>

        {/* Calibrated Metrics Table */}
        <div className="flex-[1.2] rounded-lg border border-rose/20 bg-cola-deep/90 p-2 text-left">
          <div className="mb-1 font-mono text-[8px] uppercase tracking-wider text-mist">
            * Calibrated Metrics (Sample)
          </div>
          <div className="space-y-1 font-mono text-[9px]">
            <div className="flex items-center justify-between border-b border-rose/10 pb-0.5">
              <span className="text-rose-glow">WT Volume:</span>
              <span className="font-bold text-ivory">34.25 mL</span>
            </div>
            <div className="flex items-center justify-between border-b border-rose/10 pb-0.5">
              <span className="text-cyan">TC Volume:</span>
              <span className="font-bold text-ivory">18.40 mL</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gold">ET Volume:</span>
              <span className="font-bold text-ivory">9.15 mL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Spacing Resolution Note */}
      <div className="flex items-center justify-between border-t border-rose/15 pt-2 text-[9px] text-mist">
        <span className="font-mono">Spatial Spacing: 1.0 × 1.0 × 1.0 mm</span>
        <span className="font-mono text-gold">1 voxel = 0.001 mL</span>
      </div>
    </div>
  );
}

/* =========================================================================
   NOVELTY SECTION COMPONENT
   ========================================================================= */
const NOVELTY_SLIDES: Slide[] = [
  {
    title: "From MRI to Segmentation",
    caption: "Four modalities. Three predicted tumour regions.",
    content: <PlateSegmentation />,
  },
  {
    title: "Graph-Based Spatial Analysis",
    caption: "Model spatial relationships through weighted paths.",
    content: <PlateGraphAnalysis />,
  },
  {
    title: "Quantitative Tumour Analysis",
    caption: "Translate segmented voxels into physical measurements.",
    content: <PlateQuantitative />,
  },
];

export function NoveltySection() {
  const head = useReveal<HTMLDivElement>();
  const body = useReveal<HTMLDivElement>(0.12);

  return (
    <section
      id="about"
      className="relative overflow-hidden bg-cream-gradient pb-28 pt-16 md:pb-36 md:pt-20"
    >
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div ref={head.ref} className={`max-w-2xl ${head.cls}`}>
          <SectionLabel num="04" text="Our Novelty" />
          <h2 className="mt-4 text-4xl font-bold leading-tight text-ink md:text-5xl">
            A Different Way <br />
            to <span className="text-rose-gradient">See the Brain.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-dusk md:text-base">
            Bridging deep-learning segmentation with explicit graph-theoretic spatial models and
            reproducible geometric quantification.
          </p>
        </div>

        {/* Suspended Scientific Carousel */}
        <div ref={body.ref} className={`mt-8 md:mt-12 ${body.cls}`}>
          <PolaroidLineCarousel
            slides={NOVELTY_SLIDES}
            initialIndex={1}
            height="560px"
            cardWidth={340}
            sag={44}
            swing={0.85}
            autoplay={6000}
            string="rgba(190, 40, 75, 0.45)"
            background="transparent"
            ink="#210a10"
            ariaLabel="Interactive scientific research plates"
          />
        </div>
      </div>

      {/* Curved Divider Transition to Dark Cola Footer */}
      <CurvedDivider to="cola" variant={0} />
    </section>
  );
}
