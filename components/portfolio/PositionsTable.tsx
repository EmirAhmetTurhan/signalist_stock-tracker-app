'use client';

// components/portfolio/PositionsTable.tsx — Open positions with real-time P&L
// Color-coded gains/losses, symbol badges, market value

interface PositionsTableProps {
  positions: PortfolioPosition[];
  onTrade?: (symbol: string) => void;
}

export default function PositionsTable({ positions, onTrade }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-sm">Henüz açık pozisyon yok.</p>
        <p className="text-xs mt-1 text-gray-700">Bir hisse satın alarak paper trading'e başlayın.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-600 uppercase tracking-wider border-b border-gray-800/50">
            <th className="text-left py-3 px-3 font-medium">Symbol</th>
            <th className="text-right py-3 px-3 font-medium">Qty</th>
            <th className="text-right py-3 px-3 font-medium">Avg Entry</th>
            <th className="text-right py-3 px-3 font-medium">Current</th>
            <th className="text-right py-3 px-3 font-medium">Market Value</th>
            <th className="text-right py-3 px-3 font-medium">P&L</th>
            <th className="text-right py-3 px-3 font-medium">% Change</th>
            {onTrade && <th className="text-right py-3 px-3 font-medium">Action</th>}
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const isProfit = pos.unrealizedPnl >= 0;
            const pnlColor = isProfit ? 'text-emerald-400' : 'text-red-400';
            const pnlBg = isProfit ? 'bg-emerald-500/5' : 'bg-red-500/5';

            return (
              <tr
                key={pos.id}
                className={`border-b border-gray-800/30 transition-colors hover:bg-gray-800/20 ${pnlBg}`}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-700/50">
                      {pos.symbol.slice(0, 2)}
                    </div>
                    <span className="font-medium text-gray-200">{pos.symbol}</span>
                  </div>
                </td>
                <td className="text-right py-3 px-3 text-gray-300 tabular-nums font-medium">
                  {pos.quantity}
                </td>
                <td className="text-right py-3 px-3 text-gray-400 tabular-nums">
                  ${pos.avgEntryPrice.toFixed(2)}
                </td>
                <td className="text-right py-3 px-3 text-gray-200 tabular-nums font-medium">
                  ${pos.currentPrice.toFixed(2)}
                </td>
                <td className="text-right py-3 px-3 text-gray-300 tabular-nums">
                  ${pos.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
                <td className={`text-right py-3 px-3 tabular-nums font-semibold ${pnlColor}`}>
                  {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                </td>
                <td className={`text-right py-3 px-3 tabular-nums ${pnlColor}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isProfit ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'
                  }`}>
                    {isProfit ? '▲' : '▼'} {Math.abs(pos.unrealizedPnlPercent).toFixed(2)}%
                  </span>
                </td>
                {onTrade && (
                  <td className="text-right py-3 px-3">
                    <button
                      onClick={() => onTrade(pos.symbol)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    >
                      Trade
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
