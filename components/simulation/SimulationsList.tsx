'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSimulation } from '@/lib/actions/simulation.actions';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Trash2, LineChart, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import LaunchLabButton from './LaunchLabButton';

export default function SimulationsList({ initialSimulations }: { initialSimulations: any[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLoadingId(id);
    try {
      const res = await deleteSimulation(id);
      if (res.success) {
        toast.success('Simulation deleted');
      } else {
        toast.error(res.error || 'Failed to delete simulation');
      }
    } catch (e) {
      toast.error('An unexpected error occurred');
    } finally {
      setLoadingId(null);
    }
  };

  if (!initialSimulations || initialSimulations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] border border-dashed border-gray-800 rounded-2xl bg-gray-950/50 backdrop-blur-md">
        <LineChart className="w-16 h-16 text-gray-700 mb-4" />
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No simulations yet</h3>
        <p className="text-gray-500 mb-6 text-center max-w-sm">Launch your first quantitative strategy to see backtest results, trade histories, and risk metrics.</p>
        <LaunchLabButton />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {initialSimulations.map((sim) => {
        const isCompleted = sim.status === 'completed';
        const isFailed = sim.status === 'failed';
        const isRunning = sim.status === 'running';
        const isQueued = sim.status === 'queued';
        
        const metrics = sim.finalMetrics || {};
        const totalReturn = parseFloat(metrics.totalReturn || '0');
        const cagr = parseFloat(metrics.cagr || '0');
        const sharpe = parseFloat(metrics.sharpeRatio || '0');

        return (
          <div 
            key={sim._id}
            onClick={() => router.push('/portfolio/simulations/' + sim._id)}
            className="group cursor-pointer rounded-2xl border border-gray-800 bg-gray-950 backdrop-blur-md hover:border-yellow-500/50 hover:shadow-[0_0_30px_rgba(234,179,8,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-800 to-transparent group-hover:via-yellow-500/50 transition-all"></div>
            
            <div className="p-5 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-100 group-hover:text-yellow-400 transition-colors line-clamp-1">{sim.name || 'Strategy Simulation'}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400 bg-gray-900 px-2 py-0.5 rounded-full border border-gray-800">{sim.benchmarkSymbol} Benchmark</span>
                    <span className="text-xs text-gray-500">{format(new Date(sim.startDate), 'MMM yyyy')} - {format(new Date(sim.endDate), 'MMM yyyy')}</span>
                  </div>
                </div>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button 
                      onClick={(e: React.MouseEvent) => e.stopPropagation()} 
                      disabled={loadingId === sim._id}
                      className="text-gray-600 hover:text-red-500 p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
                    >
                      {loadingId === sim._id ? <span className="animate-spin text-xs block w-4 h-4 text-center leading-4">...</span> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-950 border-gray-800 text-gray-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Simulation?</AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-400">
                        Are you sure you want to delete this simulation? This action cannot be undone. All trades, positions, and history will be permanently erased.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={(e: React.MouseEvent) => e.stopPropagation()} className="bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={(e: React.MouseEvent) => handleDelete(e, sim._id)}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="mb-5 flex-1">
                {isCompleted && <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</Badge>}
                {isFailed && <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>}
                {isRunning && <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 animate-pulse"><Play className="w-3 h-3 mr-1" /> Running ({sim.progress || 0}%)</Badge>}
                {isQueued && <Badge className="bg-gray-500/10 text-gray-400 border border-gray-500/20 hover:bg-gray-500/20"><Clock className="w-3 h-3 mr-1" /> Queued</Badge>}
              </div>

              {isCompleted ? (
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-800/50 mt-auto">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Return</p>
                    <p className={`font-mono font-medium ${totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totalReturn > 0 ? '+' : ''}{totalReturn.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">CAGR</p>
                    <p className={`font-mono font-medium ${cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{cagr.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Sharpe</p>
                    <p className={`font-mono font-medium ${sharpe >= 1 ? 'text-emerald-400' : sharpe >= 0 ? 'text-gray-300' : 'text-red-400'}`}>{sharpe.toFixed(2)}</p>
                  </div>
                </div>
              ) : isFailed ? (
                <div className="pt-4 border-t border-gray-800/50 mt-auto">
                  <p className="text-xs text-red-500/70 font-mono line-clamp-1">Engine encountered a critical error.</p>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-800/50 mt-auto">
                  <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${sim.progress || 0}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
