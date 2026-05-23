"use client";

import { FractalResult } from "@/lib/indicators/historicalFractals";

interface Props {
    result: FractalResult;
    interval: string;
}

function formatDate(unixSec: number, interval: string): string {
    try {
        const d = new Date(unixSec * 1000);
        if (interval === "4h") {
            return d.toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "2-digit",
                hour: "2-digit", minute: "2-digit",
            });
        }
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return String(unixSec);
    }
}

function SimilarityBar({ value }: { value: number }) {
    const pct = Math.round(value * 100);
    const color =
        pct >= 85 ? "bg-emerald-500" :
            pct >= 70 ? "bg-yellow-500" :
                "bg-gray-500";
    const label =
        pct >= 85 ? "Strong" :
            pct >= 70 ? "Moderate" :
                "Weak";
    return (
        <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-500 w-16 text-right">{label} · {pct}%</span>
        </div>
    );
}

function OutcomeBadge({ pct }: { pct: number }) {
    const isUp = pct > 1;
    const isDown = pct < -1;
    const cls = isUp
        ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/60"
        : isDown
            ? "bg-red-900/50 text-red-300 border-red-700/60"
            : "bg-gray-800 text-gray-400 border-gray-700";
    const icon = isUp ? "▲" : isDown ? "▼" : "◆";
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
            {icon} {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
        </span>
    );
}

export default function HistoricalFractalsPanel({ result, interval }: Props) {
    const { matches, avgOutcomePercent, bullishCount, bearishCount, flatCount, avgSimilarity, lookback, horizon } = result;

    const overallUp = avgOutcomePercent > 1;
    const overallDown = avgOutcomePercent < -1;
    const confidencePct = Math.round(avgSimilarity * 100);
    const confidenceLabel =
        confidencePct >= 85 ? "High" : confidencePct >= 70 ? "Moderate" : "Low";
    const confidenceColor =
        confidencePct >= 85 ? "text-emerald-400" : confidencePct >= 70 ? "text-yellow-400" : "text-gray-400";

    const projectionBigClass = overallUp
        ? "text-emerald-400"
        : overallDown
            ? "text-red-400"
            : "text-gray-400";

    return (
        <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">

            {/* ─── Header ─── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-medium text-gray-200">Historical Fractals</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                        Last {lookback} candles vs. history · {horizon}-candle outlook
                    </span>
                </div>
                <div className={`text-xs font-semibold px-3 py-1 rounded-full border ${confidencePct >= 85
                        ? "bg-emerald-900/30 border-emerald-800 text-emerald-300"
                        : confidencePct >= 70
                            ? "bg-yellow-900/30 border-yellow-800 text-yellow-300"
                            : "bg-gray-800 border-gray-700 text-gray-400"
                    }`}>
                    {confidenceLabel} Confidence
                </div>
            </div>

            {/* ─── Stats row ─── */}
            <div className="grid grid-cols-4 gap-2 mb-4">
                {/* Projected move */}
                <div className="col-span-2 bg-gray-900/60 rounded-xl p-3 border border-gray-800 flex flex-col justify-between">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Avg. Projected Move</div>
                    <div className={`text-3xl font-bold ${projectionBigClass}`}>
                        {avgOutcomePercent > 0 ? "+" : ""}{avgOutcomePercent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">over next {horizon} candles</div>
                </div>

                {/* Matches */}
                <div className="bg-gray-900/60 rounded-xl p-3 border border-gray-800 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Matches</div>
                    <div className="text-2xl font-bold text-white">{matches.length}</div>
                    <div className="text-[10px] text-gray-500 mt-1">similar periods</div>
                </div>

                {/* Confidence */}
                <div className="bg-gray-900/60 rounded-xl p-3 border border-gray-800 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Avg. Similarity</div>
                    <div className={`text-2xl font-bold ${confidenceColor}`}>{confidencePct}%</div>
                    <div className="text-[10px] text-gray-500 mt-1">shape match</div>
                </div>
            </div>

            {/* ─── Outcome breakdown ─── */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-900/50 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Bullish After</div>
                    <div className="text-xl font-bold text-emerald-400">{bullishCount}<span className="text-xs text-gray-500">/{matches.length}</span></div>
                </div>
                <div className="bg-red-950/30 rounded-lg p-2.5 border border-red-900/50 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Bearish After</div>
                    <div className="text-xl font-bold text-red-400">{bearishCount}<span className="text-xs text-gray-500">/{matches.length}</span></div>
                </div>
                <div className="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Flat After</div>
                    <div className="text-xl font-bold text-gray-400">{flatCount}<span className="text-xs text-gray-500">/{matches.length}</span></div>
                </div>
            </div>

            {/* ─── Ghost line notice ─── */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-950/20 border border-amber-800/30">
                <div className="w-8 h-0.5 border-t-2 border-dashed border-amber-400/70 flex-shrink-0" />
                <span className="text-xs text-amber-400/80">
                    Weighted-average projected path is drawn as a dashed line on the chart above
                </span>
            </div>

            {/* ─── Match list ─── */}
            <div className="flex flex-col gap-2">
                {matches.map((m, i) => (
                    <div
                        key={`${m.startTime}-${i}`}
                        className="flex items-start gap-3 p-3 rounded-lg bg-gray-900/50 border border-gray-800/60 hover:border-gray-700 transition-all duration-200"
                    >
                        {/* Rank */}
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400">
                            {i + 1}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-200">
                                    {formatDate(m.startTime, interval)} — {formatDate(m.endTime, interval)}
                                </span>
                                <OutcomeBadge pct={m.outcomePercent} />
                            </div>
                            <SimilarityBar value={m.similarity} />
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Footer disclaimer ─── */}
            <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
                Past performance is not indicative of future results. Historical fractal analysis is for informational purposes only.
            </p>
        </div>
    );
}
