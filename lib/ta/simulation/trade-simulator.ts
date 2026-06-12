// lib/ta/trade-simulator.ts — Path-aware single-trade simulation
// Replaces the flawed 2-point ground truth (entry close vs. exit close)
// with bar-by-bar simulation that respects stop-loss, take-profit,
// trailing stops, opposite signals, and time stops.
//
// This module is PURE — no money/capital logic. That lives in portfolio-simulator.ts.

import type { Candle } from '@/lib/ta/types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Reason the trade was exited. */
export type ExitReason = 'stop_loss' | 'take_profit' | 'trailing_stop' | 'opposite_signal' | 'time_stop';

/** Risk configuration for trade simulation. */
export interface TradeRiskConfig {
    /** Stop-loss distance in ATR multiples. SL = entry ∓ ATR × mult */
    stopLossAtrMult: number;
    /** Take-profit as reward:risk ratio. TP distance = stop distance × R */
    takeProfitR: number;
    /** Whether trailing stop is active */
    useTrailingStop: boolean;
    /** Trailing stop distance in ATR multiples from peak */
    trailAtrMult: number;
    /** Maximum bars to hold before forced exit (acts like lookForward) */
    timeStopBars: number;
}

/** Result of simulating a single trade bar-by-bar. */
export interface SimulatedTrade {
    /** Entry bar index */
    entryIndex: number;
    /** Exit bar index */
    exitIndex: number;
    /** Why the trade was exited */
    exitReason: ExitReason;
    /** Entry price (close of entry bar) */
    entryPrice: number;
    /** Exit price (close of exit bar) */
    exitPrice: number;
    /** Realized return as percentage (positive = profit, negative = loss) */
    realizedReturnPct: number;
    /** Maximum Favorable Excursion — best unrealized P&L during the trade (%) */
    mfe: number;
    /** Maximum Adverse Excursion — worst unrealized P&L during the trade (%) */
    mae: number;
    /** Intra-trade maximum drawdown from peak unrealized P&L (%) */
    intraTradeMaxDD: number;
    /** Number of bars the position was held */
    barsHeld: number;
}

// ─── Default Risk Config ─────────────────────────────────────────────────────

export const DEFAULT_RISK_CONFIG: TradeRiskConfig = {
    stopLossAtrMult: 2.0,
    takeProfitR: 2.0,
    useTrailingStop: false,
    trailAtrMult: 0,
    timeStopBars: 14,
};

// ─── Core Simulation Function ────────────────────────────────────────────────

/**
 * Simulate a single trade bar-by-bar from entry to exit.
 *
 * Walks forward from entryIndex, checking exit conditions each bar in order:
 *   1. Stop-loss (or trailing stop if higher/lower)
 *   2. Take-profit
 *   3. Opposite signal (via callback)
 *   4. Time stop (max bars reached)
 *
 * Returns detailed trade metrics including MFE, MAE, and intra-trade drawdown.
 *
 * @param candles - Full candle array (must extend at least entryIndex + timeStopBars)
 * @param entryIndex - Bar index where the trade is entered
 * @param signal - Trade direction
 * @param atrValues - Pre-computed ATR values aligned with candles
 * @param riskConfig - Stop-loss, take-profit, trailing stop parameters
 * @param hasOppositeSignal - Optional callback to check for opposing signal at a bar
 */
export function simulateTrade(
    candles: Candle[],
    entryIndex: number,
    signal: 'BUY' | 'SELL',
    atrValues: number[],
    riskConfig: TradeRiskConfig,
    hasOppositeSignal?: (barIndex: number) => boolean,
): SimulatedTrade {
    const entryPrice = candles[entryIndex].close;
    const currentATR = atrValues[entryIndex] ?? 0;
    const isBuy = signal === 'BUY';

    // ── Compute stop-loss and take-profit levels ──
    const stopDistance = currentATR * riskConfig.stopLossAtrMult;
    const tpDistance = stopDistance * riskConfig.takeProfitR;

    let stopPrice: number;
    let tpPrice: number;

    if (isBuy) {
        stopPrice = entryPrice - stopDistance;
        tpPrice = entryPrice + tpDistance;
    } else {
        stopPrice = entryPrice + stopDistance;
        tpPrice = entryPrice - tpDistance;
    }

    // ── Tracking variables ──
    let bestPnlPct = 0;   // MFE tracking (best unrealized P&L %)
    let worstPnlPct = 0;  // MAE tracking (worst unrealized P&L %)
    let peakPnlPct = 0;   // For intra-trade drawdown
    let maxIntraDD = 0;   // Largest peak-to-trough in unrealized P&L

    // Trailing stop tracking
    let peakPrice = entryPrice;
    let trailingStopPrice = isBuy
        ? entryPrice - currentATR * (riskConfig.trailAtrMult || riskConfig.stopLossAtrMult)
        : entryPrice + currentATR * (riskConfig.trailAtrMult || riskConfig.stopLossAtrMult);

    // ── Helper to build result ──
    function buildResult(exitIdx: number, reason: ExitReason): SimulatedTrade {
        const exitPrice = candles[exitIdx].close;
        const rawReturn = (exitPrice - entryPrice) / Math.abs(entryPrice);
        const realizedReturnPct = isBuy ? rawReturn * 100 : -rawReturn * 100;

        return {
            entryIndex,
            exitIndex: exitIdx,
            exitReason: reason,
            entryPrice,
            exitPrice,
            realizedReturnPct,
            mfe: bestPnlPct,
            mae: worstPnlPct,
            intraTradeMaxDD: maxIntraDD,
            barsHeld: exitIdx - entryIndex,
        };
    }

    // ── Walk forward bar-by-bar ──
    const maxBar = candles.length - 1;

    for (let i = entryIndex + 1; i <= maxBar; i++) {
        const currentPrice = candles[i].close;

        // Update unrealized P&L percentage
        const rawPnl = (currentPrice - entryPrice) / entryPrice;
        const pnlPct = isBuy ? rawPnl * 100 : -rawPnl * 100;

        // Update MFE / MAE
        if (pnlPct > bestPnlPct) bestPnlPct = pnlPct;
        if (pnlPct < worstPnlPct) worstPnlPct = pnlPct;

        // Update intra-trade drawdown
        if (pnlPct > peakPnlPct) peakPnlPct = pnlPct;
        const intraDDNow = peakPnlPct - pnlPct;
        if (intraDDNow > maxIntraDD) maxIntraDD = intraDDNow;

        // ── Exit checks (order matters: SL first, then TP, then opposite, then time) ──

        if (isBuy) {
            // Update trailing stop
            if (riskConfig.useTrailingStop && currentPrice > peakPrice) {
                peakPrice = currentPrice;
                const newTrail = peakPrice - currentATR * riskConfig.trailAtrMult;
                if (newTrail > trailingStopPrice) {
                    trailingStopPrice = newTrail;
                }
            }

            // Determine effective stop (higher of fixed SL and trailing)
            const effectiveStop = riskConfig.useTrailingStop
                ? Math.max(stopPrice, trailingStopPrice)
                : stopPrice;

            // Stop-loss check
            if (currentPrice <= effectiveStop) {
                const reason: ExitReason = riskConfig.useTrailingStop && trailingStopPrice > stopPrice
                    ? 'trailing_stop'
                    : 'stop_loss';
                return buildResult(i, reason);
            }

            // Take-profit check
            if (currentPrice >= tpPrice) {
                return buildResult(i, 'take_profit');
            }
        } else {
            // SELL: inverse logic
            if (riskConfig.useTrailingStop && currentPrice < peakPrice) {
                peakPrice = currentPrice;
                const newTrail = peakPrice + currentATR * riskConfig.trailAtrMult;
                if (newTrail < trailingStopPrice) {
                    trailingStopPrice = newTrail;
                }
            }

            const effectiveStop = riskConfig.useTrailingStop
                ? Math.min(stopPrice, trailingStopPrice)
                : stopPrice;

            // Stop-loss check (price goes UP for short)
            if (currentPrice >= effectiveStop) {
                const reason: ExitReason = riskConfig.useTrailingStop && trailingStopPrice < stopPrice
                    ? 'trailing_stop'
                    : 'stop_loss';
                return buildResult(i, reason);
            }

            // Take-profit check (price goes DOWN for short)
            if (currentPrice <= tpPrice) {
                return buildResult(i, 'take_profit');
            }
        }

        // Opposite signal check
        if (hasOppositeSignal && hasOppositeSignal(i)) {
            return buildResult(i, 'opposite_signal');
        }

        // Time stop check (acts like lookForward/forced exit)
        if (i >= entryIndex + riskConfig.timeStopBars) {
            const isTrailingStopActiveAndInProfit = riskConfig.useTrailingStop && pnlPct > 0;
            if (!isTrailingStopActiveAndInProfit) {
                return buildResult(i, 'time_stop');
            }
        }
    }

    // ── Time stop — max bars reached (or end of candles) ──
    return buildResult(maxBar, 'time_stop');
}
