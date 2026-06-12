import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { connectToDatabase } from '@/database/mongoose';
import Simulation from '@/database/models/simulation.model';
import SimulationsList from '@/components/simulation/SimulationsList';
import SimulationCreationModal from '@/components/simulation/SimulationCreationModal';
import LaunchLabButton from '@/components/simulation/LaunchLabButton';

export async function generateMetadata() {
  return { title: 'Simulation Lab | Signalist' };
}

export default async function SimulationsPage() {
  await connectToDatabase();
  const session = await auth.api.getSession({ headers: await headers() });
  
  if (!session?.user) {
    return <div>Unauthorized</div>;
  }

  const simulations = await Simulation.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .populate('walletId')
    .lean();

  const serializedSimulations = JSON.parse(JSON.stringify(simulations));

  return (
    <div className="container mx-auto px-4 md:px-6 py-6 space-y-8 min-h-screen text-gray-100 bg-[#0a0a0a]">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-yellow-400">Simulation Lab</h1>
          <p className="text-gray-500 mt-1">Manage and launch quantitative backtesting strategies</p>
        </div>
        <LaunchLabButton />
      </div>

      <SimulationsList initialSimulations={serializedSimulations} />
      
      <SimulationCreationModal />
    </div>
  );
}
