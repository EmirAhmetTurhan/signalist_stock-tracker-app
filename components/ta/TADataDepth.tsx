"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
// SPRINT 3: timeframe-limits.ts silindi, inline LIMIT_INFO kullanılıyor.
const LIMIT_INFO: Record<string, { maxDays: number; label: string; hasHardCap: boolean }> = {
    "1d": { maxDays: 3650, label: "10 years", hasHardCap: false },
    "4h": { maxDays: 3650, label: "10 years", hasHardCap: false },
};
import { cn } from "@/lib/utils";

const DATA_DEPTH_PRESETS = [0.5, 1, 2, 3, 5, 10] as const;

export default function TADataDepth() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const interval = searchParams.get("interval") || "1d";
    const initialYears = searchParams.get("years")
        ? Number(searchParams.get("years"))
        : undefined;

    const [years, setYears] = useState(initialYears ?? 10);
    const [open, setOpen] = useState(false);

    // When interval changes, clamp the current value
    useEffect(() => {
        // SPRINT 3: inline LIMIT_INFO
        const limit = LIMIT_INFO[interval];
        if (limit) {
            const maxYears = limit.maxDays / 365;
            setYears((prev) => Math.min(prev, maxYears));
        }
    }, [interval]);

    // SPRINT 3: inline LIMIT_INFO
    const maxYears = (LIMIT_INFO[interval]?.maxDays ?? 3650) / 365;
    const limitLabel = LIMIT_INFO[interval]?.label ?? "10 years";
    const hasCap = LIMIT_INFO[interval]?.hasHardCap ?? false;

    const applyDepth = useCallback((value: number) => {
        const clamped = Math.min(value, maxYears);
        setYears(clamped);
        setOpen(false);

        const params = new URLSearchParams(searchParams.toString());
        if (clamped >= 10) {
            params.delete("years");
        } else {
            params.set("years", String(clamped));
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [maxYears, searchParams, pathname, router]);

    const displayedLabel = years >= 10 ? "10 yrs" : `${years} yr${years === 1 ? "" : "s"}`;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="secondary"
                    className="search-btn min-w-[80px] text-xs"
                    title={`Data depth: ${displayedLabel} (Max: ${limitLabel})`}
                >
                    <svg
                        className="w-3.5 h-3.5 mr-1 opacity-60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                    </svg>
                    {displayedLabel}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-gray-900 border-gray-700 text-gray-200">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">
                            Data Depth
                        </span>
                        <span className="text-sm font-medium text-gray-200">
                            {displayedLabel}
                        </span>
                    </div>

                    {/* Slider */}
                    <div className="relative">
                        <input
                            type="range"
                            min={0.5}
                            max={maxYears}
                            step={0.5}
                            value={years}
                            onChange={(e) => setYears(Number(e.target.value))}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer
                                accent-violet-500 [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:rounded-full
                                [&::-webkit-slider-thumb]:cursor-pointer
                                [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(139,92,246,0.5)]"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                            <span>0.5</span>
                            <span>{maxYears} yr</span>
                        </div>
                    </div>

                    {/* Preset chips */}
                    <div className="flex flex-wrap gap-1.5">
                        {DATA_DEPTH_PRESETS.filter((p) => p <= maxYears).map((preset) => (
                            <button
                                key={preset}
                                onClick={() => applyDepth(preset)}
                                className={cn(
                                    "px-2 py-1 text-xs rounded-md transition-colors",
                                    years === preset
                                        ? "bg-violet-500/10 text-violet-400 border border-violet-500/30"
                                        : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700/50"
                                )}
                            >
                                {preset >= 1 ? `${preset}y` : `${preset}y`}
                            </button>
                        ))}
                    </div>

                    {/* Limit warning */}
                    {hasCap && (
                        <div className="flex items-start gap-1.5 text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2 py-1.5">
                            <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <span>Max {limitLabel} for this timeframe</span>
                        </div>
                    )}

                    {/* Apply button */}
                    <button
                        onClick={() => applyDepth(years)}
                        className="w-full py-1.5 text-sm font-medium rounded-md
                            bg-violet-500/10 border border-violet-500/30 text-violet-400
                            hover:bg-violet-500/20 transition-colors"
                    >
                        Apply
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
