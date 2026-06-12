'use client';
import { useRouter } from 'next/navigation';
import { createSimulation } from '@/lib/actions/simulation.actions';
import { toast } from 'sonner';

export default function RetryButton({ simulation }: { simulation: any }) {
  const router = useRouter();

  const handleRetry = async () => {
    try {
      const res = await createSimulation({
        name: simulation.name || 'Retry Simulation',
        initialBalance: parseFloat(simulation.walletId?.initialBalance || '100000'),
        startDate: simulation.startDate,
        endDate: simulation.endDate,
        testSymbol: simulation.testSymbol || simulation.benchmarkSymbol || 'SPY',
        benchmarkSymbol: simulation.benchmarkSymbol || 'SPY',
        interval: simulation.interval || '1d',
        positionSizingConfig: simulation.positionSizingConfig,
        strategyPortfolio: simulation.strategyPortfolio
      });
      
      if (res.success && res.simulationId) {
        toast.success('Simulation restarted successfully');
        router.push('/portfolio/simulations/' + res.simulationId);
      } else {
        toast.error(res.error || 'Failed to restart simulation');
      }
    } catch (e: any) {
      toast.error('An unexpected error occurred');
    }
  };

  return (
    <button onClick={handleRetry} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition shadow-[0_0_15px_rgba(239,68,68,0.4)]">
      Retry Execution
    </button>
  );
}
