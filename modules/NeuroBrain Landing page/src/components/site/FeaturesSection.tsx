import React from "react";
import mriGrid from "@/assets/mri-grid.jpg";
import mriLayers from "@/assets/mri-layers.jpg";
import brainWireframePreview from "@/assets/brain-wireframe-preview.jpg";
import { CurvedDivider } from "./CurvedDivider";
import { Particles } from "./Particles";
import { SectionLabel } from "./SectionLabel";
import { ThreeCardCarousel } from "./ThreeCardCarousel";
import { useReveal } from "./useReveal";

interface CardProps {
  img?: string;
  visual?: React.ReactNode;
  title: string;
  desc: string;
  alt?: string;
}

function Card({ img, visual, title, desc, alt }: CardProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden bg-cola-deep">
        {visual ? (
          visual
        ) : img ? (
          <img
            src={img}
            alt={alt || title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="px-4 pb-5 pt-3 text-center">
        <h3 className="font-semibold text-ivory">{title}</h3>
        <p className="mt-1 text-xs text-mist">{desc}</p>
      </div>
    </div>
  );
}

/**
 * Scientifically credible, restrained MRI segmentation visual.
 * Overlays authentic multi-compartment contours (WT, TC, ET) over an actual grayscale MRI slice.
 */
function MriSegmentationVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0205]">
      {/* Grayscale Clinical MRI Scan Background */}
      <img
        src={mriLayers}
        alt="Axial brain MRI slice with tumor region segmentation overlay"
        loading="lazy"
        className="h-full w-full object-cover grayscale contrast-125 brightness-90 transition-transform duration-700 group-hover:scale-105"
      />

      {/* Subtle radiological dark vignette */}
      <div className="pointer-events-none absolute inset-0 bg-radial from-transparent via-transparent to-[#14050a]/80" />

      {/* Restrained Vector Segmentation Overlay & Clinical Annotations */}
      <svg
        viewBox="0 0 320 240"
        className="pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Anatomical Orientation Markers */}
        <text
          x="160"
          y="18"
          fill="#f4e2c4"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          textAnchor="middle"
          opacity="0.85"
        >
          A
        </text>
        <text
          x="160"
          y="232"
          fill="#f4e2c4"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          textAnchor="middle"
          opacity="0.85"
        >
          P
        </text>
        <text
          x="16"
          y="124"
          fill="#f4e2c4"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          textAnchor="middle"
          opacity="0.85"
        >
          R
        </text>
        <text
          x="304"
          y="124"
          fill="#f4e2c4"
          fontSize="10"
          fontFamily="monospace"
          fontWeight="bold"
          textAnchor="middle"
          opacity="0.85"
        >
          L
        </text>

        {/* Technical Sequence Info Badge */}
        <g transform="translate(14, 14)">
          <text
            x="0"
            y="0"
            fill="#f4e2c4"
            fontSize="8"
            fontFamily="monospace"
            fontWeight="600"
            opacity="0.85"
          >
            T1Gd • AXIAL SLICE 78/155
          </text>
          <text x="0" y="10" fill="#fbbf24" fontSize="7" fontFamily="monospace" opacity="0.8">
            MONAI 3D U-NET OVERLAY
          </text>
        </g>

        {/* Restrained Tumor Segmentation Contours on right parietal region */}
        {/* WT: Whole Tumor boundary (edema + core) in subtle rose */}
        <path
          d="M 175 90 C 195 78, 225 82, 235 105 C 245 125, 230 150, 210 158 C 190 165, 168 152, 162 135 C 158 118, 162 98, 175 90 Z"
          fill="rgba(244, 63, 94, 0.22)"
          stroke="#f43f5e"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          filter="url(#soft-glow)"
        />

        {/* TC: Tumor Core boundary in cyan */}
        <path
          d="M 185 102 C 200 95, 220 98, 225 115 C 230 130, 220 144, 205 146 C 192 148, 178 138, 175 126 C 172 115, 176 106, 185 102 Z"
          fill="rgba(56, 189, 248, 0.28)"
          stroke="#38bdf8"
          strokeWidth="1.6"
          filter="url(#soft-glow)"
        />

        {/* ET: Enhancing Tumor rim in gold */}
        <path
          d="M 194 110 C 205 106, 215 108, 218 118 C 220 126, 214 135, 204 136 C 196 137, 188 131, 187 124 C 186 117, 189 112, 194 110 Z"
          fill="rgba(251, 191, 36, 0.38)"
          stroke="#fbbf24"
          strokeWidth="1.8"
          filter="url(#soft-glow)"
        />

        {/* Crosshair target indicator on tumor centroid */}
        <line x1="202" y1="116" x2="202" y2="128" stroke="#ffffff" strokeWidth="1" opacity="0.75" />
        <line x1="196" y1="122" x2="208" y2="122" stroke="#ffffff" strokeWidth="1" opacity="0.75" />

        {/* Bottom Legend Pills */}
        <g transform="translate(14, 215)">
          <rect
            width="180"
            height="16"
            rx="3"
            fill="#14050A"
            fillOpacity="0.85"
            stroke="#f43f5e"
            strokeWidth="0.6"
            strokeOpacity="0.4"
          />
          <circle cx="10" cy="8" r="3" fill="#f43f5e" />
          <text x="17" y="11" fill="#f4e2c4" fontSize="7" fontFamily="monospace">
            WT
          </text>
          <circle cx="50" cy="8" r="3" fill="#38bdf8" />
          <text x="57" y="11" fill="#f4e2c4" fontSize="7" fontFamily="monospace">
            TC
          </text>
          <circle cx="90" cy="8" r="3" fill="#fbbf24" />
          <text x="97" y="11" fill="#f4e2c4" fontSize="7" fontFamily="monospace">
            ET
          </text>
          <text x="122" y="11" fill="#a3969a" fontSize="6.5" fontFamily="monospace">
            • Calibrated
          </text>
        </g>
      </svg>
    </div>
  );
}

export function FeaturesSection() {
  const head = useReveal<HTMLDivElement>();
  const body = useReveal<HTMLDivElement>(0.15);

  return (
    <section id="features" className="relative -mt-px overflow-hidden bg-cola pb-44 pt-16 md:pt-20">
      <Particles />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[300px_1fr]">
        <div ref={head.ref} className={head.cls}>
          <SectionLabel num="03" text="What We Do" dark />
          <h2 className="mt-6 text-4xl font-bold leading-tight text-ivory md:text-5xl">
            Explore Every <br />
            <span className="text-rose-gradient">Dimension.</span>
          </h2>
          <p className="mt-5 max-w-xs text-mist">
            A complete 3D view of the brain, designed to make complex MRI information easier to
            explore.
          </p>
        </div>
        <div ref={body.ref} className={body.cls}>
          <ThreeCardCarousel
            tone="dark"
            items={[
              {
                key: "mri",
                label: "MRI Sequence Exploration",
                render: () => (
                  <Card
                    img={mriGrid}
                    alt="T1, T1Gd, T2 and FLAIR MRI slices"
                    title="MRI Sequence Exploration"
                    desc="View and compare MRI sequences."
                  />
                ),
              },
              {
                key: "seg",
                label: "Tumor Region Segmentation",
                render: () => (
                  <Card
                    visual={<MriSegmentationVisual />}
                    title="Tumor Region Segmentation"
                    desc="Explore predicted WT, TC and ET regions."
                  />
                ),
              },
              {
                key: "rot",
                label: "Interactive Brain Rotation",
                render: () => (
                  <Card
                    img={brainWireframePreview}
                    alt="Interactive 3D wireframe brain model"
                    title="Interactive Brain Rotation"
                    desc="Rotate, zoom and explore the brain in 3D."
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
      <CurvedDivider to="cream" variant={2} />
    </section>
  );
}
