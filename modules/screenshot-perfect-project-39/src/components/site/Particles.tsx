const DOTS = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37.7) % 100,
  top: (i * 53.3) % 100,
  size: i % 5 === 0 ? 3 : 2,
  delay: (i % 7) * 0.6,
  tone: i % 5 === 0 ? "bg-white" : i % 3 === 0 ? "bg-primary" : "bg-mauve-glow",
}));

export function Particles() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={`absolute rounded-full animate-twinkle ${d.tone}`}
          style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s` }}
        />
      ))}
    </div>
  );
}
