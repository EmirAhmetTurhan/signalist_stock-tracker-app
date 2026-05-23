import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Trash2, Clock, Terminal } from 'lucide-react';

interface JobItemProps {
  job: any;
  onDelete: (id: string) => void;
}

export default function JobItem({ job, onDelete }: JobItemProps) {
  const isRunning = job.status === 'running' || job.status === 'queued';
  const isFailed = job.status === 'failed';
  const isCompleted = job.status === 'completed';

  const date = new Date(job.createdAt).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <div className={`p-5 rounded-xl border transition-all ${isRunning ? 'bg-blue-500/5 border-blue-500/20' : isFailed ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
      <div className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3 flex-1">
          {isRunning && <Loader2 className="w-5 h-5 text-blue-400 animate-spin mt-0.5 shrink-0" />}
          {isFailed && <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />}
          {isCompleted && <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />}
          
          <div className="flex-1">
            <h3 className="text-base font-semibold text-white">{job.title}</h3>
            
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {date}</span>
              <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> {job.type}</span>
              <span className={`uppercase font-medium ${isRunning ? 'text-blue-400' : isFailed ? 'text-red-400' : 'text-green-400'}`}>{job.status}</span>
            </div>

            {isFailed && (
              <div className="mt-3 p-3 bg-red-500/10 rounded-lg text-sm text-red-400 border border-red-500/20">
                {job.errorMessage || 'Bilinmeyen bir hata oluştu.'}
              </div>
            )}

            {isRunning && job.steps && job.steps.length > 0 && (
              <div className="mt-3 space-y-2">
                {job.steps.map((step: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${step.status === 'completed' ? 'bg-green-400' : step.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'}`} />
                    <span className={step.status === 'running' ? 'text-blue-300' : 'text-gray-400'}>
                      {step.detail || step.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
