'use client';

import React from 'react';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

interface ThinkingSkeletonProps {
  steps: Array<{ name: string; status: 'pending' | 'running' | 'completed' | 'failed'; detail?: string }>;
}

export function ThinkingSkeleton({ steps }: ThinkingSkeletonProps) {
  // Determine the current step to display
  let currentText = "Yapay zeka düşünüyor...";
  let detailText = "";
  
  if (steps && steps.length > 0) {
    // Get the last step
    const lastStep = steps[steps.length - 1];
    currentText = lastStep.name;
    if (lastStep.detail) {
      detailText = lastStep.detail;
    }
  }

  return (
    <div className="flex flex-col gap-1 w-fit transition-all duration-500 ease-in-out opacity-80 hover:opacity-100">
      <div className="flex items-center gap-3 text-sm text-gray-400 animate-pulse bg-gray-800/40 px-4 py-2.5 rounded-full border border-gray-700/50">
        <Loader2 className="w-4 h-4 animate-spin text-yellow-500/70" />
        <span className="font-medium tracking-wide">{currentText}</span>
      </div>
      {detailText && (
        <span className="text-xs text-gray-500 pl-11 animate-pulse">{detailText}</span>
      )}
    </div>
  );
}
