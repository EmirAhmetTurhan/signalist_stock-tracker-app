'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { TrendingUp, DollarSign, Download, PieChart, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import DepositWithdrawModal from './DepositWithdrawModal';
import StrategyAllocationModal from './StrategyAllocationModal';
import { closePositionAction } from '@/lib/actions/paper-trading.actions';

const safeFloat = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};

export default function PaperTradingDashboard({ wallet, positions, transactions }: { wallet: any, positions: any[], transactions: any[] }) {
  const [isExecuting, setIsExecuting] = useState(false);

  const totalEquity = safeFloat(wallet.totalEquity);
  const initialBalance = safeFloat(wallet.initialBalance);
  const cashBalance = safeFloat(wallet.cashBalance);

  const totalReturn = initialBalance > 0 ? ((totalEquity - initialBalance) / initialBalance) * 100 : 0;

  // Compute Daily P&L from unrealized PNL
  const dailyPnl = positions.reduce((acc, p) => acc + safeFloat(p.unrealizedPnl), 0);

  const handleExecuteNow = async () => {
    setIsExecuting(true);
    try {
      const res = await fetch('/api/paper-trading/execute', { method: 'POST' });
      const data = await res.json();
      if (data.success) toast.success('Daily execution triggered!');
      else toast.error(data.error || 'Execution failed');
    } catch (e) {
      toast.error('Network error');
    }
    setIsExecuting(false);
  };

  const handleClosePosition = async (positionId: string) => {
    const res = await closePositionAction(positionId);
    if (res.success) toast.success('Position closed successfully');
    else toast.error(res.error || 'Failed to close position');
  };

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Symbol', 'Quantity', 'Price', 'Fees', 'Realized P&L', 'Cost Basis'];
    const csvContent = [
      headers.join(','),
      ...transactions.map(tx => [
        new Date(tx.executedAt).toISOString(),
        tx.type,
        tx.symbol || 'USD',
        tx.quantity || '',
        tx.price || '',
        tx.fees || '0',
        tx.realizedPnl || '',
        tx.amount || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Actions */}
      <div className="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-800 backdrop-blur-md">
        <div className="flex gap-3">
          <DepositWithdrawModal walletId={wallet._id} />
          <StrategyAllocationModal 
            walletId={wallet._id} 
            initialPortfolio={wallet.strategyPortfolio || []} 
            initialSymbols={wallet.activeSymbols || []} 
          />
        </div>
        <Button 
          onClick={handleExecuteNow} 
          disabled={isExecuting}
          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
        >
          <Play className="w-4 h-4" />
          {isExecuting ? 'Executing...' : 'Execute Now'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-950/80 border-gray-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Equity</CardTitle>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-950/80 border-gray-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Cash Balance</CardTitle>
            <DollarSign className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-200">${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>

        <Card className="bg-gray-950/80 border-gray-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Return</CardTitle>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </div>
            <p className="text-xs text-gray-500 mt-1">vs Initial ${initialBalance.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-950/80 border-gray-800 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Unrealized P&L</CardTitle>
            <PieChart className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${dailyPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-gray-500 mt-1">{positions.length} Open Positions</p>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Open Positions & Strategy Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 bg-gray-950/80 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
          <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <h2 className="font-semibold text-gray-200">Open Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Entry</th>
                  <th className="px-4 py-3 font-medium text-right">Current</th>
                  <th className="px-4 py-3 font-medium text-right">Unrealized</th>
                  <th className="px-4 py-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {positions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <PieChart className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No open positions. Use &quot;Execute Now&quot; to test strategies.
                  </td></tr>
                ) : positions.map(pos => {
                  const entry = safeFloat(pos.avgEntryPrice);
                  const current = safeFloat(pos.currentPrice || pos.avgEntryPrice);
                  const unPnl = safeFloat(pos.unrealizedPnl);
                  const isLong = pos.side === 'LONG';
                  
                  return (
                    <tr key={pos._id} className="hover:bg-gray-900/30">
                      <td className="px-4 py-3 font-medium text-gray-200">{pos.symbol}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={isLong ? 'text-emerald-400 border-emerald-900' : 'text-red-400 border-red-900'}>
                          {pos.side}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{safeFloat(pos.quantity).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">${entry.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-300">${current.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${unPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {unPnl >= 0 ? '+' : ''}${unPnl.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleClosePosition(pos._id)} className="text-red-400 hover:text-red-300 hover:bg-red-950/50">
                          Close
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-gray-950/80 border border-gray-800 rounded-xl p-4 backdrop-blur-sm flex flex-col">
          <h2 className="font-semibold text-gray-200 mb-4">Allocation</h2>
          <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
             {/* Custom simple visual SVG pie / bars since we don't have full chart library strictly ready */}
             <div className="w-full space-y-3">
               {wallet.strategyPortfolio?.length === 0 ? (
                 <p className="text-center text-gray-500 text-sm">No strategies assigned.</p>
               ) : wallet.strategyPortfolio?.map((strat: any, i: number) => {
                 const pct = (strat.weight * 100).toFixed(0);
                 return (
                   <div key={i} className="space-y-1">
                     <div className="flex justify-between text-xs text-gray-400">
                       <span className="truncate pr-2">{strat.name || strat.originalStrategyId.slice(-6)}</span>
                       <span>{pct}%</span>
                     </div>
                     <div className="h-2 w-full bg-gray-900 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }}></div>
                     </div>
                   </div>
                 )
               })}
             </div>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-gray-950/80 border border-gray-800 rounded-xl overflow-hidden backdrop-blur-sm">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-semibold text-gray-200">Recent Transactions</h2>
          <Button variant="outline" size="sm" onClick={exportCSV} className="bg-gray-900 border-gray-800 gap-2 h-8 text-xs text-gray-300">
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Realized P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No transactions yet.</td></tr>
              ) : transactions.map(tx => {
                const pnl = tx.realizedPnl ? safeFloat(tx.realizedPnl) : 0;
                const isDeposit = tx.type === 'DEPOSIT';
                return (
                  <tr key={tx._id} className="hover:bg-gray-900/30">
                    <td className="px-4 py-3 text-gray-400">{format(new Date(tx.executedAt), 'MMM dd, HH:mm')}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="bg-gray-900 text-gray-300 border-gray-800">
                        {tx.type} {tx.subType && `(${tx.subType})`}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-200">{tx.symbol || '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{tx.price ? `$${safeFloat(tx.price).toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3 text-right text-gray-300">${Math.abs(safeFloat(tx.amount)).toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${pnl > 0 ? 'text-emerald-500' : pnl < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {pnl ? (pnl > 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
