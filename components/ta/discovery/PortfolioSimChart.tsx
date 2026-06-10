"use client";

// components/ta/PortfolioSimChart.tsx — Portfolio simulation results chart
// Renders equity line + drawdown histogram using lightweight-charts
// via the existing useLightweightChart hook.

import { type Time } from "lightweight-charts";
import { useLightweightChart } from "@/hooks/useLightweightChart";

interface PortfolioSimChartProps {
  equityCurve?: { time: string | number; equity: number }[];
  drawdownCurve?: { time: string | number; drawdownPct: number }[];
  finalEquity?: number;
  cagr?: number;
  maxDrawdownPct?: number;
}

const CHART_HEIGHT = 280;

export default function PortfolioSimChart({
  equityCurve,
  drawdownCurve,
  finalEquity,
  cagr,
  maxDrawdownPct,
}: PortfolioSimChartProps) {
  const hasData = equityCurve && equityCurve.length > 0;

  // Convert data to lightweight-charts format
  const lineData = hasData
    ? equityCurve.map((p) => ({
        time: p.time as Time,
        value: p.equity,
      }))
    : [];

  const histogramData = drawdownCurve
    ? drawdownCurve.map((p) => ({
        time: p.time as Time,
        value: -p.drawdownPct,
      }))
    : [];

  const { containerRef } = useLightweightChart(
    CHART_HEIGHT,
    (chart) => {
      // Equity line
      const lineSeries = chart.addLineSeries({
        color: "#22c55e",
        lineWidth: 2,
        priceFormat: {
          type: "price",
          precision: 2,
          minMove: 0.01,
        },
      });
      lineSeries.setData(lineData);

      // Drawdown histogram
      if (histogramData.length > 0) {
        const histSeries = chart.addHistogramSeries({
          color: "#ef444466",
          priceFormat: {
            type: "price",
            precision: 2,
            minMove: 0.01,
          },
        });
        histSeries.setData(histogramData);
      }

      chart.timeScale().fitContent();
    },
    [hasData],
  );

  if (!hasData) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
        Run a path-aware backtest to see portfolio simulation results.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Final Equity</div>
          <div className="text-lg font-mono font-semibold text-green-400">
            {finalEquity != null
              ? `$${finalEquity.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : "—"}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">CAGR</div>
          <div
            className={`text-lg font-mono font-semibold ${
              (cagr ?? 0) >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {cagr != null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
          <div className="text-lg font-mono font-semibold text-red-400">
            {maxDrawdownPct != null ? `−${maxDrawdownPct.toFixed(1)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height: CHART_HEIGHT }} />
    </div>
  );
}