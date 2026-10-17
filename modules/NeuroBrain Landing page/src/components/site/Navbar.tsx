import { useEffect, useState } from "react";
import { Brain, Menu, X } from "lucide-react";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "how-it-works", label: "The Process" },
  { id: "features", label: "What We Do" },
  { id: "about", label: "Our Novelty" },
];

export function Navbar() {
  const [active, setActive] = useState("home");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-rose/15 bg-cola-deep/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#home" className="flex items-center gap-2 text-ivory">
          <Brain className="h-7 w-7 text-rose" strokeWidth={1.5} />
          <span className="text-lg font-semibold">
            NeuroScope <span className="text-rose">3D</span>
          </span>
        </a>
        <ul className="hidden gap-10 md:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                className={`relative text-sm transition-colors ${active === l.id ? "text-ivory" : "text-mist hover:text-ivory"}`}
              >
                {l.label}
                <span
                  className={`absolute -bottom-2 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-rose transition-opacity duration-500 ${active === l.id ? "opacity-100" : "opacity-0"}`}
                />
              </a>
            </li>
          ))}
        </ul>
        <button
          className="text-ivory md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <ul className="border-t border-rose/15 bg-cola-deep px-6 py-4 md:hidden">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                onClick={() => setOpen(false)}
                className={`block py-2 ${active === l.id ? "text-rose" : "text-ivory"}`}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
