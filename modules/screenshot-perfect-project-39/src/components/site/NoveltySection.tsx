import mriGrid from "@/assets/mri-grid.jpg";
import brainGraph from "@/assets/brain-graph.jpg";
import mriCompare from "@/assets/mri-compare.jpg";
import { SectionLabel } from "./SectionLabel";
import { ThreeCardCarousel } from "./ThreeCardCarousel";
import { useReveal } from "./useReveal";

function Tag({ children }: { children: string }) {
  return <span className="rounded-full bg-canvas-card px-2.5 py-0.5 text-[10px] font-semibold text-primary border border-canvas-border shadow-xs">{children}</span>;
}

export function NoveltySection() {
  const head = useReveal<HTMLDivElement>();
  const body = useReveal<HTMLDivElement>(0.15);
  return (
    <section id="about" className="relative overflow-hidden bg-canvas pb-10 pt-16 md:pt-20">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[300px_1fr]">
        <div ref={head.ref} className={head.cls}>
          <SectionLabel num="04" text="Our Novelty" />
          <h2 className="mt-6 font-serif text-4xl font-bold leading-tight text-ink md:text-5xl">
            A Different Way <br />to <span className="text-primary font-serif">See the Brain.</span>
          </h2>
          <div className="mt-4 h-0.5 w-12 bg-border-rule" />
        </div>
        <div ref={body.ref} className={body.cls}>
          <ThreeCardCarousel
            tone="light"
            items={[
              {
                key: "views",
                label: "MRI Views",
                render: () => (
                  <div className="relative h-full p-3 pt-12">
                    <img src={mriGrid} alt="Four MRI sequence previews" loading="lazy" className="h-full w-full rounded-lg object-cover" />
                    <div className="absolute inset-x-5 bottom-5 flex flex-wrap gap-1">{["T1", "T1Gd", "T2", "FLAIR"].map((t) => <Tag key={t}>{t}</Tag>)}</div>
                  </div>
                ),
              },
              {
                key: "graph",
                label: "Graph Analysis",
                render: () => (
                  <div className="relative h-full">
                    <img src={brainGraph} alt="Brain with spatial connectivity graph and shortest-path nodes" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute bottom-3 left-3"><Tag>Path analysis</Tag></div>
                  </div>
                ),
              },
              {
                key: "compare",
                label: "MRI Comparison",
                render: () => (
                  <div className="relative flex h-full flex-col justify-center p-3">
                    <img src={mriCompare} alt="Illustrative comparison of previous and current scans" loading="lazy" className="w-full rounded-lg object-cover" />
                    <div className="mt-3 flex justify-between px-2"><Tag>Previous scan</Tag><Tag>Current scan</Tag></div>
                    <p className="mt-2 text-center text-[10px] text-muted-foreground">Illustrative example</p>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
      <footer className="mx-auto mt-20 max-w-7xl border-t border-border px-6 pt-6 text-center text-xs text-sepia">
        Research and educational prototype only. Not intended for diagnosis or clinical decision-making.
        <span className="mt-1 block opacity-70">© NeuroScope 3D</span>
      </footer>
    </section>
  );
}
