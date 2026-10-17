import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

export interface Thread {
  id: string;
  title: string;
  updatedAt: number;
  messages: UIMessage[];
}

const KEY = "neuroscope.threads.v1";
const PREF_KEY = "neuroscope.prefs.v1";
let cache: Thread[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: Thread[] = [];

function read(): Thread[] {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    cache = [];
  }
  return cache!;
}
function write(next: Thread[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota — ignore */
  }
  listeners.forEach((l) => l());
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const threadStore = {
  all: read,
  get: (id: string) => read().find((t) => t.id === id),
  ensure(id: string) {
    if (!read().some((t) => t.id === id))
      write([{ id, title: "New conversation", updatedAt: Date.now(), messages: [] }, ...read()]);
  },
  saveMessages(id: string, messages: UIMessage[]) {
    // Persist only text parts — never files or binary data.
    const clean = messages.map((m) => ({
      ...m,
      parts: m.parts.filter((p) => p.type === "text"),
    })) as UIMessage[];
    const firstUser = clean.find((m) => m.role === "user");
    const firstText = firstUser?.parts.find((p) => p.type === "text") as { text: string } | undefined;
    write(
      read().map((t) =>
        t.id === id
          ? {
              ...t,
              messages: clean,
              updatedAt: Date.now(),
              title: t.title === "New conversation" && firstText ? firstText.text.slice(0, 48) : t.title,
            }
          : t,
      ),
    );
  },
  remove: (id: string) => write(read().filter((t) => t.id !== id)),
  clear: () => write([]),
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useThreads() {
  return useSyncExternalStore(threadStore.subscribe, read, () => EMPTY);
}

export interface Prefs {
  lang: "en-IN" | "hi-IN" | "en-US";
  autoSpeak: boolean;
}
export const loadPrefs = (): Prefs => {
  try {
    return { lang: "en-US", autoSpeak: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
  } catch {
    return { lang: "en-US", autoSpeak: false };
  }
};
export const savePrefs = (p: Prefs) => localStorage.setItem(PREF_KEY, JSON.stringify(p));
