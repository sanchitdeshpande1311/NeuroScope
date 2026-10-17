import mriGrid from "@/assets/mri-grid.jpg";
import brainSeg from "@/assets/brain-segmented.jpg";
import brainGold from "@/assets/brain-gold.jpg";
import { CurvedDivider } from "./CurvedDivider";
import { Particles } from "./Particles";
import { SectionLabel } from "./SectionLabel";
import { ThreeCardCarousel } from "./ThreeCardCarousel";
import { useReveal } from "./useReveal";

function Card({ img, title, desc, alt }: { img: string; title: string; desc: string; alt: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <img src={img} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
      </div>
      <div className="px-4 pb-5 pt-3 text-center">
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-[#cbb8c4]">{desc}</p>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const head = useReveal<HTMLDivElement>();
  const body = useReveal<HTMLDivElement>(0.15);
  return (
    <section id="features" className="relative -mt-px overflow-hidden bg-umber-deep pb-44 pt-16 md:pt-20">
      <Particles />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[300px_1fr]">
        <div ref={head.ref} className={head.cls}>
          <SectionLabel num="03" text="What We Do" dark />
          <h2 className="mt-6 font-serif text-4xl font-bold leading-tight text-white md:text-5xl">
            Explore Every <br /><span className="text-primary font-serif">Dimension.</span>
          </h2>
          <div className="mt-4 h-0.5 w-12 bg-border-rule opacity-60" />
          <p className="mt-5 max-w-xs text-[#d1beb4]">
            A complete 3D view of the brain, designed to make complex MRI information easier to explore.
          </p>
        </div>
        <div ref={body.ref} className={body.cls}>
          <ThreeCardCarousel
            tone="dark"
            items={[
              { key: "mri", label: "MRI Sequence Exploration", render: () => <Card img={mriGrid} alt="T1, T1Gd, T2 and FLAIR MRI slices" title="MRI Sequence Exploration" desc="View and compare MRI sequences." /> },
              { key: "seg", label: "Tumor Region Segmentation", render: () => <Card img={brainSeg} alt="Brain with predicted WT, TC and ET regions" title="Tumor Region Segmentation" desc="Explore predicted WT, TC and ET regions." /> },
              { key: "rot", label: "Interactive Brain Rotation", render: () => <Card img={brainGold} alt="Detailed 3D brain with orbit lines" title="Interactive Brain Rotation" desc="Rotate, zoom and explore from different angles." /> },
            ]}
          />
        </div>
      </div>
      <CurvedDivider to="cream" variant={2} />
    </section>
  );
}
