import { useState, type ReactNode, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export interface CarouselItem {
  key: string;
  label: string;
  render: (active: boolean) => ReactNode;
}

/** Exactly three cards on a shallow curved track; the centre one is active. */
export function ThreeCardCarousel({
  items,
  tone,
  initial = 1,
  cardHeightClassName = "h-[300px] sm:h-[340px]",
}: {
  items: [CarouselItem, CarouselItem, CarouselItem];
  tone: "dark" | "light";
  initial?: 0 | 1 | 2;
  cardHeightClassName?: string;
}) {
  const [active, setActive] = useState<number>(initial);
  const go = (d: number) => setActive((a) => (a + d + 3) % 3);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  };

  const arrow =
    tone === "dark"
      ? "border-rose-glow/60 text-ivory hover:bg-rose/20"
      : "border-rose/50 text-rose-deep hover:bg-rose/10 bg-ivory/60";

  return (
    <div className="relative" onKeyDown={onKey}>
      <div className="relative mx-auto flex items-center gap-2 sm:gap-4">
        <button
          aria-label="Previous card"
          onClick={() => go(-1)}
          className={`z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors ${arrow}`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className={`relative flex-1 ${cardHeightClassName}`}
          role="group"
          aria-roledescription="carousel"
        >
          {items.map((it, i) => {
            const pos = (i - active + 3) % 3; // 0 centre, 1 right, 2 left
            const x = pos === 0 ? "0%" : pos === 1 ? "105%" : "-105%";
            const isActive = pos === 0;
            return (
              <button
                key={it.key}
                onClick={() => setActive(i)}
                aria-label={`Show ${it.label}`}
                aria-current={isActive}
                className="absolute left-1/2 top-0 h-full w-[78%] cursor-pointer text-left transition-all duration-700 ease-premium sm:w-[32%]"
                style={{
                  transform: `translateX(-50%) translateX(${x}) translateY(${isActive ? "0px" : "14px"}) scale(${isActive ? 1.06 : 0.92})`,
                  zIndex: isActive ? 10 : 5,
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                <div
                  className={`group relative h-full overflow-hidden rounded-2xl border transition-all duration-700 hover:-translate-y-1 ${tone === "dark" ? "bg-cola-light/60" : "bg-cola"} ${isActive ? "border-rose-glow shadow-glow" : "border-rose/25 shadow-soft"}`}
                >
                  <span className="absolute left-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-rose-deep text-xs font-semibold text-ivory">
                    {i + 1}
                  </span>
                  {it.render(isActive)}
                </div>
              </button>
            );
          })}
        </div>
        <button
          aria-label="Next card"
          onClick={() => go(1)}
          className={`z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-colors ${arrow}`}
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-10 flex items-center justify-center gap-3">
        {items.map((it, i) => (
          <div key={it.key} className="flex items-center gap-3">
            {i > 0 && <span className="h-px w-8 bg-rose/40" />}
            <button
              onClick={() => setActive(i)}
              aria-label={`Go to card ${i + 1}`}
              aria-current={active === i}
              className={`grid h-9 w-9 place-items-center rounded-full text-xs font-medium transition-all duration-500 ${
                active === i
                  ? tone === "dark"
                    ? "border border-rose-glow text-ivory shadow-glow"
                    : "bg-rose-deep text-ivory shadow-glow"
                  : tone === "dark"
                    ? "text-mist"
                    : "text-dusk"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
