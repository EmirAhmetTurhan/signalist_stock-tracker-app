"use client";

import { useState } from "react";
import BacktestMonitor from "@/components/panels/BacktestMonitor";
import { SIGNAL_STYLES } from "@/lib/ta";
import type { SignalLabel } from "@/lib/ta";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * IndicatorSection — wrapper that eliminates ~11 lines of boilerplate per indicator block.
 *
 * Each indicator in page.tsx renders:
 *   <div className="mt-4 p-4 border ...">
 *     <div className="flex items-center justify-between mb-4">
 *       <div className="text-gray-400 flex items-center gap-2">
 *         <span className="...">{displayName}</span>
 *         {signalLabel && <span className={`...${SIGNAL_STYLES[sig]}`}>{signalLabel}</span>}
 *       </div>
 *       <BacktestMonitor ... />
 *     </div>
 *     {chart}
 *   </div>
 *
 * This component consolidates those ~11 lines into a single wrapper
 * and adds a collapse/expand toggle so the user can hide indicator
 * charts they don't need to see at the moment.
 */
type Props = {
    displayName: string;
    signalLabel?: string;
    backtestName: string;
    candles: CandleDataPoint[];
    data: unknown;
    children: React.ReactNode;
};

export default function IndicatorSection({
    displayName,
    signalLabel,
    backtestName,
    candles,
    data,
    children,
}: Props) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="mt-4 border border-gray-800 rounded-xl bg-gray-950/20 overflow-hidden">
            {/* Header row — click anywhere to toggle */}
            <div
                className="flex items-center justify-between px-4 pt-4 pb-3 cursor-pointer hover:bg-gray-900/30 transition-colors"
                onClick={() => setIsExpanded(prev => !prev)}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Chevron — rotates when collapsed */}
                    <ChevronDown
                        className={cn(
                            "w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200",
                            isExpanded ? "rotate-0" : "-rotate-90"
                        )}
                    />
                    <span className="text-lg font-medium text-gray-200 truncate">{displayName}</span>
                    {signalLabel && (
                        <span
                            className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabel as SignalLabel] || ""}`}
                        >
                            {signalLabel}
                        </span>
                    )}
                </div>

                {/* Backtest monitor — stop click propagation so it doesn't toggle collapse */}
                <div onClick={e => e.stopPropagation()}>
                    <BacktestMonitor indicatorName={backtestName} candles={candles} data={data} />
                </div>
            </div>

            {/* Collapsible chart area */}
            <div
                className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isExpanded ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"
                )}
            >
                <div className="px-4 pb-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
