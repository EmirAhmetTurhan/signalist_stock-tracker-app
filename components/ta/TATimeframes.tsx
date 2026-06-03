"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import TAGlassDialog from "./TAGlassDialog";
import { cn } from "@/lib/utils";
import { Clock, BarChart3, Info, AlertTriangle } from "lucide-react";

// ─── SPRINT 3: 1wk kaldırıldı, sadece 4h ve 1d destekleniyor. ──────────────
// Eski `lib/constants/timeframe-limits.ts` silindiği için bu sabitler
// inline edildi. Yeni timeframe eklenecekse burada INTERVAL_OPTIONS ve
// LIMIT_INFO birlikte güncellenmelidir.
const INTERVAL_OPTIONS = [
    { value: "4h", label: "4 Hours", shortLabel: "4H" },
    { value: "1d", label: "1 Day", shortLabel: "1D" },
] as const;

type IntervalValue = (typeof INTERVAL_OPTIONS)[number]["value"];

const DATA_DEPTH_PRESETS = [0.5, 1, 2, 3, 5, 10] as const;

// Tahmini yıllık veri noktası sayısı
const DATA_POINTS_ESTIMATE: Record<IntervalValue, number> = {
    "1d": 252,
    "4h": 1008,
};

// Her timeframe için veri limiti bilgisi
// (eski `TIMEFRAME_LIMITS[opt.value]` yerine inline edildi)
const LIMIT_INFO: Record<IntervalValue, { maxDays: number; label: string; hasHardCap: boolean }> = {
    "4h": { maxDays: 3650, label: "10 years", hasHardCap: false },
    "1d": { maxDays: 3650, label: "10 years", hasHardCap: false },
};

// ─── Bileşen ──────────────────────────────────────────────────────────────────
export default function TATimeframes() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentInterval = (searchParams.get("interval") || "1d") as IntervalValue;
    const initialYears = searchParams.get("years")
        ? Number(searchParams.get("years"))
        : undefined;

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedInterval, setSelectedInterval] = useState<IntervalValue>(currentInterval);
    const [selectedYears, setSelectedYears] = useState(initialYears ?? 10);

    // Reset local state when dialog opens
    const openDialog = useCallback(() => {
        setSelectedInterval(currentInterval);
        const yrs = searchParams.get("years")
            ? Number(searchParams.get("years"))
            : 10;
        setSelectedYears(yrs);
        setDialogOpen(true);
    }, [currentInterval, searchParams]);

    // Clamp years when interval changes
    const maxYears = useMemo(
        () => (LIMIT_INFO[selectedInterval]?.maxDays ?? 3650) / 365,
        [selectedInterval]
    );

    const limitInfo = LIMIT_INFO[selectedInterval];
    const isHardCapped = limitInfo?.hasHardCap ?? false;
    const estPoints = Math.round(
        (DATA_POINTS_ESTIMATE[selectedInterval] ?? 252) * selectedYears
    );

    const applyTimeframe = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());

        // Set interval
        if (selectedInterval === "1d") {
            params.delete("interval");
        } else {
            params.set("interval", selectedInterval);
        }

        // Set years
        if (selectedYears >= 10) {
            params.delete("years");
        } else {
            params.set("years", String(selectedYears));
        }

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [selectedInterval, selectedYears, searchParams, pathname, router]);

    // Label for the trigger button
    const triggerLabel = useMemo(() => {
        const opt = INTERVAL_OPTIONS.find((o) => o.value === currentInterval);
        return opt?.shortLabel ?? "1D";
    }, [currentInterval]);

    return (
        <>
            <Button
                variant="secondary"
                className="search-btn min-w-[80px]"
                onClick={openDialog}
            >
                <Clock className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                {triggerLabel}
            </Button>

            <TAGlassDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                title="Timeframes"
                icon={<Clock className="w-4 h-4 text-yellow-400" />}
                width="max-w-sm"
                footer={
                    <Button
                        size="sm"
                        className="w-full text-xs font-medium
                            bg-yellow-500/10 border border-yellow-500/30 text-yellow-400
                            hover:bg-yellow-500/20 transition-all"
                        onClick={applyTimeframe}
                    >
                        <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                        Apply — {selectedInterval === "1d" ? "1 Day" : INTERVAL_OPTIONS.find(o => o.value === selectedInterval)?.label ?? selectedInterval}
                        {" · "}
                        {selectedYears >= 10 ? "Max" : `${selectedYears} yr${selectedYears === 1 ? "" : "s"}`}
                    </Button>
                }
            >
                {/* ── Interval Selection ── */}
                <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            Interval
                        </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                        {INTERVAL_OPTIONS.map((opt) => {
                            const isSelected = selectedInterval === opt.value;
                            const limit = LIMIT_INFO[opt.value];
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => setSelectedInterval(opt.value)}
                                    className={cn(
                                        "flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg",
                                        "transition-all duration-150",
                                        isSelected
                                            ? "bg-yellow-500/10 border border-yellow-500/30"
                                            : "hover:bg-white/5 border border-transparent"
                                    )}
                                    title={`${opt.label} — Max ${limit?.label ?? "10 years"}`}
                                >
                                    <span
                                        className={cn(
                                            "text-xs font-semibold",
                                            isSelected ? "text-yellow-400" : "text-gray-400"
                                        )}
                                    >
                                        {opt.shortLabel}
                                    </span>
                                    <span className="text-[9px] text-gray-500 leading-tight text-center">
                                        {limit?.label?.replace("years", "yr") ?? "10yr"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Data Depth ── */}
                <div className="mb-2">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                            <BarChart3 className="w-3 h-3 text-gray-400" />
                            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                                Data Depth
                            </span>
                        </div>
                        <span className="text-xs font-medium text-gray-300">
                            {selectedYears >= 10
                                ? limitInfo?.label ?? "10 years"
                                : `${selectedYears} yr${selectedYears === 1 ? "" : "s"}`}
                        </span>
                    </div>

                    {/* Slider */}
                    <div className="relative mb-2">
                        <input
                            type="range"
                            min={0.5}
                            max={maxYears}
                            step={0.5}
                            value={selectedYears}
                            onChange={(e) =>
                                setSelectedYears(Number(e.target.value))
                            }
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                accent-cyan-500
                                [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:rounded-full
                                [&::-webkit-slider-thumb]:cursor-pointer
                                [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(6,182,212,0.5)]"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                            <span>0.5 yr</span>
                            <span>{maxYears} yr</span>
                        </div>
                    </div>

                    {/* Preset chips */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {DATA_DEPTH_PRESETS.filter((p) => p <= maxYears).map(
                            (preset) => (
                                <button
                                    key={preset}
                                    onClick={() => setSelectedYears(preset)}
                                    className={cn(
                                        "px-2 py-1 text-xs rounded-md transition-colors",
                                        selectedYears === preset
                                            ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                                            : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700/50"
                                    )}
                                >
                                    {preset >= 1 ? `${preset}y` : `${preset}y`}
                                </button>
                            )
                        )}
                    </div>

                    {/* Info row */}
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 bg-gray-800/50 rounded-lg px-2.5 py-1.5 border border-gray-700/50">
                        <div className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            <span>~{estPoints.toLocaleString()} pts</span>
                        </div>
                        <span className="text-gray-600">·</span>
                        <div className="flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            <span>Max {limitInfo?.label ?? "10 years"}</span>
                        </div>
                    </div>
                </div>

                {/* Hard cap warning (kept for future 1h/1M re-introduction) */}
                {isHardCapped && (
                    <div className="flex items-start gap-1.5 text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2.5 py-2 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            <strong>Selected interval</strong> is limited by Yahoo Finance.
                            No Finnhub fallback available.
                        </span>
                    </div>
                )}

                {/* 4h note */}
                {selectedInterval === "4h" && !isHardCapped && (
                    <div className="flex items-start gap-1.5 text-[11px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-2.5 py-2 mt-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            4H candles are aggregated from hourly data.
                        </span>
                    </div>
                )}
            </TAGlassDialog>
        </>
    );
}
