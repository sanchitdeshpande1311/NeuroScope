// Tiny external store for the viewer crosshair readout: only components that display the cursor re-render.
import { useSyncExternalStore } from 'react';
import type { CursorInfo } from '@/components/NiiVueViewer';

let current: CursorInfo | null = null;
const listeners = new Set<() => void>();

export function setCursor(c: CursorInfo | null) {
  current = c;
  listeners.forEach((l) => l());
}
export function getCursor() { return current; }
export function useCursor() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => null);
}
