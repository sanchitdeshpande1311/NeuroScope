"use client";

// Full-screen 3D viewer: the same persistent case viewer, with the left panel hidden (workspace.full).
import { createPortal } from 'react-dom';
import Link from 'next/link';
import React from 'react';
import { Expand, Minimize2 } from 'lucide-react';
import { DEFAULT_VIEWER, useRun, useViewerConfig, useWorkspace } from '@/components/RunContext';

export default function FullViewer() {
  const { id } = useRun();
  const { stageSlot } = useWorkspace();
  useViewerConfig(DEFAULT_VIEWER);
  const toggleNative = () => {
    const stage = document.querySelector('[data-testid=stage]') as HTMLElement | null;
    if (document.fullscreenElement) document.exitFullscreen(); else stage?.requestFullscreen?.();
  };
  return stageSlot ? createPortal(
    <div className="stage-tr" data-testid="full-viewer">
      <button type="button" className="btn btn-dark btn-sm" onClick={toggleNative} title="Browser full screen (Esc to leave)"><Expand size={14} /> Browser full screen</button>
      <Link className="btn btn-dark btn-sm" href={`/runs/${id}`} data-testid="back-results"><Minimize2 size={14} /> Exit full screen</Link>
    </div>, stageSlot) : null;
}
