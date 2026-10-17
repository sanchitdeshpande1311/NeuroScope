import { Brain } from 'lucide-react';

/** The NeuroScope 3D brain mark: the header brand and the AI assistant launcher use this same symbol. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return <span className="brand-mark"><Brain size={size} strokeWidth={1.8} /></span>;
}
