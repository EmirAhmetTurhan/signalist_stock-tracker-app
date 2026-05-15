"use client";

import { CandlePattern } from "@/lib/indicators/candlePatterns";

interface Props {
    patterns: CandlePattern[];
    interval: string;
}

const SIGNAL_CONFIG = {
    bullish: {
        badge: "bg-emerald-900/50 text-emerald-300 border-emerald-700/60",
        dot: "bg-emerald-400",
        glow: "shadow-[0_0_8px_rgba(52,211,153,0.3)]",
        label: "Bullish",
        icon: "▲",
    },
    bearish: {
        badge: "bg-red-900/50 text-red-300 border-red-700/60",
        dot: "bg-red-400",
        glow: "shadow-[0_0_8px_rgba(248,113,113,0.3)]",
        label: "Bearish",
        icon: "▼",
    },
    neutral: {
        badge: "bg-gray-800 text-gray-400 border-gray-700",
        dot: "bg-yellow-400",
        glow: "",
        label: "Neutral",
        icon: "◆",
    },
};

const STRENGTH_BAR = (strength: number) => {
    const pct = Math.round(strength * 100);
    const color =
        pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-yellow-500" : "bg-gray-500";
    return { pct, color };
};

function formatTime(time: string | number, interval: string): string {
    try {
        const ts = typeof time === "number" ? time * 1000 : Date.parse(time as string) * (time.toString().length <= 10 ? 1000 : 1);
        const d = new Date(ts);
        if (interval === "4h") {
            return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        }
        return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
    } catch {
        return String(time);
    }
}

export default function CandlePatternPanel({ patterns, interval }: Props) {
    if (!patterns || patterns.length === 0) {
        return (
            <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-medium text-gray-200">Candle Pattern Recognition</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">Last 60 candles</span>
                </div>
                <p className="text-gray-500 text-sm">No significant patterns detected in the last 60 candles.</p>
            </div>
        );
    }

    // Sort: most recent first, then by strength
    const sorted = [...patterns].sort((a, b) => {
        const tDiff = Number(b.time) - Number(a.time);
        if (tDiff !== 0) return tDiff;
        return b.strength - a.strength;
    });

    const bullishCount = patterns.filter(p => p.signal === "bullish").length;
    const bearishCount = patterns.filter(p => p.signal === "bearish").length;
    const netBias = bullishCount - bearishCount;

    return (
        <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-medium text-gray-200">Candle Pattern Recognition</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                        Last 60 candles
                    </span>
                </div>

                {/* Bias pill */}
                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${netBias > 0
                    ? "bg-emerald-900/40 text-emerald-300 border-emerald-700"
                    : netBias < 0
                        ? "bg-red-900/40 text-red-300 border-red-700"
                        : "bg-gray-800 text-gray-400 border-gray-700"
                    }`}>
                    {netBias > 0 ? `▲ ${bullishCount}Bu / ${bearishCount}Be — Bullish Bias`
                        : netBias < 0 ? `▼ ${bullishCount}Bu / ${bearishCount}Be — Bearish Bias`
                            : `${bullishCount}Bu / ${bearishCount}Be — Balanced`}
                </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Total Patterns</div>
                    <div className="text-xl font-bold text-white">{patterns.length}</div>
                </div>
                <div className="bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-900/50 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Bullish Signals</div>
                    <div className="text-xl font-bold text-emerald-400">{bullishCount}</div>
                </div>
                <div className="bg-red-950/30 rounded-lg p-2.5 border border-red-900/50 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Bearish Signals</div>
                    <div className="text-xl font-bold text-red-400">{bearishCount}</div>
                </div>
            </div>

            {/* Pattern cards */}
            <div className="flex flex-col gap-2">
                {sorted.map((p, idx) => {
                    const cfg = SIGNAL_CONFIG[p.signal];
                    const { pct, color } = STRENGTH_BAR(p.strength);

                    return (
                        <div
                            key={`${p.time}-${p.pattern}-${idx}`}
                            className={`flex items-start gap-3 p-3 rounded-lg bg-gray-900/50 border border-gray-800/60 
                                hover:border-gray-700 transition-all duration-200 ${cfg.glow}`}
                        >
                            {/* Signal dot */}
                            <div className="flex-shrink-0 mt-1">
                                <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-100">{p.label}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                        {cfg.icon} {cfg.label}
                                    </span>
                                    <span className="text-[10px] text-gray-500 ml-auto">
                                        {formatTime(p.time, interval)}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{p.description}</p>

                                {/* Strength bar */}
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${color}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] text-gray-500 flex-shrink-0">Strength: {pct}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
