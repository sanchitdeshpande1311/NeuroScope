"use client";

// Tracker: the supplied longitudinal comparison tool (tumor-tracker-nifti.zip), opened from the feature navigation.
import ModuleFrame from '@/components/ModuleFrame';

export default function TrackerPage() {
  return (
    <ModuleFrame k="tracker" title="Tracker">
      <p className="card-hint">Compare two MRI studies of the same patient over time. Upload the studies inside the Tracker; it uses its own segmentation model and registration service.</p>
      <p className="card-hint" style={{ marginTop: 8 }}>Nothing from the current NeuroScope case is sent to the Tracker automatically.</p>
    </ModuleFrame>
  );
}
