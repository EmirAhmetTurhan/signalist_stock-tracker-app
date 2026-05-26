// app/(root)/portfolio/page.tsx — Paper Trading Portfolio page (server component)
// Primary surface for paper trading. Fetches wallet + positions + trades server-side.
// Uses the same auth pattern as the root layout.

import { headers } from 'next/headers';
import { auth } from '@/lib/better-auth/auth';
import { redirect } from 'next/navigation';
import { getOrCreateWallet } from '@/lib/actions/wallet.actions';
import { getPortfolioData, getTradeHistoryAction } from '@/lib/actions/trade.actions';
import PortfolioTabs from '@/components/portfolio/PortfolioTabs';
import PortfolioOverview from '@/components/portfolio/PortfolioOverview';
import WalletCard from '@/components/portfolio/WalletCard';
import PositionsTable from '@/components/portfolio/PositionsTable';
import TradeHistory from '@/components/portfolio/TradeHistory';
import { getForwardTests } from '@/lib/actions/forward-test.actions';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect('/sign-in');

  const userId = session.user.id;

  // Lazy wallet initialization — creates on first visit
  await getOrCreateWallet(userId);

  // Fetch portfolio data with current prices
  const portfolioResult = await getPortfolioData(userId);
  const portfolio = portfolioResult.data;

  // Fetch recent trades
  const tradesResult = await getTradeHistoryAction(userId, { limit: 20 });

  // Fetch Forward Tests
  const forwardTestsResult = await getForwardTests(userId);
  const forwardTests = forwardTestsResult.data || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Portfolio</h1>
          <p className="text-sm text-gray-500 mt-1">Paper Trading Simulation</p>
        </div>
        {portfolio?.wallet && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 bg-gray-800/60 px-2.5 py-1 rounded-full border border-gray-700/50">
              💰 Virtual USD
            </span>
            {portfolio.wallet.resetCount > 0 && (
              <span className="text-xs text-amber-500/70 bg-amber-950/30 px-2.5 py-1 rounded-full border border-amber-800/30">
                Reset #{portfolio.wallet.resetCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Overview Hero Cards */}
      <PortfolioOverview portfolio={portfolio || null} />

      {/* Wallet Card */}
      {portfolio?.wallet && (
        <WalletCard wallet={portfolio.wallet} userId={userId} />
      )}

      {/* Tabbed Content */}
      <PortfolioTabs
        positions={portfolio?.positions || []}
        trades={tradesResult.trades || []}
        totalTrades={tradesResult.total || 0}
        forwardTests={forwardTests}
        userId={userId}
      />
    </div>
  );
}
