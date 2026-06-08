'use client';

import { ArrowRight, CheckCircle2, AlertTriangle, Play, Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';

type SignalData = {
  indicator: string;
  signal: string;
  description: string;
};

type Props = {
  toolName?: string;
  data: Record<string, unknown>;
  symbol?: string;
  onRunBacktest?: (symbol: string, indicator: string) => void;
};

const SIGNAL_COLORS: Record<string, string> = {
  'STRONG BUY': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'WEAK BUY': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'NEUTRAL': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  'WEAK SELL': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'STRONG SELL': 'bg-red-500/20 text-red-400 border-red-500/30',
  'NO DATA': 'bg-gray-800 text-gray-500 border-gray-700',
};

export default function IndicatorSignalsCard({ data, onRunBacktest }: Props) {
  const router = useRouter();
  const symbol = (data.symbol as string) || '';
  const indicators = (data.indicators as string[]) || [];
  const signals = (data.signals as SignalData[]) || [];
  const overallSignal = (data.overallSignal as string) || 'NEUTRAL';
  const overallScore = typeof data.overallScore === 'number' ? data.overallScore : 0;
  const evaluationText = (data.evaluationText as string) || 'Indicators are showing mixed signals.';

  if (signals.length === 0 && indicators.length === 0) return null;

  const headerIndicators = indicators.map(i => i.toUpperCase()).join(', ');

  return (
    <div className="rounded-xl border border-gray-700/50 bg-[#141414] shadow-xl overflow-hidden mt-2 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/40 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium text-gray-200">Technical Indicators Computed</span>
        </div>
        <div className="text-xs font-mono text-gray-500">
          {symbol.toUpperCase()} &bull; {headerIndicators}
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-5">
        <p className="text-sm text-gray-300">
          Current technical analysis results for <strong className="text-gray-100">{symbol.toUpperCase()}</strong> are detailed below:
        </p>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-[#1a1a1a]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase font-semibold">
              <tr>
                <th className="px-4 py-3 border-b border-gray-800 w-1/4">Indicator</th>
                <th className="px-4 py-3 border-b border-gray-800 w-1/4">Signal</th>
                <th className="px-4 py-3 border-b border-gray-800 w-1/2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50 text-gray-300">
              {signals.map((s) => (
                <tr key={s.indicator} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-200">{s.indicator.toUpperCase()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide border ${SIGNAL_COLORS[s.signal] || SIGNAL_COLORS['NO DATA']}`}>
                      {s.signal}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-400 whitespace-normal leading-relaxed">
                    {s.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* General Evaluation Box */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500/50" />
          
          <div className="flex-1 space-y-2 relative z-10 pl-2">
            <div className="flex items-center gap-3">
              <h4 className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Overall Assessment</h4>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${SIGNAL_COLORS[overallSignal] || SIGNAL_COLORS['NEUTRAL']}`}>
                {overallSignal} (Score: {overallScore})
              </span>
            </div>
            <p className="text-[13px] text-gray-300 leading-relaxed max-w-xl">
              {evaluationText}
            </p>
          </div>

          <div className="shrink-0 relative z-10">
            <button
              onClick={() => router.push(`/ta?symbol=${encodeURIComponent(symbol)}&ind=${indicators.join(',')}`)}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-yellow-500 hover:bg-yellow-400 text-black transition-all shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 hover:-translate-y-0.5"
            >
              Apply Signals to Chart <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
