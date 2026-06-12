'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, ISeriesApi, SeriesMarkerPosition, Time } from 'lightweight-charts';
import { toast } from 'sonner';

export default function SimulationResultsDashboard({ simulation }: { simulation: any }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<any>(null);
  
  const metrics = simulation.finalMetrics || {};

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // CRITICAL: Cleanup old instance if it exists (strict mode double mount)
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
      },
    });
    chartInstanceRef.current = chart;

    const equitySeries = chart.addAreaSeries({
      lineColor: '#10b981', // emerald-500
      topColor: 'rgba(16, 185, 129, 0.3)',
      bottomColor: 'rgba(16, 185, 129, 0.05)',
      lineWidth: 2,
    });

    const benchmarkSeries = chart.addLineSeries({
      color: '#6b7280', // gray-500
      lineWidth: 2,
    });

    if (simulation.equityCurve && simulation.equityCurve.length > 0) {
      const data = simulation.equityCurve.map((p: any) => ({
        time: (new Date(p.t).getTime() / 1000) as Time,
        value: parseFloat(p.eq)
      }));
      // Sanitization: Remove duplicate timestamps
      const uniqueData = data.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.time === v.time)) === i);
      uniqueData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
      equitySeries.setData(uniqueData);
    }

    if (simulation.benchmarkCurve && simulation.benchmarkCurve.length > 0) {
      const bData = simulation.benchmarkCurve.map((p: any) => ({
        time: (new Date(p.t).getTime() / 1000) as Time,
        value: parseFloat(p.eq)
      }));
      const uniqueBData = bData.filter((v: any, i: number, a: any[]) => a.findIndex((t: any) => (t.time === v.time)) === i);
      uniqueBData.sort((a: any, b: any) => (a.time as number) - (b.time as number));
      benchmarkSeries.setData(uniqueBData);
    }

    // Trade Markers
    if (simulation.tradeHistory && simulation.tradeHistory.length > 0) {
      const markers: any[] = [];
      simulation.tradeHistory.forEach((trade: any) => {
        markers.push({
          time: (new Date(trade.t).getTime() / 1000) as Time,
          position: (trade.type === 'BUY' ? 'belowBar' : 'aboveBar') as SeriesMarkerPosition,
          color: trade.type === 'BUY' ? '#10b981' : '#ef4444',
          shape: trade.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: trade.type,
          size: 1,
        });
      });
      // Deduplicate markers by time
      const uniqueMarkers = markers.filter((v, i, a) => a.findIndex(t => t.time === v.time && t.text === v.text) === i);
      uniqueMarkers.sort((a, b) => (a.time as number) - (b.time as number));
      try {
        equitySeries.setMarkers(uniqueMarkers);
      } catch(e) {
        console.warn('Marker error:', e);
      }
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [simulation]);

  const exportToCSV = () => {
    if (!simulation.tradeHistory || simulation.tradeHistory.length === 0) {
      toast.info('No trades to export');
      return;
    }
    
    const headers = [
      "Date", "Symbol", "Type", "Quantity", "Price", "Realized PnL", "Exit Reason"
    ];
    
    const rows = simulation.tradeHistory.map((t: any) => [
      new Date(t.t).toISOString().split('T')[0],
      t.symbol,
      t.type,
      parseFloat(t.quantity).toFixed(4),
      parseFloat(t.price).toFixed(2),
      parseFloat(t.realizedPnl || '0').toFixed(2),
      t.exitReason || ''
    ]);

    const metadata = [
      `Simulation ID: ${simulation._id}`,
      `Benchmark Symbol: ${simulation.benchmarkSymbol}`,
      `Generated: ${new Date().toISOString()}`,
      `Strategy Engine: ${simulation.engineVersion}`,
      "" // empty line
    ];

    const csvContent = metadata.join("\n") + "\n" + headers.join(",") + "\n" + rows.map((r: any[]) => r.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `simulation_history_${simulation._id}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 py-6 text-gray-100 bg-[#0a0a0a] min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-emerald-400">Simulation Lab Results</h1>
          <p className="text-gray-500 mt-1">{new Date(simulation.startDate).toISOString().split('T')[0]} to {new Date(simulation.endDate).toISOString().split('T')[0]}</p>
        </div>
        <div className="px-5 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full font-semibold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
          ✓ Engine Completed
        </div>
      </div>

      {/* A) Final Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard title="Total Return" value={`${parseFloat(metrics.totalReturn || '0').toFixed(2)}%`} positive={parseFloat(metrics.totalReturn) >= 0} />
        <MetricCard title="CAGR" value={`${(metrics.cagr || 0).toFixed(2)}%`} positive={(metrics.cagr || 0) >= 0} />
        <MetricCard title="Max Drawdown" value={`${(metrics.maxDrawdown || 0).toFixed(2)}%`} positive={(metrics.maxDrawdown || 0) <= 20} />
        <MetricCard title="Win Rate" value={`${(metrics.winRate || 0).toFixed(2)}%`} positive={(metrics.winRate || 0) >= 50} />
        <MetricCard title="Profit Factor" value={(metrics.profitFactor || 0).toFixed(2)} positive={(metrics.profitFactor || 0) >= 1} />
        <MetricCard title="Sharpe Ratio" value={(metrics.sharpeRatio || 0).toFixed(2)} positive={(metrics.sharpeRatio || 0) >= 1} />
        <MetricCard title="Sortino Ratio" value={(metrics.sortinoRatio || 0).toFixed(2)} positive={(metrics.sortinoRatio || 0) >= 1} />
        <MetricCard title="Total Signals" value={metrics.totalSignals || 0} />
      </div>

      {/* B) Equity Curve Chart */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 shadow-[0_0_40px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-xl font-semibold text-gray-300">Equity Curve</h3>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Strategy</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-500"></span> Benchmark ({simulation.benchmarkSymbol})</span>
          </div>
        </div>
        <div ref={chartContainerRef} className="w-full h-[400px]" />
      </div>

      {/* C) Trade History Table */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6 shadow-[0_0_40px_rgba(0,0,0,0.3)] overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-300">Trade Ledger</h3>
          <button onClick={exportToCSV} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg text-sm transition-colors text-gray-300">
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto premium-scrollbar max-h-[500px]">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900 text-gray-300 uppercase sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Date</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Realized PnL</th>
                <th className="px-4 py-3 rounded-tr-lg">Exit Reason</th>
              </tr>
            </thead>
            <tbody>
              {simulation.tradeHistory?.map((trade: any, idx: number) => {
                const pnl = parseFloat(trade.realizedPnl || '0');
                const reasonColor = trade.exitReason === 'stop_loss' ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                                  : trade.exitReason === 'take_profit' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                  : trade.exitReason === 'trailing_stop' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                  : 'bg-gray-800 text-gray-300 border-gray-700';

                return (
                  <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                    <td className="px-4 py-3 font-mono">{new Date(trade.t).toISOString().split('T')[0]}</td>
                    <td className="px-4 py-3 font-semibold text-gray-200">{trade.symbol}</td>
                    <td className="px-4 py-3 font-mono">
                      <span className={`px-2 py-1 text-xs rounded-full border ${trade.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {trade.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">{parseFloat(trade.quantity).toFixed(2)}</td>
                    <td className="px-4 py-3 font-mono">${parseFloat(trade.price).toFixed(2)}</td>
                    <td className={`px-4 py-3 font-mono font-semibold ${pnl > 0 ? 'text-emerald-500' : pnl < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      {pnl > 0 ? '+' : ''}{pnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      {trade.exitReason && (
                        <span className={`px-2 py-1 border rounded-md text-xs ${reasonColor}`}>
                          {trade.exitReason}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!simulation.tradeHistory || simulation.tradeHistory.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-600">No trades executed in this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, positive }: { title: string, value: string | number, positive?: boolean }) {
  const colorClass = positive === true ? 'text-emerald-400' : positive === false ? 'text-red-400' : 'text-gray-100';
  return (
    <div className="bg-gray-950/50 border border-gray-800 rounded-2xl p-5 hover:bg-gray-900 transition-colors shadow-inner relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-transparent to-gray-800/20 rounded-bl-full group-hover:to-gray-800/40 transition-all"></div>
      <p className="text-gray-500 text-sm font-medium tracking-wide uppercase">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${colorClass}`}>{value}</p>
    </div>
  );
}
