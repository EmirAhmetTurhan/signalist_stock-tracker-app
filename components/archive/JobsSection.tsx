'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, Sparkles } from 'lucide-react';
import JobItem from '@/components/jobs/JobItem';
import { getAllJobs, deleteJob } from '@/lib/actions/ai-job.actions';

export default function JobsSection() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getAllJobs();
      if (res.success && res.jobs) {
        setJobs(res.jobs);
        // Notify notebook section to sync archive reports list
        window.dispatchEvent(new CustomEvent('signalist-archive-refresh'));
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();

    // Refresh automatically every 15 seconds if there are running jobs
    const interval = setInterval(() => {
      setJobs(currentJobs => {
        const hasRunning = currentJobs.some(j => j.status === 'running' || j.status === 'queued');
        if (hasRunning) {
          fetchJobs(true);
        }
        return currentJobs;
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchJobs]);

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteJob(id);
      if (res.success) {
        setJobs(jobs.filter(j => j._id !== id));
        // Notify notebook section to sync archive reports list
        window.dispatchEvent(new CustomEvent('signalist-archive-refresh'));
      }
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  };

  // Separate jobs into categories
  const discoveryJobs = jobs.filter(j => j.type === 'deep_discovery');
  const aiJobs = jobs.filter(j => j.type !== 'deep_discovery');
  const hasAnyRunning = jobs.some(j => j.status === 'running' || j.status === 'queued');

  // Render a job list section with a header
  const renderJobSection = (
    title: string,
    icon: React.ReactNode,
    accentColor: string,
    filteredJobs: any[]
  ) => {
    if (filteredJobs.length === 0) return null;

    return (
      <div className="mb-6 last:mb-0">
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: accentColor }}>
            {title}
          </h3>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
          >
            {filteredJobs.length}
          </span>
        </div>
        <div className="space-y-3">
          {filteredJobs.map(job => (
            <JobItem key={job._id} job={job} onDelete={handleDelete} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-gray-900/10 border border-gray-800/40 rounded-2xl p-6">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 border-b border-gray-800/50 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            System Processes
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Track background analysis tasks and strategy discovery jobs.
          </p>
        </div>

        <button
          onClick={() => fetchJobs(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 rounded-lg text-xs text-gray-300 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading && !refreshing ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 bg-black/20 border border-gray-800/30 rounded-xl">
          <Activity className="w-8 h-8 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No active system processes at the moment.</p>
        </div>
      ) : (
        <>
          {/* 🔬 Strategy Discovery Section */}
          {renderJobSection(
            'Strategy Discovery',
            <Sparkles className="w-4 h-4 text-violet-400" />,
            '#a78bfa', // violet-400
            discoveryJobs
          )}

          {/* 🤖 AI Tasks Section */}
          {renderJobSection(
            'AI Tasks',
            <Activity className="w-4 h-4 text-blue-400" />,
            '#60a5fa', // blue-400
            aiJobs
          )}
        </>
      )}
    </div>
  );
}
