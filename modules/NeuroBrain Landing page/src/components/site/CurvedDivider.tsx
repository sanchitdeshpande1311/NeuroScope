/** Organic wave at the bottom of a section, filled with the next section's colour and edged with a rose glow. */
export function CurvedDivider({ to, variant = 0 }: { to: "cream" | "cola"; variant?: 0 | 1 | 2 }) {
  const paths = [
    "M0,90 C260,10 520,140 820,70 C1060,20 1260,40 1440,95 L1440,200 L0,200 Z",
    "M0,60 C300,140 620,20 900,80 C1140,130 1300,60 1440,40 L1440,200 L0,200 Z",
    "M0,100 C220,40 480,30 760,90 C1020,145 1260,90 1440,50 L1440,200 L0,200 Z",
  ];
  const d = paths[variant]!;
  const edge = d.replace(/ L1440,200 L0,200 Z$/, "");
  const fill = to === "cream" ? "var(--cream)" : "var(--cola)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 md:h-36">
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <filter id={`glow-${variant}-${to}`} x="-10%" y="-200%" width="120%" height="500%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <path
          d={edge}
          fill="none"
          stroke="var(--rose)"
          strokeWidth="28"
          opacity="0.55"
          filter={`url(#glow-${variant}-${to})`}
        />
        <path d={d} fill={fill} />
        <path d={edge} fill="none" stroke="var(--rose-glow)" strokeWidth="2" opacity="0.9" />
      </svg>
    </div>
  );
}
