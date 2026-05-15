"use client";

import { SRResult, SRLevel, TradeSetup } from "@/lib/indicators/supportResistance";

interface Props {
    result: SRResult;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StrengthBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full ${color}`}
                style={{ width: `${Math.round(value * 100)}%` }}
            />
        </div>
    );
}

function PriceBadge({ price }: { price: number }) {
    return (
        <span className="font-mono text-xs font-semibold text-gray-200">
            ${price.toFixed(2)}
        </span>
    );
}

function RRCard({ setup, direction }: { setup: TradeSetup; direction: "long" | "short" }) {
    const isLong = direction === "long";
    const rrGood = setup.rrRatio >= 2;
    const rrOk = setup.rrRatio >= 1;
    const rrColor = rrGood ? "text-emerald-400" : rrOk ? "text-yellow-400" : "text-red-400";
    const rrBg = rrGood
        ? "bg-emerald-950/40 border-emerald-800/60"
        : rrOk
            ? "bg-yellow-950/40 border-yellow-800/60"
            : "bg-red-950/40 border-red-800/60";

    const tpColor = isLong ? "text-emerald-400" : "text-red-400";
    const slColor = isLong ? "text-red-400" : "text-emerald-400";

    const rrLabel = rrGood ? "Favourable" : rrOk ? "Acceptable" : "Poor";

    return (
        <div className={`rounded-xl p-3 border ${rrBg} flex flex-col gap-2`}>
            {/* Direction header */}
            <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${isLong ? "text-emerald-400" : "text-red-400"}`}>
                    {isLong ? "▲ Long" : "▼ Short"}
                </span>
                <div className={`flex items-baseline gap-1 ${rrColor}`}>
                    <span className="text-[10px] text-gray-500">R:R</span>
                    <span className="text-lg font-black">1 : {setup.rrRatio.toFixed(2)}</span>
                    <span className={`text-[9px] font-semibold ml-1 opacity-80`}>{rrLabel}</span>
                </div>
            </div>

            {/* Price ladder */}
            <div className="relative flex flex-col gap-0.5">
                {/* TP */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 w-10">TP</span>
                    <span className={`font-mono font-bold ${tpColor}`}>${setup.tp.toFixed(2)}</span>
                    <span className={`${tpColor} font-semibold`}>+{setup.tpPct.toFixed(2)}%</span>
                </div>

                {/* Visual zone bar */}
                <div className="relative my-1 mx-10">
                    {/* Profit zone */}
                    <div className={`h-5 rounded-t-md opacity-20 ${isLong ? "bg-emerald-500" : "bg-red-500"}`} />
                    {/* Entry line */}
                    <div className="relative flex items-center">
                        <div className="absolute left-0 right-0 h-px bg-gray-400" />
                        <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white ring-2 ring-gray-400 z-10" />
                    </div>
                    {/* Risk zone */}
                    <div className={`h-5 rounded-b-md opacity-20 ${isLong ? "bg-red-500" : "bg-emerald-500"}`} />
                </div>

                {/* Entry */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 w-10">Entry</span>
                    <span className="font-mono font-bold text-gray-200">${setup.entry.toFixed(2)}</span>
                    <span className="text-gray-500">current</span>
                </div>

                {/* SL */}
                <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 w-10">SL</span>
                    <span className={`font-mono font-bold ${slColor}`}>${setup.sl.toFixed(2)}</span>
                    <span className={`${slColor} font-semibold`}>-{setup.slPct.toFixed(2)}%</span>
                </div>
            </div>
        </div>
    );
}

function LevelRow({ level, currentPrice }: { level: SRLevel; currentPrice: number }) {
    const isSupport = level.type === "support";
    const typeColor = isSupport ? "text-emerald-400" : "text-red-400";
    const typeBg = isSupport
        ? "bg-emerald-900/40 border-emerald-700/50"
        : "bg-red-900/40 border-red-700/50";
    const barColor = isSupport ? "bg-emerald-500" : "bg-red-500";
    const absDist = Math.abs(level.distancePct);
    const distColor = absDist < 2 ? "text-yellow-400" : "text-gray-400";

    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-900/40 border border-gray-800/50 hover:border-gray-700 transition-all">
            {/* Type badge */}
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border flex-shrink-0 ${typeBg} ${typeColor}`}>
                {isSupport ? "S" : "R"}
            </span>

            {/* Price */}
            <PriceBadge price={level.price} />

            {/* Distance */}
            <span className={`text-[10px] font-semibold flex-shrink-0 ${distColor}`}>
                {level.distancePct > 0 ? "+" : ""}{level.distancePct.toFixed(2)}%
            </span>

            {/* Strength bar */}
            <StrengthBar value={level.strength} color={barColor} />

            {/* Touches */}
            <span className="text-[10px] text-gray-500 flex-shrink-0 w-10 text-right">
                {level.touches}×
            </span>
        </div>
    );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function SRPanel({ result }: Props) {
    const {
        levels, currentPrice,
        nearestSupport, nearestResistance,
        longSetup, shortSetup,
    } = result;

    const supportCount = levels.filter(l => l.type === "support").length;
    const resistanceCount = levels.filter(l => l.type === "resistance").length;

    // Price zone visual percentages
    const zoneHigh = nearestResistance?.price ?? currentPrice * 1.05;
    const zoneLow = nearestSupport?.price ?? currentPrice * 0.95;
    const zoneRange = zoneHigh - zoneLow || 1;
    const currentPct = ((zoneHigh - currentPrice) / zoneRange) * 100;

    return (
        <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">

            {/* ─── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-lg font-medium text-gray-200">Support &amp; Resistance</span>
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
                        {levels.length} levels · last 300 candles
                    </span>
                </div>
                <div className="flex gap-1.5 text-[10px]">
                    <span className="bg-emerald-900/40 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        {supportCount}S
                    </span>
                    <span className="bg-red-900/40 border border-red-800 text-red-300 px-2 py-0.5 rounded-full font-bold">
                        {resistanceCount}R
                    </span>
                </div>
            </div>

            {/* ─── Price Zone Visual ───────────────────────────────────────── */}
            {nearestSupport && nearestResistance && (
                <div className="mb-4 p-3 rounded-xl bg-gray-900/50 border border-gray-800">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Current Price Zone</div>
                    <div className="relative flex items-stretch gap-3">
                        {/* Vertical bar */}
                        <div className="relative w-3 flex-shrink-0">
                            {/* Resistance top (red) */}
                            <div
                                className="w-full bg-red-500/30 rounded-t-sm"
                                style={{ height: `${currentPct}%`, minHeight: "8px" }}
                            />
                            {/* Current marker */}
                            <div className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)] z-10"
                                style={{ top: `calc(${currentPct}% - 6px)` }}
                            />
                            {/* Support bottom (green) */}
                            <div
                                className="w-full bg-emerald-500/30 rounded-b-sm"
                                style={{ height: `${100 - currentPct}%`, minHeight: "8px" }}
                            />
                        </div>

                        {/* Labels */}
                        <div className="flex flex-col justify-between flex-1 gap-1">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-red-400 font-semibold">Resistance</span>
                                <span className="font-mono text-xs font-bold text-red-400">${nearestResistance.price.toFixed(2)}</span>
                                <span className="text-[10px] text-red-400">+{Math.abs(nearestResistance.distancePct).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-gray-400">Current</span>
                                <span className="font-mono text-xs font-bold text-white">${currentPrice.toFixed(2)}</span>
                                <span className="text-[10px] text-gray-500">—</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-emerald-400 font-semibold">Support</span>
                                <span className="font-mono text-xs font-bold text-emerald-400">${nearestSupport.price.toFixed(2)}</span>
                                <span className="text-[10px] text-emerald-400">-{Math.abs(nearestSupport.distancePct).toFixed(2)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── R:R Setups ──────────────────────────────────────────────── */}
            {(longSetup || shortSetup) && (
                <div className="mb-4">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Risk / Reward Calculator</div>
                    <div className="grid grid-cols-2 gap-2">
                        {longSetup && <RRCard setup={longSetup} direction="long" />}
                        {shortSetup && <RRCard setup={shortSetup} direction="short" />}
                    </div>
                </div>
            )}

            {/* ─── Chart note ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-900/40 border border-gray-700/30">
                <div className="flex gap-1 flex-shrink-0">
                    <div className="w-4 h-0 border-t border-dashed border-emerald-400/70" />
                    <div className="w-4 h-0 border-t-2 border-red-400/70" />
                </div>
                <span className="text-xs text-gray-500">
                    Support (green dashed) and resistance (red dashed) lines are drawn on the chart above
                </span>
            </div>

            {/* ─── Level list ──────────────────────────────────────────────── */}
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">All Detected Levels</div>
            <div className="flex flex-col gap-1.5">
                {levels.map((level, i) => (
                    <LevelRow key={`${level.price.toFixed(4)}-${i}`} level={level} currentPrice={currentPrice} />
                ))}
            </div>

            <p className="text-[10px] text-gray-600 mt-3 leading-relaxed">
                Levels are detected from swing pivot clusters over the last 300 candles.
                Strength reflects touch count and recency. Not financial advice.
            </p>
        </div>
    );
}
