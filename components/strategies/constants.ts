import type { CustomStrategy } from "./types";

export const AVAILABLE_INDICATORS = [
    {
        key: "rsi",
        label: "RSI",
        full: "Relative Strength Index",
        description: "RSI > MA → AL (< 62), RSI < MA → SAT (> 38)",
        color: "#a78bfa",
    },
    {
        key: "cci",
        label: "CCI",
        full: "Commodity Channel Index",
        description: "CCI > 0 → AL, CCI < 0 → SAT (sıfır çizgisi bazlı)",
        color: "#34d399",
    },
    {
        key: "wavetrend",
        label: "WaveTrend",
        full: "WaveTrend Oscillator",
        description: "WT1 > WT2 ve < 55 → AL, WT1 < WT2 ve > -55 → SAT",
        color: "#60a5fa",
    },
    {
        key: "macd",
        label: "MACD",
        full: "Moving Average Convergence Divergence",
        description: "MACD > Signal → AL, MACD < Signal → SAT",
        color: "#f59e0b",
    },
    {
        key: "stochrsi",
        label: "StochRSI",
        full: "Stochastic RSI",
        description: "K > D ve < 80 → AL, K < D ve > 20 → SAT",
        color: "#f472b6",
    },
    {
        key: "dmi",
        label: "DMI",
        full: "Directional Movement Index",
        description: "+DI > -DI ve ADX > 20 → AL, -DI > +DI → SAT",
        color: "#fb923c",
    },
    {
        key: "smi",
        label: "SMI",
        full: "Stochastic Momentum Index",
        description: "SMI > Signal → AL, SMI < Signal → SAT",
        color: "#2dd4bf",
    },
    {
        key: "ao",
        label: "AO",
        full: "Awesome Oscillator",
        description: "AO > 0 ve yükseliyor → AL, AO < 0 ve düşüyor → SAT",
        color: "#818cf8",
    },
    {
        key: "mfi",
        label: "MFI",
        full: "Money Flow Index",
        description: "MFI < 20 → AL (aşırı satış), MFI > 80 → SAT (aşırı alım)",
        color: "#4ade80",
    },
    {
        key: "wpr",
        label: "WPR",
        full: "Williams %R",
        description: "WPR < -80 → AL (oversold), WPR > -20 → SAT (overbought)",
        color: "#c084fc",
    },
    {
        key: "di",
        label: "DI",
        full: "Demand Index",
        description: "DI > 0 ve artıyor → AL, DI < 0 ve azalıyor → SAT",
        color: "#38bdf8",
    },
    {
        key: "cmf",
        label: "CMF",
        full: "Chaikin Money Flow",
        description: "CMF > 0.05 → AL (para girişi), CMF < -0.05 → SAT",
        color: "#fb7185",
    },
    {
        key: "ad",
        label: "A/D",
        full: "Accumulation / Distribution",
        description: "A/D SMA'yı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#fbbf24",
    },
    {
        key: "netvol",
        label: "NetVol",
        full: "Net Volume",
        description: "Net hacim > 0 ve artıyor → AL, < 0 ve azalıyor → SAT",
        color: "#a3e635",
    },
    {
        key: "madr",
        label: "MADR",
        full: "Moving Average Distance Ratio",
        description: "MADR 0'ı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#e879f9",
    },
    {
        key: "alma",
        label: "ALMA",
        full: "Arnaud Legoux Moving Average",
        description: "Fiyat ALMA'yı yukarı kesiyor → AL, aşağı kesiyor → SAT",
        color: "#fbbf24",
    },
    {
        key: "bb",
        label: "BB",
        full: "Bollinger Bantları",
        description: "Fiyat Alt Bandı yukarı kesiyor → AL, Üst Bandı aşağı kesiyor → SAT",
        color: "#3b82f6",
    },
] as const;

export type IndicatorKey = typeof AVAILABLE_INDICATORS[number]["key"];

export const STORAGE_KEY = "signalist_custom_strategies";

export function loadCustomStrategies(): CustomStrategy[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

export function saveCustomStrategies(strategies: CustomStrategy[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
}
