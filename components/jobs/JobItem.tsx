import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Trash2, Clock, Terminal, Sparkles } from 'lucide-react';

interface JobItemProps {
  job: any;
  onDelete: (id: string) => void;
}

function JobItemInner({ job, onDelete }: JobItemProps) {
  const isRunning = job.status === 'running' || job.status === 'queued';
  const isFailed = job.status === 'failed';
  const isCompleted = job.status === 'completed';
  const isDiscovery = job.type === 'deep_discovery';

  // Accent color based on job type
  const accentColor = isDiscovery ? 'violet' : 'blue';
  const accentGradient = isDiscovery
    ? 'from-violet-500 to-amber-400'
    : 'from-blue-500 to-cyan-400';
  const accentBg = isDiscovery
    ? 'bg-violet-500/10 border-violet-500/20'
    : 'bg-blue-500/10 border-blue-500/20';
  const accentText = isDiscovery ? 'text-violet-400' : 'text-blue-400';
  const accentTextMuted = isDiscovery ? 'text-violet-400/70' : 'text-blue-400/70';
  const accentProgressBg = isDiscovery ? 'bg-violet-900/50' : 'bg-blue-900/50';

  const date = new Date(job.createdAt).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Format execution times for display
  const executionTimes = job.executionTimes as Record<string, number> | undefined;
  const executionTimeEntries = executionTimes
    ? Object.entries(executionTimes).filter(([_, ms]) => ms > 0)
    : [];

  return (
    <div className={`p-5 rounded-xl border transition-all ${isRunning ? accentBg : isFailed ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Icon */}
          {isRunning && <Loader2 className={`w-5 h-5 ${accentText} animate-spin mt-0.5 shrink-0`} />}
          {isFailed && <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />}
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />}

          <div className="flex-1 min-w-0">
            {/* Title + Type Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-white truncate">{job.title}</h3>
              {isDiscovery && (
                <span className="text-[10px] font-mono bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  Discovery
                </span>
              )}
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {date}</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> {job.type}</span>
              <span className={`uppercase font-medium ${isRunning ? accentText : isFailed ? 'text-red-400' : 'text-green-400'}`}>{job.status}</span>
            </div>

            {/* ─── PROGRESS TELEMETRY (for running jobs) ─── */}
            {isRunning && (
              <div className="mt-3 space-y-2">
                {/* Phase badge + percentage */}
                <div className="flex items-center justify-between">
                  {job.currentPhase ? (
                    <span className={`text-xs font-medium ${accentText}`}>
                      Phase {job.currentPhase}/5
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Initializing...</span>
                  )}
                  <span className="text-xs font-semibold text-amber-400">{job.progress ?? 0}%</span>
                </div>

                {/* Progress bar — same style as NotificationBell */}
                <div className={`w-full h-1.5 ${accentProgressBg} rounded-full overflow-hidden`}>
                  <div
                    className={`h-full bg-gradient-to-r ${accentGradient} rounded-full transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(3, job.progress ?? 0)}%` }}
                  />
                </div>

                {/* Phase detail */}
                {job.phaseDetail && (
                  <div className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full animate-pulse ${accentText}`} />
                    <p className={`text-[11px] ${accentTextMuted} truncate`}>{job.phaseDetail}</p>
                  </div>
                )}

                {/* Execution times for completed phases */}
                {executionTimeEntries.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {executionTimeEntries.map(([phase, ms]) => (
                      <span key={phase} className="text-[10px] text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">
                        {phase}: {(ms / 1000).toFixed(1)}s
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error detail for failed jobs */}
            {isFailed && (
              <div className="mt-3 p-3 bg-red-500/10 rounded-lg text-sm text-red-400 border border-red-500/20">
                {job.errorMessage || 'Bilinmeyen bir hata oluştu.'}
              </div>
            )}

            {/* Steps for running jobs (legacy fallback for non-discovery types) */}
            {isRunning && !isDiscovery && job.steps && job.steps.length > 0 && (
              <div className="mt-3 space-y-2">
                {job.steps.map((step: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${step.status === 'completed' ? 'bg-green-400' : step.status === 'running' ? `${accentText.replace('text-', 'bg-')} animate-pulse` : 'bg-gray-600'}`} />
                    <span className={step.status === 'running' ? 'text-blue-300' : 'text-gray-400'}>
                      {step.detail || step.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.preventDefault(); onDelete(job._id); }}
          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
          title="Görevi Sil"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Memoize: prevents re-render when parent JobsSection re-fetches but data hasn't changed
const JobItem = React.memo(JobItemInner);
export default JobItem;
