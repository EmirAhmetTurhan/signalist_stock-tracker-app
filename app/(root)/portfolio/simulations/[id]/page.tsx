import { notFound } from 'next/navigation';
import { connectToDatabase } from '@/database/mongoose';
import Simulation from '@/database/models/simulation.model';
import SimulationProgressCard from '@/components/simulation/SimulationProgressCard';
import SimulationResultsDashboard from '@/components/simulation/SimulationResultsDashboard';
import RetryButton from '@/components/simulation/RetryButton';
import Link from 'next/link';

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await connectToDatabase();
  try {
    const sim = await Simulation.findById(params.id).lean();
    if (!sim) return { title: 'Not Found | Signalist' };
    return { title: `${sim.benchmarkSymbol || 'Simulation'} Lab Results | Signalist` };
  } catch {
    return { title: 'Simulation | Signalist' };
  }
}

export default async function SimulationPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await connectToDatabase();

  let simulation;
  try {
    simulation = await Simulation.findById(params.id).lean();
  } catch (e) {
    notFound();
  }

  if (!simulation) {
    notFound();
  }

  const simJson = JSON.parse(JSON.stringify(simulation));

  return (
    <div className="container mx-auto px-4 md:px-6">
      {(simJson.status === 'queued' || simJson.status === 'running') && (
        <SimulationProgressCard simulationId={simJson._id} />
      )}
      
      {simJson.status === 'completed' && (
        <SimulationResultsDashboard simulation={simJson} />
      )}

      {simJson.status === 'failed' && (
        <div className="min-h-[60vh] flex items-center justify-center">
           <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-12 max-w-lg text-center shadow-[0_0_50px_rgba(239,68,68,0.2)]">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <h2 className="text-3xl font-bold text-red-500 mb-4 tracking-wide">Simulation Failed</h2>
              <p className="text-gray-400 mb-8 leading-relaxed">The quantitative engine encountered a critical error while processing the backtest chunk. Please verify your strategy parameters.</p>
              {simJson.failedAt && <p className="text-sm text-red-500/50 mb-8 font-mono">{new Date(simJson.failedAt).toLocaleString()}</p>}
              
              <div className="flex justify-center gap-4">
                <Link href="/portfolio/simulations" className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition">Back to List</Link>
                <RetryButton simulation={simJson} />
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
