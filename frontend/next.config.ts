import type { NextConfig } from "next";

// Integrated modules (working copies of the supplied projects, run as their own services; see scripts/start_integrations.ps1).
// Local development defaults apply only to `next dev`; a production build must be given real URLs through the
// environment, so no development address can leak into a deployed site.
const dev = process.env.NODE_ENV !== "production";
const pick = (name: string, devDefault: string) => process.env[name] ?? (dev ? devDefault : "");

// Landing page origin: the public root "/" is served from it (its HTML references /assets/* and /models/*).
// "off" disables it (start.ps1 -NoIntegrations): "/" then redirects to the workspace.
const landingSetting = pick("NEUROSCOPE_LANDING_ORIGIN", "http://localhost:3101");
const landing = landingSetting === "off" ? "" : landingSetting.replace(/\/$/, "");

const nextConfig: NextConfig = {
  // development-only badge would sit on the chatbot launcher (bottom-right) or the navigation (bottom-left)
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LOCATE_URL: pick("NEXT_PUBLIC_LOCATE_URL", "http://localhost:3104"),
    NEXT_PUBLIC_CHATBOT_URL: pick("NEXT_PUBLIC_CHATBOT_URL", "http://localhost:3102"),
    NEXT_PUBLIC_TRACKER_URL: pick("NEXT_PUBLIC_TRACKER_URL", "http://localhost:3103"),
  },
  async rewrites() {
    if (!landing) return [];   // no landing service configured: "/" redirects to the workspace (src/app/page.tsx)
    return {
      beforeFiles: [
        // old "/?run=<id>" case links still open the case (src/app/page.tsx), not the landing page
        { source: "/", missing: [{ type: "query", key: "run" }], destination: `${landing}/` },
        { source: "/assets/:path*", destination: `${landing}/assets/:path*` },
        { source: "/models/:path*", destination: `${landing}/models/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
