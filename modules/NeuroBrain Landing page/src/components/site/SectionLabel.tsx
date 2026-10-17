export function SectionLabel({ num, text, dark }: { num: string; text: string; dark?: boolean }) {
  return (
    <div
      className={`flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.2em] ${dark ? "text-rose-glow" : "text-rose-deep"}`}
    >
      <span>{num}</span>
      <span className="h-px w-10 bg-current opacity-60" />
      <span>{text}</span>
    </div>
  );
}
