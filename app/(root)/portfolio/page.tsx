import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/database/mongoose';
import Wallet from '@/database/models/wallet.model';
import Position from '@/database/models/position.model';
import Transaction from '@/database/models/transaction.model';
import PaperTradingDashboard from '@/components/paper-trading/PaperTradingDashboard';
import { Types } from 'mongoose';

export async function generateMetadata() {
  return { title: 'Paper Trading | Signalist' };
}

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/sign-in');

    const userId = session.user.id;
    await connectToDatabase();

    let wallet = await Wallet.findOne({ userId, type: 'live' });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        type: 'live',
        baseCurrency: 'USD',
        initialBalance: Types.Decimal128.fromString('100000'),
        cashBalance: Types.Decimal128.fromString('100000'),
        totalEquity: Types.Decimal128.fromString('100000'),
        circuitBreakerTriggered: false,
        activeSymbols: ['AAPL', 'MSFT', 'SPY', 'TSLA', 'NVDA'],
        strategyPortfolio: []
      });
    }

    // .lean() BYPASSES Mongoose toJSON transforms — use Mongoose documents so toJSON runs
    const positions = await Position.find({ walletId: wallet._id, status: 'open' });
    const transactions = await Transaction.find({ walletId: wallet._id }).sort({ executedAt: -1 }).limit(50);

    const serializedWallet = JSON.parse(JSON.stringify(wallet));
    const serializedPositions = JSON.parse(JSON.stringify(positions));
    const serializedTransactions = JSON.parse(JSON.stringify(transactions));

    return (
      <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Paper Trading</h1>
            <p className="text-sm text-gray-500 mt-1">Live market simulation with real-time quotes</p>
          </div>
        </div>

        <PaperTradingDashboard
          wallet={serializedWallet}
          positions={serializedPositions}
          transactions={serializedTransactions}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('[PortfolioPage] FATAL:', message, stack);

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-8 max-w-2xl w-full">
          <h2 className="text-xl font-semibold text-red-400 mb-3">Portfolio Error</h2>
          <p className="text-gray-300 text-sm mb-4 font-mono bg-black/30 p-4 rounded text-left whitespace-pre-wrap break-all">
            {message}
          </p>
          <p className="text-gray-500 text-xs">Check server console for full stack trace.</p>
        </div>
      </div>
    );
  }
}
