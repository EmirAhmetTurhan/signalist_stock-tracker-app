'use client';

import NotebookSection from '@/components/archive/NotebookSection';
import JobsSection from '@/components/archive/JobsSection';

export default function ArchivePage() {
  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6">
      {/* Upper section: The main persistent data (Reports & Notes) */}
      <NotebookSection />

      {/* Separator / title for the bottom section */}
      <div className="my-8 flex items-center">
        <div className="flex-1 border-t border-gray-800/50"></div>
        <div className="mx-4 flex items-center gap-2 text-xs font-medium text-gray-500 tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          Live Processes
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        </div>
        <div className="flex-1 border-t border-gray-800/50"></div>
      </div>

      {/* Lower section: Transient data (Active Jobs & Discovery Tasks) */}
      <JobsSection />
    </div>
  );
}
