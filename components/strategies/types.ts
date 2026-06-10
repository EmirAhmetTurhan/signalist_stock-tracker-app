import type { StrategyMode } from "@/lib/ta/types";

export interface CustomStrategy {
    key: string;           // "custom_1714000000000" or "saved_mongoId"
    name: string;          // "Benim Stratejim"
    indicators: string[];  // ["rsi", "cci", "macd"]
    createdAt: number;
    mode?: StrategyMode;   // 'all' | 'majority', varsayılan 'all'
    lookForward?: number;  // varsayılan 14
    params?: Record<string, number>;
    discoveryWinRate?: number;
    discoverySignalCount?: number;
    isDiscovered?: boolean;
}

export interface SavedStrategyItem {
    id: string;
    userId: string;
    name: string;
    indicators: string[];
    mode: string;
    lookForward: number;
    discoveredParams: Record<string, number> | null;
    discoveredWinRate: number | null;
    discoveredTotalSignals: number | null;
    discoveredSymbol: string | null;
    discoveredInterval: string | null;
    // Multi-metric discovery fields
    discoveredProfitFactor?: number | null;
    discoveredSharpeRatio?: number | null;
    discoveredAvgWin?: number | null;
    discoveredAvgLoss?: number | null;
    discoveredMaxDrawdown?: number | null;
    discoveredTotalReturn?: number | null;
    discoveredRegimeBreakdown?: Record<string, {
        winRate: number;
        totalSignals: number;
        wins: number;
        avgReturn: number;
        totalReturn: number;
    }> | null;
    pinned: boolean;
    sourceReportId: string | null;
    isDiscovered: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

export type SortField = 'date' | 'name' | 'winRate' | 'signals' | 'sharpe' | 'profitFactor';
export type SortDir = 'asc' | 'desc';

export interface SortConfig {
    field: SortField;
    dir: SortDir;
}

export interface TAStrategiesButtonProps {
    userId?: string;
    candles?: any[];
    allData?: any;
    interval?: string;
    symbol?: string;
}
