// Local index of comparisons the user started. Stores only identifiers/labels —
// never image data. Results always come from the backend.
export interface ComparisonRecord {
  id: string;
  previous: { label: string; date: string };
  current: { label: string; date: string };
  createdAt: string;
}

const KEY = "neuroscope.comparisons.v1";

export function listComparisons(): ComparisonRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function saveComparison(r: ComparisonRecord) {
  const all = listComparisons().filter((c) => c.id !== r.id);
  localStorage.setItem(KEY, JSON.stringify([r, ...all]));
}
export function removeComparison(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listComparisons().filter((c) => c.id !== id)));
}
