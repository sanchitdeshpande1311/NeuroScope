// Integrated modules: each is the supplied project, run as its own service and shown inside the workspace.
// URLs come from next.config.ts (environment variables; development defaults only under `next dev`).
export const MODULES = {
  locate: {
    name: 'Locate',
    url: process.env.NEXT_PUBLIC_LOCATE_URL ?? '',
    entry: '/nearby-neurologists',        // the module's own search route
    env: 'NEXT_PUBLIC_LOCATE_URL',
    start: 'Locate web (Vite, port 3104) and its API (Express, port 5001)',
  },
  chatbot: {
    name: 'NeuroScope AI Assistant',
    url: process.env.NEXT_PUBLIC_CHATBOT_URL ?? '',
    entry: '/chat/',                       // + thread id
    env: 'NEXT_PUBLIC_CHATBOT_URL',
    start: 'the chatbot service (port 3102)',
  },
  tracker: {
    name: 'Tumor Tracker',
    url: process.env.NEXT_PUBLIC_TRACKER_URL ?? '',
    entry: '/new',                         // the module's "New Comparison" tool (its own nav reaches Home and Timeline)
    env: 'NEXT_PUBLIC_TRACKER_URL',
    start: 'Tracker web (port 3103) and its API (FastAPI, port 8008)',
  },
} as const;
export type ModuleKey = keyof typeof MODULES;

export const moduleUrl = (k: ModuleKey, path: string = MODULES[k].entry) =>
  MODULES[k].url ? `${MODULES[k].url.replace(/\/$/, '')}${path}` : '';

/** Is the module's service reachable? (an opaque no-cors request: resolves when anything answers) */
export async function probe(k: ModuleKey, timeoutMs = 4000): Promise<boolean> {
  const url = moduleUrl(k, '/');
  if (!url) return false;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
