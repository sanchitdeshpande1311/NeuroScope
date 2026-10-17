import { useEffect, useState } from "react";
import { Brain, Menu, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";

const LINKS = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "about", label: "About" },
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
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#3d2325]/85 backdrop-blur-md shadow-sm">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#home" className="flex items-center gap-2.5 text-white">
          <div className="relative grid h-8 w-8 place-items-center rounded-lg border border-primary/50 bg-primary/20 shadow-crimson">
            <Brain className="h-5 w-5 text-primary" strokeWidth={1.6} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white font-serif">
            NeuroScope <span className="text-primary font-sans font-bold">3D</span>
          </span>
        </a>
        <div className="hidden items-center gap-8 md:flex">
          <ul className="flex gap-9">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  className={`relative text-sm font-medium transition-colors ${active === l.id ? "text-white font-semibold" : "text-[#d1beb4] hover:text-white"}`}
                >
                  {l.label}
                  <span
                    className={`absolute -bottom-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--crimson)] transition-opacity duration-500 ${active === l.id ? "opacity-100" : "opacity-0"}`}
                  />
                </a>
              </li>
            ))}
          </ul>
          <Link
            to="/chat/$threadId"
            params={{ threadId: "default" }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/50 bg-primary/20 hover:bg-primary/30 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:border-primary shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>AI Assistant</span>
          </Link>
        </div>
        <button
          className="text-white md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </nav>
      {open && (
        <ul className="border-t border-white/10 bg-[#3d2325] px-6 py-4 md:hidden shadow-lg">
          {LINKS.map((l) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                onClick={() => setOpen(false)}
                className={`block py-2 ${active === l.id ? "text-primary font-semibold" : "text-white"}`}
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
