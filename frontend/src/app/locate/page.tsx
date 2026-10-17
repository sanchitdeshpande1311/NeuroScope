"use client";

// Locate: the supplied "Nearby Neurologists" module (location.zip), opened from the header.
import ModuleFrame from '@/components/ModuleFrame';

export default function LocatePage() {
  return (
    <ModuleFrame k="locate" title="Locate" allow="geolocation">
      <p className="card-hint">Find neurologists and neuro-oncology services near you, using live OpenStreetMap data. Your location is used only if you allow it in the browser; no case data is shared with this tool.</p>
    </ModuleFrame>
  );
}
