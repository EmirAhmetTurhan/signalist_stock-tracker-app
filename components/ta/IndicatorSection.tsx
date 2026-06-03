"use client";

import BacktestMonitor from "@/components/panels/BacktestMonitor";
import { SIGNAL_STYLES } from "@/lib/ta";
import type { SignalLabel } from "@/lib/ta";

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
 * This component consolidates those ~11 lines into a single wrapper.
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
    return (
        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
            <div className="flex items-center justify-between mb-4">
                <div className="text-gray-400 flex items-center gap-2">
                    <span className="text-lg font-medium text-gray-200">{displayName}</span>
                    {signalLabel && (
                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabel as SignalLabel] || ""}`}>
                            {signalLabel}
                        </span>
                    )}
                </div>
                <BacktestMonitor indicatorName={backtestName} candles={candles} data={data} />
            </div>
            {children}
        </div>
    );
}
