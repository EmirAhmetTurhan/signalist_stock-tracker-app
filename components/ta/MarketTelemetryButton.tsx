"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { BarChart3, X } from "lucide-react";
import MarketTelemetryPanel from "./MarketTelemetryPanel";
import { cn } from "@/lib/utils";

interface MarketTelemetryButtonProps {
    symbol: string;
    interval: string;
    years?: number;
}

export default function MarketTelemetryButton({ symbol, interval, years }: MarketTelemetryButtonProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const telemetryParam = searchParams.get("telemetry");
    const [showTelemetry, setShowTelemetry] = useState(telemetryParam === "1");

    // Sync with URL param changes
    useEffect(() => {
        setShowTelemetry(telemetryParam === "1");
    }, [telemetryParam]);

    const toggleTelemetry = () => {
        const newShow = !showTelemetry;
        setShowTelemetry(newShow);
        // Update URL asynchronously (doesn't block UI)
        const params = new URLSearchParams(searchParams.toString());
        if (newShow) {
            params.set("telemetry", "1");
        } else {
            params.delete("telemetry");
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    if (!symbol) return null;

    return (
        <>
            <div className="flex items-center gap-2">
                {showTelemetry && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-gray-400 hover:text-red-400"
                        onClick={() => {
                            const params = new URLSearchParams(searchParams.toString());
                            params.delete("telemetry");
                            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
                        }}
                    >
                        <X className="w-3.5 h-3.5 mr-1" />
                        Close Telemetry
                    </Button>
                )}
                <Button
                    variant="secondary"
                    className={cn(
                        "search-btn",
                        showTelemetry && "border-violet-500/40 text-violet-400"
                    )}
                    onClick={toggleTelemetry}
                >
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5 opacity-60" />
                    Market Telemetry
                    {showTelemetry && (
                        <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                    )}
                </Button>
            </div>

            {showTelemetry && (
                <div className="mt-3">
                    <MarketTelemetryPanel symbol={symbol} interval={interval} years={years} />
                </div>
            )}
        </>
    );
}
