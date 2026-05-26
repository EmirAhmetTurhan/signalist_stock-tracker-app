'use client';

// components/portfolio/TradeHistory.tsx — Paginated trade log with trigger source tags

interface TradeHistoryProps {
  trades: PortfolioTrade[];
  total: number;
  userId: string;
}

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: 'Manual', color: 'bg-gray-700 text-gray-300' },
  ai_proposal: { label: 'AI', color: 'bg-purple-900/50 text-purple-300 border-purple-700/50' },
  strategy: { label: 'Strategy', color: 'bg-blue-900/50 text-blue-300 border-blue-700/50' },
  limit_order: { label: 'Limit', color: 'bg-amber-900/50 text-amber-300 border-amber-700/50' },
  stop_loss: { label: 'Stop Loss', color: 'bg-red-900/50 text-red-300 border-red-700/50' },
  take_profit: { label: 'Take Profit', color: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/50' },
  corporate_action: { label: 'Corp. Action', color: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/50' },
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function TradeHistory({ trades, total }: TradeHistoryProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-sm">Henüz işlem geçmişi yok.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-600 uppercase tracking-wider border-b border-gray-800/50">
              <th className="text-left py-3 px-3 font-medium">Date</th>
              <th className="text-left py-3 px-3 font-medium">Symbol</th>
              <th className="text-center py-3 px-3 font-medium">Side</th>
              <th className="text-right py-3 px-3 font-medium">Qty</th>
              <th className="text-right py-3 px-3 font-medium">Fill Price</th>
              <th className="text-right py-3 px-3 font-medium">Notional</th>
              <th className="text-right py-3 px-3 font-medium">P&L</th>
              <th className="text-center py-3 px-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const trigger = TRIGGER_LABELS[trade.triggerSource] || TRIGGER_LABELS.manual;
              const hasPnl = trade.realizedPnl !== null && trade.realizedPnl !== undefined;
              const isProfit = hasPnl && trade.realizedPnl! > 0;

              return (
                <tr
                  key={trade.id}
                  className="border-b border-gray-800/30 transition-colors hover:bg-gray-800/20"
                >
                  <td className="py-3 px-3 text-gray-500 text-xs whitespace-nowrap">
                    {formatDate(trade.executedAt)}
                  </td>
                  <td className="py-3 px-3 font-medium text-gray-200">
                    {trade.symbol}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      trade.side === 'BUY'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>
                      {trade.side}
                    </span>
                  </td>
                  <td className="text-right py-3 px-3 text-gray-300 tabular-nums">
                    {trade.quantity}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-300 tabular-nums">
                    ${trade.fillPrice.toFixed(2)}
                  </td>
                  <td className="text-right py-3 px-3 text-gray-400 tabular-nums">
                    ${trade.notional.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`text-right py-3 px-3 tabular-nums font-medium ${
                    hasPnl ? (isProfit ? 'text-emerald-400' : 'text-red-400') : 'text-gray-600'
                  }`}>
                    {hasPnl
                      ? `${isProfit ? '+' : ''}$${trade.realizedPnl!.toFixed(2)}`
                      : '—'
                    }
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${trigger.color}`}>
                      {trigger.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > trades.length && (
        <div className="text-center py-3 text-xs text-gray-600">
          Showing {trades.length} of {total} trades
        </div>
      )}
    </div>
  );
}
