"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Sparkles, Loader2, Lightbulb, Play, RotateCcw, ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Timeframe } from "@/lib/ta/types";
import DeepDiscoveryProgress from "../ta/discovery/DeepDiscoveryProgress";
import DeepDiscoveryResults from "../ta/discovery/DeepDiscoveryResults";
import { DISCOVERY_POOL } from "@/lib/ta/registry/indicator-registry";
import { useNotificationCenter } from "@/components/providers/NotificationCenter";
// SPRINT 3: timeframe-limits.ts silindi, inline LIMIT_INFO kullanılıyor.
type TimeframeWithLimits = Timeframe | string; // '1d' | '4h' only at runtime
const LIMIT_INFO: Record<Timeframe, { maxDays: number; label: string; hasHardCap: boolean }> = {
    "1d": { maxDays: 3650, label: "10 years", hasHardCap: false },
    "4h": { maxDays: 3650, label: "10 years", hasHardCap: false },
};

interface StrategyDiscoveryDialogProps {
    symbol?: string; // e.g. "AAPL"
    interval?: Timeframe;
    userId?: string;
    /** Called when user clicks "Apply" on a discovered strategy */
    onApply?: (strategy: { indicators: string[]; params: Record<string, number>; winRate: number; totalSignals?: number }) => void;
    /** For the trigger button */
    children?: React.ReactNode;
    /** External open state control (optional — for use from TAStrategiesButton) */
    open?: boolean;
    /** External onOpenChange callback (optional) */
    onOpenChange?: (open: boolean) => void;

    // Ignored in Deep Discovery but kept for compatibility
    candles?: any[];
    allData?: any;
    mode?: any;
}

export default function StrategyDiscoveryDialog({
    symbol = "BTCUSDT",
    interval = "1d",
    userId,
    onApply,
    children,
    open: externalOpen,
    onOpenChange: externalOnOpenChange,
}: StrategyDiscoveryDialogProps) {
    const { refresh } = useNotificationCenter();
    const [internalOpen, setInternalOpen] = useState(false);
    const open = externalOpen !== undefined ? externalOpen : internalOpen;
    const setOpen = externalOnOpenChange ?? setInternalOpen;

    const [isDiscovering, setIsDiscovering] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [discoveryResults, setDiscoveryResults] = useState<any[] | null>(null);
    // Click guard: prevents double-trigger from rapid clicks before React re-renders
    const isRequestingRef = useRef(false);

    // Determine max allowed years for the current interval
    const maxYears = useMemo(() => {
        // SPRINT 3: inline LIMIT_INFO (TIMEFRAME_LIMITS silindi)
        const limit = LIMIT_INFO[interval as Timeframe];
        const maxDays = limit?.maxDays ?? 3650;
        // Convert maxDays to years, cap at reasonable max
        return Math.min(Math.round(maxDays / 365), 10);
    }, [interval]);

    // User-selected years range (default to max)
    const [selectedYears, setSelectedYears] = useState(maxYears);
    const [applyMarketFilter, setApplyMarketFilter] = useState(false);

    // Sync selectedYears when maxYears changes (e.g. interval switch)
    useEffect(() => {
        setSelectedYears(maxYears);
    }, [maxYears]);

    // Build year options from 1 to maxYears
    const yearsOptions = useMemo(
        () => Array.from({ length: maxYears }, (_, i) => i + 1),
        [maxYears],
    );

    const handleDiscover = async () => {
        // Guard: prevent concurrent API calls (synchronous check before async state update)
        if (isRequestingRef.current) return;

        // Guard: if a job is already running, don't clear it — just inform user
        if (jobId) {
            toast.info("A discovery job is already in progress. Please wait for it to complete.", {
                description: `Job ID: ${jobId.slice(0, 12)}...`,
            });
            return;
        }

        isRequestingRef.current = true;
        setIsDiscovering(true);
        setDiscoveryResults(null);

        try {
            const res = await fetch("/api/discovery/deep-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol, interval, years: selectedYears, applyMarketFilter }),
            });

            const data = await res.json();

            if (!res.ok) {
                // 409: Job already running — show existing progress instead of error
                if (res.status === 409 && data.jobId) {
                    toast.warning(data.message || "A discovery job is already running for this account.", {
                        description: "Showing existing job progress.",
                    });
                    setJobId(data.jobId);
                    setIsDiscovering(false);
                    return;
                }
                throw new Error(data.error || data.message || "Failed to start discovery");
            }

            setJobId(data.jobId);
            try {
                refresh();
            } catch (e) {
                console.warn("[StrategyDiscoveryDialog] Failed to refresh notifications:", e);
            }
            // Close dialog after job starts so user can navigate freely
            setOpen(false);
            toast.success("Discovery started", {
                description: `${symbol} için strateji keşfi arka planda başlatıldı. Sonuçlar bildirim olarak gelecek.`,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unexpected error occurred";
            console.error("[StrategyDiscoveryDialog] Discovery failed to start:", err);
            toast.error("Failed to start discovery", {
                description: message,
            });
            setIsDiscovering(false);
        } finally {
            isRequestingRef.current = false;
        }
    };

    const handleJobComplete = (jobData: any) => {
        setIsDiscovering(false);
        // Always set results (even empty array) to exit the progress view.
        // If discoveryResults is missing/null/undefined, we fallback to empty array
        // and DeepDiscoveryResults will render an appropriate empty state.
        const results = jobData?.discoveryResults;
        setDiscoveryResults(Array.isArray(results) ? results : []);
        // Clear jobId so the progress bar disappears and results view renders
        setJobId(null);

        if (!results || (Array.isArray(results) && results.length === 0)) {
            console.warn("[StrategyDiscoveryDialog] Job completed but no discoveryResults found");
        }
    };

    const handleJobError = (error: string) => {
        setIsDiscovering(false);
        setJobId(null);
        // Set empty results to exit progress view — user sees empty state with error
        setDiscoveryResults([]);
        console.error("Discovery failed:", error);
    };

    const handleApply = useCallback((ds: any) => {
        if (onApply) {
            // SAFE: Use optional chaining and null-coalescing for all fields
            onApply({
                indicators: ds?.combo ?? ds?.indicators ?? [],
                params: ds?.bestParams ?? ds?.params ?? {},
                winRate: ds?.validatedWinRate ?? ds?.winRate ?? 0,
                totalSignals: ds?.totalSignals ?? 0,
            });
        }
        setOpen(false);
    }, [onApply, setOpen]);

    // Reset state when modal is closed
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            // Wait for exit animation before clearing state
            setTimeout(() => {
                setJobId(null);
                setDiscoveryResults(null);
                setIsDiscovering(false);
            }, 300);
        }
        setOpen(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {/* Only render DialogTrigger when NOT externally controlled */}
            {externalOpen === undefined && (
                <DialogTrigger asChild>
                    {children ?? (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs border-violet-800/40 text-violet-300 hover:bg-violet-900/30">
                            <Sparkles className="w-3.5 h-3.5" />
                            Discover Strategy
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="sm:max-w-[700px] bg-gray-950 border-gray-800 text-gray-100 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-400">
                        <Sparkles className="w-5 h-5 text-amber-500" />
                        Deep Discovery Engine
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Intro / Settings Header */}
                    {!jobId && !discoveryResults && (
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800/50 border border-gray-800 rounded-xl p-5 text-center space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                                <Lightbulb className="w-6 h-6 text-amber-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-100">
                                Find the optimal strategy for <span className="text-amber-400">{symbol}</span> ({interval})
                            </h3>
                            <p className="text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
                                The engine will analyze <span className="text-gray-200 font-medium">{selectedYears} years</span> of historical data,
                                perform combinatorial search across <span className="text-gray-200 font-medium">{DISCOVERY_POOL.length}</span> indicators,
                                and run 5-fold cross-validation to prevent overfitting.
                            </p>

                            {/* Years Range Selector */}
                            <div className="flex items-center justify-center gap-3 pt-2">
                                <label className="text-xs text-gray-400">Data Range:</label>
                                <div className="relative inline-flex">
                                    <select
                                        value={selectedYears}
                                        onChange={(e) => setSelectedYears(Number(e.target.value))}
                                        className="appearance-none bg-gray-800 border border-gray-700/60 rounded-lg pl-3 pr-8 py-1.5 text-sm text-gray-200 font-medium focus:outline-none focus:border-amber-500/50 cursor-pointer hover:bg-gray-750 transition-colors"
                                    >
                                        {yearsOptions.map((y) => (
                                            <option key={y} value={y}>
                                                {y} {y === 1 ? 'Year' : 'Years'}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                                </div>
                            </div>

                            {/* Broad Market Filter Toggle */}
                            <div className="flex flex-col items-center justify-center pt-2 pb-1">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-semibold text-gray-300 cursor-pointer select-none" onClick={() => setApplyMarketFilter(!applyMarketFilter)}>
                                        Broad Market Filter
                                    </label>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={applyMarketFilter}
                                        onClick={() => setApplyMarketFilter(!applyMarketFilter)}
                                        className={cn(
                                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                                            applyMarketFilter ? "bg-amber-500" : "bg-gray-700"
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                applyMarketFilter ? "translate-x-4" : "translate-x-0"
                                            )}
                                        />
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400/80 mt-1.5 max-w-[260px] leading-tight">
                                    Only discover strategies that survive Bear Market filters.
                                </p>
                            </div>

                            <div className="pt-4">
                                <Button
                                    onClick={handleDiscover}
                                    disabled={isDiscovering}
                                    className="w-full sm:w-auto min-w-[200px] gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all"
                                    size="lg"
                                >
                                    {isDiscovering ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Initializing...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-5 h-5 fill-current" />
                                            Start Deep Discovery
                                        </>
                                    )}
                                </Button>
                                <p className="text-[10px] text-gray-500 mt-3 flex items-center justify-center gap-1.5">
                                    <Loader2 className="w-3 h-3 text-gray-600 animate-spin-slow" />
                                    This process runs in the background and may take a few minutes.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Progress tracking */}
                    {jobId && !discoveryResults && (
                        <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <DeepDiscoveryProgress
                                jobId={jobId}
                                onComplete={handleJobComplete}
                                onError={handleJobError}
                            />

                            <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-3 mt-4 text-xs text-blue-300/80 flex items-start gap-2">
                                <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                <div>
                                    <strong className="text-blue-300 block mb-1">Background Execution Enabled</strong>
                                    You can safely close this dialog. The discovery engine is running on our secure servers.
                                    You'll receive a notification when it completes.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Results Table */}
                    {discoveryResults && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <DeepDiscoveryResults
                                results={discoveryResults}
                                totalSaved={10} // Top 10 is saved by job
                                onApply={handleApply}
                            />

                            <div className="flex justify-center mt-6">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setDiscoveryResults(null);
                                        setJobId(null);
                                    }}
                                    className="text-xs text-gray-400 hover:text-white border-gray-800 hover:bg-gray-800"
                                >
                                    <RotateCcw className="w-3 h-3 mr-1.5" />
                                    Run New Discovery
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-gray-800 pt-3 mt-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenChange(false)}
                        className="text-gray-400 hover:text-gray-200 text-[11px]"
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
