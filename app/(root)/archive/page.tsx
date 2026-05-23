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
        <span className="mx-4 text-xs font-medium text-gray-500 tracking-wider uppercase">System Processes</span>
        <div className="flex-1 border-t border-gray-800/50"></div>
      </div>

      {/* Lower section: Transient data (Active/Recent AI Jobs) */}
      <JobsSection />
    </div>
  );
}
