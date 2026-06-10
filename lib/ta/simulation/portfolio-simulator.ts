// lib/ta/portfolio-simulator.ts — Capital simulation over a backtest run
// Answers: "If I started with 10,000 TL, what would my portfolio be worth?"
//
// Consumes the ordered signal stream + each trade's simulated exit from trade-simulator.ts,
// maintains cash, applies position sizing, commission + slippage, compounds equity,
// and records a bar-by-bar equity snapshot with drawdown tracking.
//
// Uses plain `number` arithmetic (not Decimal128) — this is a simulation, not a live ledger.

import type { Candle } from '@/lib/ta/simulation/backtest';
import type { SimulatedTrade } from '@/lib/ta/simulation/trade-simulator';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Configuration for portfolio simulation. */
export interface PortfolioSimConfig {
    /** Starting capital (default: 10000) */
    initialCapital: number;
    /** Position size as percentage of available capital (default: 100) */
    positionSizePct: number;
    /** Commission per trade in basis points (default: 5 = 0.05%) */
    commissionBps: number;
    /** Slippage per trade in basis points (default: 5 = 0.05%) */
    slippageBps: number;
    /** Whether to compound returns (reinvest profits) (default: true) */
    allowCompounding: boolean;
}

/** A single signal entry with its simulated trade result. */
export interface PortfolioSignalEntry {
    /** Bar index where signal was generated (= trade entry bar) */
    barIndex: number;
    /** Trade direction */
    signal: 'BUY' | 'SELL';
    /** Result of the path-aware trade simulation */
    simulatedTrade: SimulatedTrade;
}

/** Result of a full portfolio simulation run. */
export interface PortfolioSimResult {
    /** Bar-by-bar equity values */
    equityCurve: { time: string | number; equity: number }[];
    /** Bar-by-bar drawdown from peak equity (%) */
    drawdownCurve: { time: string | number; drawdownPct: number }[];
    /** Final portfolio value */
    finalEquity: number;
    /** Total return percentage */
    totalReturnPct: number;
    /** Compound Annual Growth Rate (%) */
    cagr: number;
    /** Maximum peak-to-trough drawdown (%) */
    maxDrawdownPct: number;
    /** Total number of trades executed */
    totalTrades: number;
    /** Number of winning trades */
    winningTrades: number;
    /** Number of losing trades */
    losingTrades: number;
    /** Win rate (%) */
    winRate: number;
    /** Average winning trade return (%) */
    avgWin: number;
    /** Average losing trade return (%) */
    avgLoss: number;
    /** Profit factor (gross profit / gross loss) */
    profitFactor: number;
    /** Percentage of time spent in a position */
    exposurePct: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_PORTFOLIO_CONFIG: PortfolioSimConfig = {
    initialCapital: 10000,
    positionSizePct: 100,
    commissionBps: 5,
    slippageBps: 5,
    allowCompounding: true,
};

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Resample a time-series array down to `targetPoints` evenly-spaced samples.
 * Used to keep equity curves under Inngest step output size limits.
 */
export function resampleCurve<T>(curve: T[], targetPoints: number): T[] {
    if (curve.length <= targetPoints) return curve;
    const step = (curve.length - 1) / (targetPoints - 1);
    const result: T[] = [];
    for (let i = 0; i < targetPoints; i++) {
        result.push(curve[Math.round(i * step)]);
    }
    return result;
}

// ─── Core Simulation ─────────────────────────────────────────────────────────

/**
 * Run a full portfolio simulation across all candles.
 *
 * Walks through candles bar-by-bar, tracking:
 * - When a signal fires → opens a position (allocating positionSizePct of capital)
 * - When the simulated trade exits → closes the position, books P&L net of costs
 * - Each bar → records equity snapshot and drawdown
 *
 * @param candles - Full candle array
 * @param signals - Ordered signal entries with pre-computed SimulatedTrade results
 * @param config - Portfolio simulation parameters
 */
export function runPortfolioSimulation(
    candles: Candle[],
    signals: PortfolioSignalEntry[],
    config: PortfolioSimConfig = DEFAULT_PORTFOLIO_CONFIG,
): PortfolioSimResult {
    const { initialCapital, positionSizePct, commissionBps, slippageBps, allowCompounding } = config;

    // Cost ratio: commission + slippage combined, per side (entry or exit)
    const costPerSideBps = commissionBps + slippageBps;
    const costRatio = costPerSideBps / 10000;

    let cash = initialCapital;
    let peakEquity = initialCapital;
    let maxDrawdownPct = 0;

    // Position state
    let inPosition = false;
    let positionCapitalAllocated = 0; // Cash allocated when entering
    let positionEntryPrice = 0;
    let positionSignal: 'BUY' | 'SELL' = 'BUY';
    let currentTradeExitIndex = -1;
    let currentTradeReturnPct = 0; // From simulatedTrade (already path-aware %)

    // Signal queue
    let signalIdx = 0;

    // Output arrays
    const equityCurve: { time: string | number; equity: number }[] = [];
    const drawdownCurve: { time: string | number; drawdownPct: number }[] = [];

    // Trade tracking
    const tradeNetReturns: number[] = []; // Net return % per trade (after costs)
    let barsInPosition = 0;

    // ── Walk all candles ──
    for (let i = 0; i < candles.length; i++) {
        // ── Check: should we close current position? ──
        if (inPosition && i === currentTradeExitIndex) {
            // Close position: apply the simulated trade return, then deduct exit costs
            const grossExitValue = positionCapitalAllocated * (1 + currentTradeReturnPct / 100);
            const exitCost = grossExitValue * costRatio;
            const netExitValue = grossExitValue - exitCost;

            // Net trade return (%) after entry + exit costs
            const entryCost = positionCapitalAllocated * costRatio;
            const netReturnPct = ((netExitValue - positionCapitalAllocated + entryCost) / positionCapitalAllocated - costRatio) * 100;
            // Simpler: total cost = entry + exit, compute net
            const totalCosts = entryCost + exitCost;
            const netPnL = grossExitValue - positionCapitalAllocated - totalCosts;

            if (allowCompounding) {
                cash = cash + netPnL + positionCapitalAllocated; // Return allocated capital + net P&L
            } else {
                // Fixed sizing: always use initialCapital as base, but track P&L
                cash = cash + netPnL + positionCapitalAllocated;
            }

            const netTradeReturnPct = (netPnL / positionCapitalAllocated) * 100;
            tradeNetReturns.push(netTradeReturnPct);

            inPosition = false;
            positionCapitalAllocated = 0;
        }

        // ── Check: should we open a new position? ──
        if (!inPosition && signalIdx < signals.length && i === signals[signalIdx].barIndex) {
            const entry = signals[signalIdx];
            const sim = entry.simulatedTrade;

            // Allocate position capital
            const availableCapital = allowCompounding ? cash : initialCapital;
            positionCapitalAllocated = availableCapital * (positionSizePct / 100);

            // Deduct entry cost from cash
            const entryCost = positionCapitalAllocated * costRatio;
            cash -= positionCapitalAllocated; // Capital is now "in position"

            positionEntryPrice = sim.entryPrice;
            positionSignal = entry.signal;
            currentTradeExitIndex = sim.exitIndex;
            currentTradeReturnPct = sim.realizedReturnPct;
            inPosition = true;

            signalIdx++;
        }

        // ── Compute current equity ──
        let currentEquity: number;
        if (inPosition) {
            barsInPosition++;
            // Mark-to-market: unrealized P&L based on current bar close
            const currentPrice = candles[i].close;
            const unrealizedPnlRatio = positionSignal === 'BUY'
                ? (currentPrice - positionEntryPrice) / positionEntryPrice
                : (positionEntryPrice - currentPrice) / positionEntryPrice;
            const unrealizedPositionValue = positionCapitalAllocated * (1 + unrealizedPnlRatio);
            currentEquity = cash + unrealizedPositionValue;
        } else {
            currentEquity = cash;
        }

        // Record equity
        equityCurve.push({ time: candles[i].time, equity: currentEquity });

        // Drawdown tracking
        if (currentEquity > peakEquity) {
            peakEquity = currentEquity;
        }
        const ddPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
        drawdownCurve.push({ time: candles[i].time, drawdownPct: ddPct });
    }

    // ── Compute final metrics ──
    const finalEquity = equityCurve.length > 0
        ? equityCurve[equityCurve.length - 1].equity
        : initialCapital;
    const totalReturnPct = ((finalEquity - initialCapital) / initialCapital) * 100;

    // CAGR: annualized assuming 252 trading days
    const totalBars = candles.length;
    const years = totalBars / 252;
    const cagr = years > 0 && finalEquity > 0
        ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
        : 0;

    // Trade statistics
    const totalTrades = tradeNetReturns.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let winSum = 0;
    let lossSum = 0;

    for (const ret of tradeNetReturns) {
        if (ret > 0) {
            winningTrades++;
            grossProfit += ret;
            winSum += ret;
        } else {
            losingTrades++;
            grossLoss += Math.abs(ret);
            lossSum += Math.abs(ret);
        }
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgWin = winningTrades > 0 ? winSum / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? lossSum / losingTrades : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const exposurePct = totalBars > 0 ? (barsInPosition / totalBars) * 100 : 0;

    return {
        equityCurve,
        drawdownCurve,
        finalEquity,
        totalReturnPct,
        cagr,
        maxDrawdownPct,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
        exposurePct,
    };
}
