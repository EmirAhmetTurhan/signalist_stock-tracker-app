// lib/ta/backtest-log.ts — Debug Log types for backtest trade transparency
// Records per-bar indicator signals, DST fusion, gate checks, and final decisions.

import type { MarketRegime, BBA } from './types';

/** Per-indicator signal snapshot at a given bar */
export interface IndicatorLogEntry {
    key: string;
    signal: 'BUY' | 'SELL' | null;
    bba: BBA;
    freshCrossover: boolean;
    regime: MarketRegime;
}

/** DST fusion result snapshot */
export interface FusionLogEntry {
    bbas: BBA[];
    fused: BBA;
    conflict: number;
    passedThreshold: boolean;
}

/** Gate check results */
export interface GateLogEntry {
    freshCrossoverOk: boolean;
    cooldownOk: boolean;
    cooldownValue: number;
    thresholdOk: boolean;
    maskOk: boolean;
}

/**
 * Structured log entry for one bar in a backtest run.
 * Only recorded when debugLog=true and at least one indicator is active.
 */
export interface BacktestLogEntry {
    barIndex: number;
    date: string | number;
    price: number;

    /** Per-indicator signal breakdown */
    indicatorSignals: IndicatorLogEntry[];

    /** DST Fusion result (only populated for custom strategy path) */
    fusion?: FusionLogEntry;

    /** Gate checks that filtered this bar */
    gates: GateLogEntry;

    /** Final decision for this bar */
    decision: 'BUY' | 'SELL' | null;

    /** Human-readable explanation of why the bar was rejected or accepted */
    rejectionReason?: string;

    /** Trade outcome (only for bars where a trade happened) */
    tradeOutcome?: {
        futurePrice: number;
        rawReturn: number;
        isWin: boolean;
    };
}
