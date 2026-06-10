"use client";

// components/ta/RegimeAccuracyTable.tsx — Regime accuracy breakdown table
// Renders per-regime win rate, signal count, and return statistics
// used in the StrategyBacktestMonitor Regimes tab.

import type { MarketRegime, RegimeStats } from "@/lib/ta/types";

interface RegimeAccuracyTableProps {
  regimeBreakdown: Record<MarketRegime, RegimeStats>;
}

const REGIME_LABELS: Record<MarketRegime, { label: string; color: string }> = {
  uptrend: { label: "Uptrend ↑", color: "text-green-400" },
  downtrend: { label: "Downtrend ↓", color: "text-red-400" },
  ranging: { label: "Ranging ↔", color: "text-yellow-400" },
  volatile: { label: "Volatile ⚡", color: "text-orange-400" },
  neutral: { label: "Neutral —", color: "text-gray-400" },
};

const REGIME_ORDER: MarketRegime[] = [
  "uptrend",
  "downtrend",
  "ranging",
  "volatile",
  "neutral",
];

export default function RegimeAccuracyTable({
  regimeBreakdown,
}: RegimeAccuracyTableProps) {
  const hasData = REGIME_ORDER.some(
    (r) => (regimeBreakdown[r]?.totalSignals ?? 0) > 0
  );

  if (!hasData) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
        No regime data available for this backtest run.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400">
            <th className="text-left py-2 px-3 font-medium">Regime</th>
            <th className="text-right py-2 px-3 font-medium">Win Rate</th>
            <th className="text-right py-2 px-3 font-medium">Signals</th>
            <th className="text-right py-2 px-3 font-medium">Wins</th>
            <th className="text-right py-2 px-3 font-medium">Avg Return</th>
            <th className="text-right py-2 px-3 font-medium">Total Return</th>
          </tr>
        </thead>
        <tbody>
          {REGIME_ORDER.map((regime) => {
            const stats = regimeBreakdown[regime];
            if (!stats || stats.totalSignals === 0) return null;

            const { label, color } = REGIME_LABELS[regime];
            const winRateColor =
              stats.winRate >= 60
                ? "text-green-400"
                : stats.winRate >= 45
                ? "text-yellow-400"
                : "text-red-400";

            return (
              <tr
                key={regime}
                className="border-b border-gray-800 hover:bg-gray-800/30"
              >
                <td className={`py-2 px-3 font-medium ${color}`}>{label}</td>
                <td className={`py-2 px-3 text-right ${winRateColor}`}>
                  {stats.winRate.toFixed(1)}%
                </td>
                <td className="py-2 px-3 text-right text-gray-300">
                  {stats.totalSignals}
                </td>
                <td className="py-2 px-3 text-right text-gray-300">
                  {stats.wins}
                </td>
                <td
                  className={`py-2 px-3 text-right ${
                    stats.avgReturn >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {stats.avgReturn >= 0 ? "+" : ""}
                  {stats.avgReturn.toFixed(2)}%
                </td>
                <td
                  className={`py-2 px-3 text-right ${
                    stats.totalReturn >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {stats.totalReturn >= 0 ? "+" : ""}
                  {stats.totalReturn.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}