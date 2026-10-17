import { useSyncExternalStore } from "react";
import { sanitizeCaseContext, type CaseContext } from "./case-context";

// In-memory only: case context is never persisted to chat history.
let current: CaseContext | null = null;
const ls = new Set<() => void>();

export const caseStore = {
  get: () => current,
  set(input: unknown) {
    current = input == null ? null : sanitizeCaseContext(input);
    ls.forEach((l) => l());
  },
  subscribe(l: () => void) {
    ls.add(l);
    return () => ls.delete(l);
  },
};

export const useCaseContext = () => useSyncExternalStore(caseStore.subscribe, caseStore.get, () => null);

export function installCaseBridge() {
  if (typeof window === "undefined") return;
  (window as unknown as { NeuroScopeAssistant: unknown }).NeuroScopeAssistant = {
    setCase: (c: unknown) => caseStore.set(c),
    clearCase: () => caseStore.set(null),
  };
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin && e.source !== window.parent) return;
    const d = e.data as { type?: string; payload?: unknown };
    if (d?.type === "neuroscope:case") caseStore.set(d.payload ?? null);
  });
}
