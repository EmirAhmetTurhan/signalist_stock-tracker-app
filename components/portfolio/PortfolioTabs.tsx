'use client';

// components/portfolio/PortfolioTabs.tsx — Tab switching with smooth transitions
// Tabs: Positions | Trade History

import { useState } from 'react';
import PositionsTable from './PositionsTable';
import TradeHistory from './TradeHistory';
import ManualTradeModal from './ManualTradeModal';
import ForwardTestList from './ForwardTestList';
import PendingOrdersTable from './PendingOrdersTable';

interface PortfolioTabsProps {
  positions: PortfolioPosition[];
  trades: PortfolioTrade[];
  totalTrades: number;
  forwardTests?: any[];
  pendingOrders?: any[];
  userId: string;
}

const TABS = [
  { id: 'positions', label: 'Positions', icon: '📊' },
  { id: 'pending', label: 'Pending Orders', icon: '⏳' },
  { id: 'history', label: 'Trade History', icon: '📋' },
  { id: 'forwardTests', label: 'Forward Tests', icon: '🤖' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function PortfolioTabs({ positions, trades, totalTrades, forwardTests = [], pendingOrders = [], userId }: PortfolioTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('positions');
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeSymbol, setTradeSymbol] = useState('');

  const handleTrade = (symbol: string) => {
    setTradeSymbol(symbol);
    setTradeModalOpen(true);
  };

  return (
    <div className="rounded-xl border border-gray-800/50 bg-gray-900/20 overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-gray-800/50 px-4">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-xs">{tab.icon}</span>
                {tab.label}
                {tab.id === 'positions' && positions.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    {positions.length}
                  </span>
                )}
                {tab.id === 'history' && totalTrades > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    {totalTrades}
                  </span>
                )}
                {tab.id === 'pending' && pendingOrders.filter((o: any) => o.status === 'active').length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                    {pendingOrders.filter((o: any) => o.status === 'active').length}
                  </span>
                )}
                {tab.id === 'forwardTests' && forwardTests.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
                    {forwardTests.length}
                  </span>
                )}
              </span>
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t" />
              )}
            </button>
          ))}
        </div>

        {/* New Trade Button */}
        <button
          onClick={() => {
            setTradeSymbol('');
            setTradeModalOpen(true);
          }}
          className="text-xs font-medium text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20 hover:border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 transition-all"
        >
          + New Trade
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'positions' && (
          <PositionsTable positions={positions} onTrade={handleTrade} />
        )}
        {activeTab === 'history' && (
          <TradeHistory trades={trades} total={totalTrades} userId={userId} />
        )}
        {activeTab === 'pending' && (
          <PendingOrdersTable orders={pendingOrders} userId={userId} />
        )}
        {activeTab === 'forwardTests' && (
          <ForwardTestList forwardTests={forwardTests} userId={userId} />
        )}
      </div>

      {/* Trade Modal */}
      <ManualTradeModal
        open={tradeModalOpen}
        onClose={() => setTradeModalOpen(false)}
        userId={userId}
        prefillSymbol={tradeSymbol}
      />
    </div>
  );
}
