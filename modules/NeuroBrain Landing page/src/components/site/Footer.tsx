import { ArrowUp, Brain } from "lucide-react";

const NAV_LINKS = [
  { id: "home", label: "Home" },
  { id: "how-it-works", label: "The Process" },
  { id: "features", label: "What We Do" },
  { id: "about", label: "Our Novelty" },
];

export function Footer() {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-rose/20 bg-cola-deep text-ivory">
      <div className="mx-auto max-w-7xl px-6 py-12 md:py-16">
        <div className="grid gap-10 md:grid-cols-12 md:gap-8">
          {/* Brand & Project Summary */}
          <div className="md:col-span-6 lg:col-span-5">
            <a
              href="#home"
              className="inline-flex items-center gap-2.5 text-ivory transition-opacity hover:opacity-90"
              aria-label="NeuroScope 3D Home"
            >
              <Brain className="h-6 w-6 text-rose" strokeWidth={1.75} />
              <span className="text-xl font-bold tracking-tight">
                NeuroScope <span className="text-rose">3D</span>
              </span>
            </a>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-gold/90">
              Unfolding the Unseen
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-mist">
              Exploring brain MRI segmentation, graph-based spatial analysis, and quantitative
              tumour measurements through an interactive research prototype.
            </p>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-3 lg:col-span-4 md:pl-6">
            <h3 className="font-mono text-xs uppercase tracking-widest text-gold">Navigation</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    className="inline-block text-mist transition-colors hover:text-ivory"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Back to Top & Technical Focus */}
          <div className="flex flex-col justify-between md:col-span-3 lg:col-span-3 md:items-end">
            <div>
              <h3 className="font-mono text-xs uppercase tracking-widest text-gold md:text-right">
                Methodology
              </h3>
              <p className="mt-4 text-xs leading-relaxed text-mist/90 md:text-right">
                MONAI 3D U-Net
                <br />
                T1 · T1Gd · T2 · FLAIR
                <br />
                Dijkstra Spatial Graphs
                <br />
                Calibrated Voxel Metrics
              </p>
            </div>

            <button
              type="button"
              onClick={scrollToTop}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-rose/30 bg-cola/80 px-4 py-2 text-xs font-medium text-ivory transition-all hover:border-rose/60 hover:bg-rose/15 md:mt-0"
              aria-label="Scroll back to top of page"
            >
              <span>Back to Top</span>
              <ArrowUp className="h-3.5 w-3.5 text-rose-glow" />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-rose/15 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
            <p className="text-xs leading-relaxed text-mist">
              Research and educational prototype only. Not intended for diagnosis or clinical
              decision-making.
            </p>
            <p className="font-mono text-xs text-mist/80">
              © {currentYear} NeuroScope 3D. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
