"use client";

import * as React from "react";

/*
 * Polaroid Line Carousel — scientific research plates pegged to a suspended string.
 * Drag the line (or use the arrows) and the plates slide along it, swinging on their
 * pegs with spring physics and settling back with smooth damping.
 */

export type Slide = {
  image?: string;
  title?: string;
  caption?: string;
  alt?: string;
  content?: React.ReactNode;
};

export type PolaroidLineCarouselProps = {
  slides?: Slide[];
  /** Any CSS length. Default 520px. */
  height?: number | string;
  /** Width of a print in px (it shrinks on narrow screens). */
  cardWidth?: number;
  /** How far the string sags in the middle, px. */
  sag?: number;
  /** How much the prints swing; 0 holds them still. */
  swing?: number;
  /** ms per print; 0 turns autoplay off. It waits while someone is interacting. */
  autoplay?: number;
  /** Colour of the string and pegs. */
  string?: string;
  background?: string;
  ink?: string;
  /** Initial active index (e.g. 1 for center card). */
  initialIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
};

// #region logic
export function wrap(i: number, n: number): number {
  return n ? ((i % n) + n) % n : 0;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

/** Height of a string sagging by `sag` between (0, y0) and (w, y0), at x. */
export function stringY(x: number, w: number, y0: number, sag: number): number {
  const t = clamp(x / w, 0, 1);
  return y0 + 4 * sag * t * (1 - t);
}

/** One step of a critically damped spring toward target. */
export function springStep(
  x: number,
  v: number,
  target: number,
  dt: number,
  k = 70,
): [number, number] {
  const c = 2 * Math.sqrt(k);
  const nv = v + (k * (target - x) - c * v) * dt;
  return [x + nv * dt, nv];
}

/** One step of a print's swing. */
export function swingStep(
  a: number,
  w: number,
  lineVel: number,
  dt: number,
  gain: number,
): [number, number] {
  const nw = w + (-38 * a - 4.2 * w + lineVel * 0.0034 * gain) * dt;
  return [clamp(a + nw * dt, -0.6, 0.6), nw];
}

/** Index of the print nearest the centre for a line offset. */
export function nearestAt(off: number, spacing: number, n: number): number {
  return clamp(Math.round(off / spacing), 0, Math.max(0, n - 1));
}

export function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}
// #endregion logic

const PL_CSS = [
  ".pl-root{position:relative;width:100%;overflow:hidden;background:var(--pl-bg);color:var(--pl-ink);user-select:none;-webkit-user-select:none;touch-action:pan-y;outline:none;cursor:grab;border-radius:1.5rem}",
  ".pl-root[data-drag='1']{cursor:grabbing}",
  ".pl-root:focus-visible{box-shadow:inset 0 0 0 2px var(--pl-ink)}",
  ".pl-string{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}",
  ".pl-card{position:absolute;left:0;top:0;width:var(--pl-cw);transform-origin:50% 0;will-change:transform;cursor:inherit}",
  ".pl-print{margin-top:12px;background:#fcfaf6;padding:12px 12px 0;border-radius:12px;border:1px solid rgba(190,40,75,.15);box-shadow:0 4px 12px rgba(33,10,18,.08),0 22px 36px -18px rgba(33,10,18,.22);transition:transform .5s cubic-bezier(.2,.7,.2,1),filter .5s ease,box-shadow .5s ease}",
  ".pl-card[data-on='0'] .pl-print{transform:scale(.9);filter:saturate(.7) brightness(.96);opacity:.85}",
  ".pl-card[data-on='1'] .pl-print{transform:scale(1.02);box-shadow:0 8px 24px rgba(190,40,75,.18),0 28px 48px -18px rgba(33,10,18,.3)}",
  ".pl-shot{position:relative;aspect-ratio:1.15;overflow:hidden;background:#1c060e;border-radius:8px}",
  ".pl-shot img{position:absolute;inset:0;width:100%;height:100%;max-width:none;object-fit:cover;display:block;pointer-events:none}",
  ".pl-note{min-height:46px;display:flex;align-items:center;justify-content:center;padding:6px 8px;font:600 14px/1.2 'Manrope',ui-sans-serif,sans-serif;color:#240a12;text-align:center}",
  ".pl-peg{position:absolute;left:50%;top:0;width:12px;height:28px;margin-left:-6px;border-radius:3px;background:linear-gradient(90deg,#d4a5b2,#f0d3dc 45%,#b87f8f);box-shadow:0 2px 4px rgba(33,10,18,.35)}",
  ".pl-peg::after{content:'';position:absolute;left:4.5px;top:8px;width:3px;height:8px;background:rgba(80,20,40,.5);border-radius:1.5px}",
  ".pl-bar{position:absolute;left:clamp(16px,4vw,56px);right:clamp(16px,4vw,56px);bottom:clamp(16px,3vh,32px);display:flex;align-items:center;gap:clamp(12px,2vw,24px);cursor:default}",
  ".pl-cap{flex:1;min-width:0;overflow:hidden;padding-bottom:.15em}",
  ".pl-cap>*{display:block;animation:pl-in .55s cubic-bezier(.2,.8,.2,1) both}",
  ".pl-title{font:700 clamp(18px,2.2vw,26px)/1.15 'Manrope',ui-sans-serif,sans-serif;color:var(--pl-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".pl-sub{margin-top:4px;font:500 13px/1.4 'Manrope',ui-sans-serif,sans-serif;color:var(--pl-muted)}",
  ".pl-count{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:var(--pl-muted)}",
  ".pl-count b{color:var(--pl-ink);font-weight:700}",
  ".pl-btn{appearance:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--pl-line);background:#fcfaf6;color:inherit;display:grid;place-items:center;cursor:pointer;transition:background .2s ease,color .2s ease,border-color .2s ease;box-shadow:0 2px 8px rgba(33,10,18,.08)}",
  ".pl-btn:hover{background:var(--pl-ink);color:#fcfaf6;border-color:var(--pl-ink)}",
  ".pl-btn:focus-visible{outline:2px solid var(--pl-ink);outline-offset:2px}",
  ".pl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
  "@keyframes pl-in{from{transform:translateY(100%);opacity:0}to{transform:none;opacity:1}}",
  "@media (prefers-reduced-motion:reduce){.pl-cap>*{animation:none}.pl-print{transition:none}}",
].join("\n");

export default function PolaroidLineCarousel({
  slides = [],
  height = "560px",
  cardWidth = 330,
  sag = 42,
  swing = 1,
  autoplay = 5000,
  string = "oklch(0.69 0.16 10 / 45%)",
  background = "transparent",
  ink = "var(--color-ink, #210a10)",
  initialIndex = 1,
  onChange,
  className,
  style,
  ariaLabel = "Scientific plates carousel",
}: PolaroidLineCarouselProps) {
  const n = slides.length;
  const initial = clamp(initialIndex, 0, Math.max(0, n - 1));
  const [active, setActive] = React.useState(initial);
  const [dragging, setDragging] = React.useState(false);
  const [size, setSize] = React.useState({ w: 1200, h: 560, cw: cardWidth });
  const rootRef = React.useRef(null as HTMLDivElement | null);
  const pathRef = React.useRef(null as SVGPathElement | null);
  const cards = React.useRef([] as (HTMLDivElement | null)[]);
  const initialOffset = initial * (cardWidth * 1.15);
  const sim = React.useRef({
    off: initialOffset,
    vel: 0,
    target: initialOffset,
    a: [] as number[],
    w: [] as number[],
  });
  const drag = React.useRef(
    null as null | { x: number; off: number; lx: number; lt: number; v: number; moved: boolean },
  );
  const lastTouch = React.useRef(0);
  const activeRef = React.useRef(initial);
  const opts = React.useRef({ sag, swing });
  opts.current = { sag, swing };

  const spacing = size.cw * 1.15;
  const goTo = React.useCallback(
    (i: number) => {
      sim.current.target = clamp(i, 0, n - 1) * spacing;
    },
    [n, spacing],
  );

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const cw = Math.round(Math.max(220, Math.min(cardWidth, r.width * 0.44, r.height * 0.58)));
      setSize({ w: r.width, h: r.height, cw });
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [cardWidth]);

  // keep the target on the active print when the spacing changes
  React.useEffect(() => {
    sim.current.target = activeRef.current * spacing;
    sim.current.off = activeRef.current * spacing;
  }, [spacing]);

  React.useEffect(() => {
    onChange?.(active);
  }, [active, onChange]);

  // the simulation, written straight to the DOM each frame
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let raf = 0;
    let prev = performance.now();
    const S = sim.current;
    const frame = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.033, (now - prev) / 1000);
      prev = now;
      const { w, h, cw } = size;
      const y0 = Math.max(35, h * 0.16);
      const d = drag.current;
      let lineVel: number;
      if (d && d.moved) {
        lineVel = d.v * 1000;
      } else {
        const before = S.off;
        [S.off, S.vel] = springStep(S.off, S.vel, S.target, dt);
        lineVel = -(S.off - before) / Math.max(dt, 1e-3);
      }
      const o = opts.current;
      const g = reduce ? 0 : o.swing;
      const near = nearestAt(S.off, spacing, n);
      for (let i = 0; i < n; i++) {
        const el = cards.current[i];
        if (!el) continue;
        const x = w / 2 + i * spacing - S.off;
        if (x < -cw * 1.5 || x > w + cw * 1.5) {
          el.style.visibility = "hidden";
          continue;
        }
        el.style.visibility = "visible";
        let a = S.a[i] || 0;
        let av = S.w[i] || 0;
        [a, av] = swingStep(a, av, lineVel, dt, g);
        if (g) a += Math.sin(now / 1300 + i * 1.7) * 0.0009 * g;
        S.a[i] = a;
        S.w[i] = av;
        const y = stringY(x, w, y0, o.sag) - 6;
        el.style.transform =
          "translate(" +
          (x - cw / 2).toFixed(1) +
          "px," +
          y.toFixed(1) +
          "px) rotate(" +
          a.toFixed(4) +
          "rad)";
        el.style.zIndex = String(i === near ? n + 2 : n - Math.abs(i - near));
      }
      pathRef.current?.setAttribute(
        "d",
        "M0 " + y0 + " Q" + w / 2 + " " + (y0 + 2 * o.sag) + " " + w + " " + y0,
      );
      if (near !== activeRef.current) {
        activeRef.current = near;
        setActive(near);
      }
      raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        prev = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(root);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [size, spacing, n]);

  // autoplay, back to the first print after the last
  React.useEffect(() => {
    if (!autoplay || n < 2) return;
    const t = window.setInterval(() => {
      if (document.hidden || drag.current || performance.now() - lastTouch.current < autoplay)
        return;
      goTo(activeRef.current >= n - 1 ? 0 : activeRef.current + 1);
    }, autoplay);
    return () => window.clearInterval(t);
  }, [autoplay, n, goTo]);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".pl-bar")) return;
    lastTouch.current = performance.now();
    drag.current = {
      x: e.clientX,
      off: sim.current.off,
      lx: e.clientX,
      lt: e.timeStamp,
      v: 0,
      moved: false,
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true;
      setDragging(true);
      rootRef.current?.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const dt = Math.max(1, e.timeStamp - d.lt);
    d.v = 0.7 * ((e.clientX - d.lx) / dt) + 0.3 * d.v;
    d.lx = e.clientX;
    d.lt = e.timeStamp;
    const max = (n - 1) * spacing;
    let off = d.off - dx;
    if (off < 0) off *= 0.35;
    if (off > max) off = max + (off - max) * 0.35;
    sim.current.off = off;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    lastTouch.current = performance.now();
    if (!d) return;
    if (d.moved) {
      setDragging(false);
      sim.current.vel = -d.v * 1000;
      goTo(nearestAt(sim.current.off - d.v * 180, spacing, n));
      return;
    }
    const card = (e.target as HTMLElement).closest("[data-i]");
    if (card) goTo(Number(card.getAttribute("data-i")));
  };
  const step = (dir: number) => {
    lastTouch.current = performance.now();
    goTo(clamp(activeRef.current + dir, 0, n - 1));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else return;
    e.preventDefault();
  };

  const s = slides[active] || {};

  return (
    <div
      ref={rootRef}
      className={["pl-root", className].filter(Boolean).join(" ")}
      style={{
        height,
        ["--pl-bg" as string]: background,
        ["--pl-ink" as string]: ink,
        ["--pl-muted" as string]: "color-mix(in srgb, var(--pl-ink) 65%, transparent)",
        ["--pl-line" as string]: "color-mix(in srgb, var(--pl-ink) 20%, transparent)",
        ["--pl-cw" as string]: size.cw + "px",
        ...style,
      }}
      data-drag={dragging ? "1" : "0"}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{PL_CSS}</style>
      <svg className="pl-string" aria-hidden="true">
        <path ref={pathRef} fill="none" stroke={string} strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      {slides.map((sl, i) => (
        <div
          key={i}
          className="pl-card"
          data-i={i}
          data-on={i === active ? "1" : "0"}
          ref={(el) => void (cards.current[i] = el)}
          aria-hidden={i === active ? undefined : true}
        >
          <div className="pl-print">
            <div className="pl-shot">
              {sl.content ? (
                sl.content
              ) : sl.image ? (
                <img src={sl.image} alt={sl.alt || sl.title || ""} draggable={false} />
              ) : null}
            </div>
            <div className="pl-note">{sl.title || ""}</div>
          </div>
          <div className="pl-peg" />
        </div>
      ))}
      <div className="pl-bar">
        <div className="pl-cap" key={active} aria-hidden="true">
          {s.title ? <span className="pl-title">{s.title}</span> : null}
          {s.caption ? <span className="pl-sub">{s.caption}</span> : null}
        </div>
        <span className="pl-count" aria-hidden="true">
          <b>{pad2(active + 1)}</b> / {pad2(n)}
        </span>
        <button type="button" className="pl-btn" aria-label="Previous" onClick={() => step(-1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button type="button" className="pl-btn" aria-label="Next" onClick={() => step(1)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <div className="pl-sr" aria-live="polite">
        {"Print " + (active + 1) + " of " + n + (s.title ? ": " + s.title : "")}
      </div>
    </div>
  );
}
