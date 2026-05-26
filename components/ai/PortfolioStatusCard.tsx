'use client';

import { DollarSign, Briefcase, TrendingUp } from 'lucide-react';
import type { ToolCardProps } from './registry';

export default function PortfolioStatusCard({ data, isLast }: ToolCardProps) {
  const summary = data.summary as any;
  const positions = data.positions as any[];

  if (!summary || !positions) {
    return (
      <div className="bg-gray-800/80 border border-gray-700/50 rounded-xl p-4 text-sm text-gray-400">
        Portföy bilgisi alınamadı.
      </div>
    );
  }

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg mb-2">
      {/* Header */}
      <div className="bg-gray-800/50 p-4 border-b border-gray-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-gray-100">Portföy Durumu</h3>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="p-4 grid grid-cols-2 gap-4 border-b border-gray-800">
        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Nakit Bakiye
          </div>
          <div className="text-lg font-bold text-gray-100">{formatMoney(summary.cashBalance)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Toplam Varlık (Equity)
          </div>
          <div className="text-lg font-bold text-gray-100">{formatMoney(summary.totalEquity)}</div>
        </div>
      </div>

      {/* Positions List */}
      {positions.length > 0 ? (
        <div className="p-4 bg-gray-900/50">
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Açık Pozisyonlar</h4>
          <div className="space-y-3">
            {positions.map((pos) => {
              const isProfit = pos.unrealizedPnl >= 0;
              return (
                <div key={pos.id} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-semibold text-gray-200">{pos.symbol}</span>
                    <span className="text-gray-500 text-xs ml-2">{pos.quantity} adet</span>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-300">{formatMoney(pos.marketValue)}</div>
                    <div className={`text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{formatMoney(pos.unrealizedPnl)} ({pos.unrealizedPnlPercent.toFixed(2)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-gray-500 italic text-center">
          Açık pozisyonunuz bulunmamaktadır.
        </div>
      )}
    </div>
  );
}
