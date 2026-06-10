import { useCallback } from "react";
import { AVAILABLE_INDICATORS } from "@/components/strategies/constants";
import { SavedStrategyItem } from "../types";
import { isSavedKey, parseSavedId } from "./useStrategyActions";

interface UseStrategyURLProps {
    router: any;
    pathname: string;
    searchParams: any;
    allStrategies: SavedStrategyItem[];
    setDialogOpen: (open: boolean) => void;
}

export function useStrategyURL({
    router,
    pathname,
    searchParams,
    allStrategies,
    setDialogOpen,
}: UseStrategyURLProps) {
    const applyStrategy = useCallback((selectedStrategy: string) => {
        if (!selectedStrategy) return;
        const params = new URLSearchParams(searchParams.toString());

        if (selectedStrategy === "rsi_cci_wt") {
            params.set("strategy", "rsi_cci_wt");
            params.set("ind", "rsi,cci,wavetrend");
            params.delete("p");
        } else if (isSavedKey(selectedStrategy)) {
            const id = parseSavedId(selectedStrategy);
            const found = allStrategies.find(s => s.id === id);
            if (!found) {
                console.warn(`[useStrategyURL] Strategy not found: ${id}`);
                return;
            }
            params.set("strategy", selectedStrategy);
            params.set("ind", found.indicators.join(","));
            if (found.discoveredParams && Object.keys(found.discoveredParams).length > 0) {
                params.set("p", JSON.stringify(found.discoveredParams));
            } else {
                params.delete("p");
            }
        }

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [searchParams, pathname, router, allStrategies, setDialogOpen]);

    const clearStrategyFromURL = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("strategy");
        params.delete("ind");
        params.delete("p");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
        setDialogOpen(false);
    }, [searchParams, pathname, router, setDialogOpen]);

    const getSelectionLabel = useCallback((selectedStrategy: string) => {
        if (!selectedStrategy) return "Choose a strategy to apply";
        if (selectedStrategy === "rsi_cci_wt") return "RSI + CCI + WaveTrend";
        if (selectedStrategy === "temp") {
            const indParam = searchParams.get("ind") || "";
            const indicatorNames = indParam
                ? indParam.split(",").map((k: string) => {
                    const meta = AVAILABLE_INDICATORS.find(i => i.key === k);
                    return meta?.label ?? k.toUpperCase();
                }).join(' + ')
                : "";
            return `Temporary -- ${indicatorNames}`;
        }
        const id = parseSavedId(selectedStrategy);
        const found = allStrategies.find(s => s.id === id);
        if (found) {
            const wr = found.discoveredWinRate ? ` (${found.discoveredWinRate.toFixed(1)}%)` : '';
            return `${found.name}${wr}`;
        }
        return selectedStrategy;
    }, [allStrategies, searchParams]);

    return {
        applyStrategy,
        clearStrategyFromURL,
        getSelectionLabel,
    };
}
