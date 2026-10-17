import { ChevronRight } from "lucide-react";
import mriGrid from "@/assets/mri-grid.jpg";
import mriLayers from "@/assets/mri-layers.jpg";
import brainSeg from "@/assets/brain-segmented.jpg";
import brainGold from "@/assets/brain-gold.jpg";
import { CurvedDivider } from "./CurvedDivider";
import { SectionLabel } from "./SectionLabel";
import { useReveal } from "./useReveal";

const SEQ = ["T1", "T1Gd", "T2", "FLAIR"];

function MriStrip() {
  return (
    <div className="flex justify-center gap-1.5">
      {SEQ.map((s, i) => (
        <figure key={s} className="text-center">
          <figcaption className="mb-1 text-[11px] font-medium text-ink">{s}</figcaption>
          <div className="h-24 w-14 overflow-hidden rounded-md bg-ink shadow-soft sm:h-28 sm:w-16">
            <img
              src={mriGrid}
              alt={`${s} MRI slice`}
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
  { n: 1, title: "Input", caption: "MRI sequences.", visual: <MriStrip /> },
  {
    n: 2,
    title: "Interpretation",
    caption: "Multiple views, richer context.",
    visual: <img src={mriLayers} alt="Layered MRI planes" loading="lazy" className="mx-auto h-36 w-36 rounded-xl object-cover mix-blend-multiply" />,
  },
  {
    n: 3,
    title: "Segmentation",
    caption: "WT, TC and ET regions.",
    visual: (
      <div>
        <img src={brainSeg} alt="Brain with predicted tumour regions" loading="lazy" className="mx-auto h-32 w-32 rounded-full object-cover" />
        <ul className="mt-3 space-y-1 text-[11px] text-ink">
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-mauve-soft" />Whole Tumor (WT)</li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-primary" />Tumor Core (TC)</li>
          <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-mauve-deep" />Enhancing Tumor (ET)</li>
        </ul>
      </div>
    ),
  },
  {
    n: 4,
    title: "Visualization",
    caption: "Explore in 3D.",
    visual: <img src={brainGold} alt="3D brain visualization" loading="lazy" className="mx-auto h-36 w-36 rounded-full object-cover" />,
  },
];

export function ProcessSection() {
  const head = useReveal<HTMLDivElement>();
  const line = useReveal<HTMLDivElement>(0.25);
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-canvas pb-40 pt-20 md:pt-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[300px_1fr]">
        <div ref={head.ref} className={head.cls}>
          <SectionLabel num="02" text="The Process" />
          <h2 className="mt-6 font-serif text-4xl font-bold leading-tight text-ink md:text-5xl">
            From Slices <br />to <span className="text-primary font-serif">Structure.</span>
          </h2>
          <div className="mt-4 h-0.5 w-12 bg-border-rule" />
          <p className="mt-5 max-w-xs text-body-text">Four MRI sequences. AI-powered segmentation. An interactive 3D view.</p>
        </div>

        <div ref={line.ref} className="relative">
          <div className="absolute left-0 right-0 top-4 hidden h-px bg-primary/20 md:block">
            <div className={`h-full origin-left bg-primary transition-transform duration-[1400ms] ease-premium ${line.visible ? "scale-x-100" : "scale-x-0"}`} />
          </div>
          <div className="absolute bottom-0 left-4 top-0 w-px bg-primary/20 md:hidden" />
          <ol className="grid gap-10 md:grid-cols-4 md:gap-0">
            {STAGES.map((s, i) => (
              <li
                key={s.n}
                className={`reveal ${line.visible ? "is-visible" : ""} relative pl-12 md:px-4 md:pl-4 md:text-center ${i > 0 ? "md:border-l md:border-canvas-border" : ""}`}
                style={{ transitionDelay: `${150 + i * 180}ms` }}
              >
                <span className={`absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold md:relative md:mx-auto ${i === 0 || line.visible ? "bg-primary text-white shadow-crimson" : "bg-canvas-card text-ink border border-canvas-border"}`}>
                  {s.n}
                </span>
                <h3 className="mt-1 font-serif text-lg font-bold text-ink md:mt-4">{s.title}</h3>
                <div className="mt-5 flex min-h-40 items-center justify-start md:justify-center">{s.visual}</div>
                <p className="mt-4 text-sm text-body-text">{s.caption}</p>
                {i < 3 && <ChevronRight className="absolute -right-2.5 top-36 hidden h-5 w-5 text-primary md:block" />}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <CurvedDivider to="cola" variant={1} />
    </section>
  );
}
