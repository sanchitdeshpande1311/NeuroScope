import type { NextConfig } from "next";

// Integrated modules (working copies of the supplied projects, run as their own services; see scripts/start_integrations.ps1).
// Local development defaults apply only to `next dev`; a production build must be given real URLs through the
// environment, so no development address can leak into a deployed site.
const dev = process.env.NODE_ENV !== "production";
const pick = (name: string, devDefault: string) => process.env[name] ?? (dev ? devDefault : "");

// Landing page origin: if an external service is configured (dev default http://localhost:3101),
// proxy to it. "off" disables it. Otherwise, serve the bundled static landing page (/landing.html).
const landingSetting = pick("NEUROSCOPE_LANDING_ORIGIN", "http://localhost:3101");
const externalLanding = (landingSetting && landingSetting !== "off") ? landingSetting.replace(/\/$/, "") : "";
const landingDest = externalLanding ? `${externalLanding}/` : (landingSetting === "off" ? "" : "/landing.html");

const nextConfig: NextConfig = {
  // development-only badge would sit on the chatbot launcher (bottom-right) or the navigation (bottom-left)
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LOCATE_URL: pick("NEXT_PUBLIC_LOCATE_URL", "http://localhost:3104"),
    NEXT_PUBLIC_CHATBOT_URL: pick("NEXT_PUBLIC_CHATBOT_URL", "http://localhost:3102"),
    NEXT_PUBLIC_TRACKER_URL: pick("NEXT_PUBLIC_TRACKER_URL", "http://localhost:3103"),
  },
  async rewrites() {
    if (!landingDest) return [];
    return {
      beforeFiles: [
        { source: "/", missing: [{ type: "query" as const, key: "run" }], destination: landingDest },
        ...(externalLanding ? [
          { source: "/assets/:path*", destination: `${externalLanding}/assets/:path*` },
          { source: "/models/:path*", destination: `${externalLanding}/models/:path*` },
        ] : []),
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
