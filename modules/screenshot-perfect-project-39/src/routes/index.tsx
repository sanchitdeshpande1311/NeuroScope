import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { HeroSection } from "@/components/site/HeroSection";
import { ProcessSection } from "@/components/site/ProcessSection";
import { FeaturesSection } from "@/components/site/FeaturesSection";
import { NoveltySection } from "@/components/site/NoveltySection";
import { Sparkles, MessageSquare } from "lucide-react";
import { newId } from "@/lib/threads";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroScope 3D — Unfolding the Unseen" },
      {
        name: "description",
        content: "Interactive 3D brain MRI visualization, AI-powered segmentation, and research prototype.",
      },
      { property: "og:title", content: "NeuroScope 3D — Unfolding the Unseen" },
      { property: "og:description", content: "Explore MRI sequences and predicted WT, TC, and ET tumor regions in 3D." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const defaultThread = newId();

  return (
    <main className="relative min-h-screen bg-canvas text-ink selection:bg-primary selection:text-white">
      {/* Sticky top Navigation Bar */}
      <Navbar />

      {/* 01 Hero Section: 3D Crystal Cortex + "Pollution is Spatial" Editorial Header */}
      <HeroSection />

      {/* 02 The Process: Curved wave transition into Alabaster Cream + 4 Stages */}
      <ProcessSection />

      {/* 03 What We Do: Curved wave into Smoky Dusk Umber + 3-Card Interactive Carousel */}
      <FeaturesSection />

      {/* 04 Our Novelty: Curved wave into Cream + Novelty Carousel + Research Disclaimer */}
      <NoveltySection />

      {/* Floating Quick Action: AI Assistant Pill */}
      <Link
        to="/chat/$threadId"
        params={{ threadId: defaultThread }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full border border-primary/50 bg-canvas-card/95 px-4 py-2.5 text-xs font-semibold text-primary shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:border-primary hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Open NeuroScope AI Assistant"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Ask AI Assistant</span>
      </Link>
    </main>
  );
}
