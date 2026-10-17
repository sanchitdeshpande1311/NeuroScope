import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { HeroSection } from "@/components/site/HeroSection";
import { ProcessSection } from "@/components/site/ProcessSection";
import { FeaturesSection } from "@/components/site/FeaturesSection";
import { NoveltySection } from "@/components/site/NoveltySection";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroScope 3D — Unfolding the Unseen" },
      {
        name: "description",
        content:
          "Interactive 3D brain MRI visualization and tumor-region segmentation research prototype.",
      },
      { property: "og:title", content: "NeuroScope 3D — Unfolding the Unseen" },
      {
        property: "og:description",
        content: "Explore MRI sequences and predicted WT, TC and ET tumor regions in 3D.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <ProcessSection />
      <FeaturesSection />
      <NoveltySection />
      <Footer />
    </main>
  );
}
