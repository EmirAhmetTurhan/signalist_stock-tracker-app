'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSimulationProgress } from '@/lib/actions/simulation.actions';

export default function SimulationProgressCard({ simulationId }: { simulationId: string }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const poll = async () => {
      const res = await getSimulationProgress(simulationId);
      
      if (!res.success) {
        setErrorCount(prev => {
          const next = prev + 1;
          if (next >= 3) {
            clearInterval(interval);
            setData({ status: 'failed', progress: 0, failedAt: new Date().toISOString() });
          }
          return next;
        });
        return;
      }
      
      setErrorCount(0);
      if (res.data) {
        setData(res.data);
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          clearInterval(interval);
          if (res.data.status === 'completed') {
            router.refresh(); // Refresh page to render SimulationResultsDashboard
          }
        }
      }
    };

    poll();
    interval = setInterval(poll, 2000); // 2 second polling

    return () => clearInterval(interval);
  }, [simulationId, router]);

  if (!data) return <div className="text-gray-400 animate-pulse text-center mt-20">Initializing engine...</div>;

  const isCompleted = data.status === 'completed';
  const isFailed = data.status === 'failed';
  const progress = data.progress || 0;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-xl bg-gray-950/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-10 shadow-[0_0_60px_rgba(0,0,0,0.6)]">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-100 mb-3 tracking-wide">Simulation Engine</h2>
          <div className="flex items-center justify-center gap-3">
            <span className="relative flex h-3 w-3">
              {!isCompleted && !isFailed && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-500'}`}></span>
            </span>
            <span className="text-gray-400 uppercase tracking-widest text-sm font-semibold">
              {data.status}
            </span>
          </div>
        </div>

        <div className="relative w-full h-3 bg-gray-900 rounded-full overflow-hidden border border-gray-800 shadow-inner">
          <div 
            className={`h-full transition-all duration-700 ease-out ${isCompleted ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <div className="mt-5 flex justify-between items-center text-sm font-medium text-gray-500">
          <span className={isCompleted ? 'text-emerald-500' : 'text-amber-500'}>{progress}% Completed</span>
          {data.lastProcessedDate && <span>Processing: {new Date(data.lastProcessedDate).toISOString().split('T')[0]}</span>}
        </div>

        {isFailed && (
          <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
            Engine encountered a critical failure. Check logs.
            <br/>
            {data.failedAt && <span className="text-xs text-red-500/70">Failed at: {new Date(data.failedAt).toLocaleString()}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
