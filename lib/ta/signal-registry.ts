// lib/ta/signal-registry.ts — Shared BUY/SELL condition registry
// Pure functions defining signal conditions for all indicators.
// Single source of truth consumed by signals.ts, backtest.ts,
// CustomStrategyPanel.tsx, and StrategyBacktestMonitor.tsx.
//
// Conventions:
//   *Signal()   → "BUY" | "SELL" | null          (simple direction)
//   *Strength() → SignalStrength                  (strength-based, for signals.ts)
//   *Cross()    → boolean                         (crossover detection)

export type SignalDir = "BUY" | "SELL" | null;
export type SignalStrength = "STRONG_BUY" | "STRONG_SELL" | "WEAK_BUY" | "WEAK_SELL" | "NEUTRAL";

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function lastValue(arr?: { value?: number }[]): number | undefined {
    return arr?.[arr.length - 1]?.value;
}

export function prevValue(arr?: { value?: number }[]): number | undefined {
    return arr?.[arr.length - 2]?.value;
}

/** Map (bool) → SignalDir */
export function dir(up: boolean): SignalDir {
    return up ? "BUY" : "SELL";
}

/** Crossover check: prev was below (or at) threshold, cur is above */
export function crossedAbove(cur: number, prev: number, threshold = 0): boolean {
    return prev <= threshold && cur > threshold;
}

/** Crossover check: prev was above (or at) threshold, cur is below */
export function crossedBelow(cur: number, prev: number, threshold = 0): boolean {
    return prev >= threshold && cur < threshold;
}

/** Generic crossover: direction changed across threshold */
export function hasCrossed(cur: number, prev: number, threshold = 0): boolean {
    return crossedAbove(cur, prev, threshold) || crossedBelow(cur, prev, threshold);
}

// ─── 1. MACD ───────────────────────────────────────────────────────────────────

export function macdSignal(macd: number, signal: number): SignalDir {
    if (macd > signal) return "BUY";
    if (macd < signal) return "SELL";
    return null;
}

export function macdStrength(macd: number, signal: number, hist: number, prevHist: number): SignalStrength {
    if (macd > signal) return hist > prevHist ? "STRONG_BUY" : "WEAK_BUY";
    if (macd < signal) return hist < prevHist ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function macdCross(macd: number, signal: number, pm: number, ps: number): boolean {
    return crossedAbove(macd, pm, ps) || crossedBelow(macd, pm, ps);
}

// ─── 2. RSI ────────────────────────────────────────────────────────────────────

export function rsiSignal(rsi: number, rsiMa: number): SignalDir {
    return rsi > rsiMa ? "BUY" : "SELL";
}

export function rsiStrength(rsi: number, rsiMa: number): SignalStrength {
    if (rsi > rsiMa) return rsi < 30 ? "STRONG_BUY" : "WEAK_BUY";
    return rsi > 70 ? "STRONG_SELL" : "WEAK_SELL";
}

export function rsiCross(rsi: number, rsiMa: number, p1: number, p1Ma: number): boolean {
    return crossedAbove(rsi, p1, p1Ma) || crossedBelow(rsi, p1, p1Ma);
}

// ─── 3. StochRSI ───────────────────────────────────────────────────────────────

export function stochRsiSignal(k: number, d: number): SignalDir {
    if (k > d) return "BUY";
    if (k < d) return "SELL";
    return null;
}

export function stochRsiStrength(k: number, d: number): SignalStrength {
    if (k > d) return k < 20 ? "STRONG_BUY" : "WEAK_BUY";
    if (k < d) return k > 80 ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function stochRsiCross(k: number, d: number, pk: number, pd: number): boolean {
    return crossedAbove(k, pk, pd) || crossedBelow(k, pk, pd);
}

// ─── 4. WaveTrend ──────────────────────────────────────────────────────────────

export function waveTrendSignal(wt1: number, wt2: number): SignalDir {
    if (wt1 > wt2) return "BUY";
    if (wt1 < wt2) return "SELL";
    return null;
}

export function waveTrendStrength(wt1: number, wt2: number): SignalStrength {
    if (wt1 > wt2) return wt1 < -60 ? "STRONG_BUY" : "WEAK_BUY";
    if (wt1 < wt2) return wt1 > 60 ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function waveTrendCross(wt1: number, wt2: number, pw1: number, pw2: number): boolean {
    return crossedAbove(wt1, pw1, pw2) || crossedBelow(wt1, pw1, pw2);
}

// ─── 5. DMI ────────────────────────────────────────────────────────────────────

export function dmiSignal(plus: number, minus: number): SignalDir {
    if (plus > minus) return "BUY";
    if (minus > plus) return "SELL";
    return null;
}

export function dmiStrength(plus: number, minus: number, adx: number): SignalStrength {
    if (plus > minus) return adx > 20 ? "STRONG_BUY" : "WEAK_BUY";
    if (minus > plus) return adx > 20 ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function dmiCross(plus: number, minus: number, pPlus: number, pMinus: number): boolean {
    return crossedAbove(plus, pPlus, pMinus) || crossedBelow(plus, pPlus, pMinus);
}

// ─── 6. MFI ────────────────────────────────────────────────────────────────────

export function mfiSignal(cur: number, prev: number): SignalDir {
    if (cur < 20) return "BUY";
    if (cur > 80) return "SELL";
    if (cur > prev) return "BUY";
    if (cur < prev) return "SELL";
    return null;
}

export function mfiStrength(cur: number, prev: number): SignalStrength {
    if (cur < 20) return "STRONG_BUY";
    if (cur > 80) return "STRONG_SELL";
    if (cur > prev) return "WEAK_BUY";
    if (cur < prev) return "WEAK_SELL";
    return "NEUTRAL";
}

export function mfiCross(cur: number, prev: number): boolean {
    return crossedAbove(cur, prev, 50) || crossedBelow(cur, prev, 50);
}

// ─── 7. SMI ────────────────────────────────────────────────────────────────────

export function smiSignal(smi: number, signal: number): SignalDir {
    if (smi > signal) return "BUY";
    if (smi < signal) return "SELL";
    return null;
}

export function smiStrength(smi: number, signal: number, hist: number, prevHist: number): SignalStrength {
    if (smi > signal) return hist > prevHist ? "STRONG_BUY" : "WEAK_BUY";
    if (smi < signal) return hist < prevHist ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function smiCross(smi: number, signal: number, ps: number, pss: number): boolean {
    return crossedAbove(smi, ps, pss) || crossedBelow(smi, ps, pss);
}

// ─── 8. AO (Awesome Oscillator) ────────────────────────────────────────────────

export function aoSignal(cur: number, prev: number): SignalDir {
    const rising = cur > prev;
    // Zero-line crossover — strongest signal
    if (cur > 0 && prev <= 0) return "BUY";
    if (cur < 0 && prev >= 0) return "SELL";
    // Above zero: rising → BUY, falling → SELL
    if (cur > 0) return rising ? "BUY" : "SELL";
    // Below zero: rising → SELL (weak momentum), falling → BUY (oversold bounce)
    if (cur < 0) return rising ? "SELL" : "BUY";
    return null;
}

export function aoStrength(cur: number, prev: number): SignalStrength {
    const rising = cur > prev;
    if (cur > 0) return rising ? "STRONG_BUY" : "WEAK_SELL";
    return rising ? "WEAK_BUY" : "STRONG_SELL";
}

export function aoCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 9. CCI ────────────────────────────────────────────────────────────────────

export function cciSignal(cci: number, ma: number): SignalDir {
    return cci > ma ? "BUY" : "SELL";
}

export function cciStrength(cci: number, ma: number): SignalStrength {
    if (cci > ma) return cci < -100 ? "STRONG_BUY" : "WEAK_BUY";
    return cci > 100 ? "STRONG_SELL" : "WEAK_SELL";
}

export function cciCross(cci: number, p1: number): boolean {
    return hasCrossed(cci, p1, 0);
}

// ─── 10. WPR (Williams %R) ─────────────────────────────────────────────────────

export function wprSignal(cur: number, prev: number): SignalDir {
    if (cur < -80) return "BUY";
    if (cur > -20) return "SELL";
    return cur > prev ? "BUY" : "SELL";
}

export function wprStrength(cur: number, prev: number): SignalStrength {
    if (cur < -80) return "STRONG_BUY";
    if (cur > -20) return "STRONG_SELL";
    return cur > prev ? "WEAK_BUY" : "WEAK_SELL";
}

export function wprCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, -50);
}

// ─── 11. DI (Demand Index) ─────────────────────────────────────────────────────

export function diSignal(cur: number): SignalDir {
    return cur > 0 ? "BUY" : "SELL";
}

export function diStrength(cur: number, prev: number): SignalStrength {
    if (cur > 0) return cur > prev ? "STRONG_BUY" : "WEAK_BUY";
    return cur < prev ? "STRONG_SELL" : "WEAK_SELL";
}

export function diCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 12. CMF (Chaikin Money Flow) ──────────────────────────────────────────────

export function cmfSignal(val: number): SignalDir {
    return val > 0 ? "BUY" : "SELL";
}

export function cmfStrength(val: number): SignalStrength {
    if (val > 0.05) return "STRONG_BUY";
    if (val < -0.05) return "STRONG_SELL";
    return val > 0 ? "WEAK_BUY" : "WEAK_SELL";
}

export function cmfCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 13. AD (Accumulation/Distribution) ────────────────────────────────────────

export function adSignal(cur: number, curSma: number): SignalDir {
    return cur > curSma ? "BUY" : "SELL";
}

export function adStrength(cur: number, prev: number, curSma: number, prevSma: number): SignalStrength {
    if (prev <= prevSma && cur > curSma) return "STRONG_BUY";
    if (prev >= prevSma && cur < curSma) return "STRONG_SELL";
    return cur > curSma ? "WEAK_BUY" : "WEAK_SELL";
}

export function adCross(cur: number, prev: number, curSma: number, prevSma: number): boolean {
    return crossedAbove(cur, prev, curSma) || crossedBelow(cur, prev, curSma);
}

// ─── 14. Net Volume ────────────────────────────────────────────────────────────

export function netvolSignal(cur: number): SignalDir {
    if (cur > 0) return "BUY";
    if (cur < 0) return "SELL";
    return null;
}

export function netvolStrength(cur: number, prev: number): SignalStrength {
    if (cur > 0) return cur > prev ? "STRONG_BUY" : "WEAK_BUY";
    if (cur < 0) return cur < prev ? "STRONG_SELL" : "WEAK_SELL";
    return "NEUTRAL";
}

export function netvolCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 15. MADR ──────────────────────────────────────────────────────────────────

export function madrSignal(cur: number): SignalDir {
    return cur > 0 ? "BUY" : "SELL";
}

export function madrStrength(cur: number, prev: number): SignalStrength {
    if (prev < 0 && cur > 0) return "STRONG_BUY";
    if (prev > 0 && cur < 0) return "STRONG_SELL";
    return cur > 0 ? "WEAK_BUY" : "WEAK_SELL";
}

export function madrCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 16. ALMA (Arnaud Legoux Moving Average) ────────────────────────────────────

export function almaSignal(curA: number, prevA: number, curC: number, prevC: number): SignalDir {
    if (prevC < prevA && curC > curA) return "BUY";
    if (prevC > prevA && curC < curA) return "SELL";
    return curC > curA ? "BUY" : "SELL";
}

export function almaStrength(curA: number, prevA: number, curC: number, prevC: number): SignalStrength {
    if (prevC < prevA && curC > curA) return "STRONG_BUY";
    if (prevC > prevA && curC < curA) return "STRONG_SELL";
    return curC > curA ? "WEAK_BUY" : "WEAK_SELL";
}

export function almaCross(curA: number, prevA: number, curC: number, prevC: number): boolean {
    return crossedAbove(curC, prevC, curA) || crossedBelow(curC, prevC, curA);
}

// ─── 17. Bollinger Bands ───────────────────────────────────────────────────────

export interface BBPoint {
    lower: number;
    upper: number;
    basis?: number;
}

export function bbSignal(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): SignalDir {
    if (prevC < prevBB.lower && curC > curBB.lower) return "BUY";
    if (prevC > prevBB.upper && curC < curBB.upper) return "SELL";
    if (curC < curBB.lower) return "BUY";
    if (curC > curBB.upper) return "SELL";
    return null;
}

export function bbStrength(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): SignalStrength {
    if (prevC < prevBB.lower && curC > curBB.lower) return "STRONG_BUY";
    if (prevC > prevBB.upper && curC < curBB.upper) return "STRONG_SELL";
    if (curC < curBB.lower) return "WEAK_BUY";
    if (curC > curBB.upper) return "WEAK_SELL";
    return "NEUTRAL";
}

export function bbCross(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): boolean {
    return crossedAbove(curC, prevC, curBB.lower) || crossedBelow(curC, prevC, curBB.upper);
}

// ─── Dempster-Shafer Theory Fusion ───────────────────────────────────────────

import type { BBA, MarketRegime } from './types';

/**
 * Dempster's Rule of Combination for two BBAs.
 * Fuses evidence from two independent sources (indicators).
 * Handles conflict normalization (K = 1 - sum of conflicting products).
 */
export function dempsterCombine(a: BBA, b: BBA): BBA {
    const conflict = a.buy * b.sell + a.sell * b.buy;
    const norm = 1 - conflict;

    if (norm <= 0) {
        // Total conflict — return maximum uncertainty (cannot decide)
        return { buy: 0, sell: 0, uncertainty: 1 };
    }

    return {
        buy: (a.buy * b.buy + a.buy * b.uncertainty + a.uncertainty * b.buy) / norm,
        sell: (a.sell * b.sell + a.sell * b.uncertainty + a.uncertainty * b.sell) / norm,
        uncertainty: (a.uncertainty * b.uncertainty) / norm,
    };
}

/**
 * Fuse all indicator BBAs into a single combined belief using iterative pairwise combination.
 * Order-independent for n ≥ 2 (Dempster's rule is associative).
 */
export function fuseAll(bbas: BBA[]): BBA {
    if (bbas.length === 0) return { buy: 0, sell: 0, uncertainty: 1 };
    if (bbas.length === 1) return bbas[0];

    let result = bbas[0];
    for (let i = 1; i < bbas.length; i++) {
        result = dempsterCombine(result, bbas[i]);
    }
    return result;
}

/**
 * Convert an indicator signal into a Basic Belief Assignment (BBA).
 * - Regime-aware: trending reduces uncertainty (market has direction),
 *   ranging/volatile increases uncertainty.
 * - Default confidence = 0.6; Phase 3 will replace with historical Beta posterior.
 */
export function signalToBBA(
    signal: "BUY" | "SELL" | null,
    confidence: number = 0.6,
    regime?: MarketRegime
): BBA {
    // Adjust uncertainty based on regime
    let uncertaintyBonus = 0;
    if (regime === 'uptrend' || regime === 'downtrend') {
        uncertaintyBonus = -0.1; // Trending → less uncertainty
    } else if (regime === 'ranging' || regime === 'volatile') {
        uncertaintyBonus = 0.15; // Ranging/volatile → more uncertainty
    }

    const adjustedConfidence = Math.max(0.1, Math.min(0.95, confidence + uncertaintyBonus));
    const uncertainty = 1 - adjustedConfidence;

    switch (signal) {
        case "BUY":
            return { buy: adjustedConfidence, sell: 0, uncertainty };
        case "SELL":
            return { buy: 0, sell: adjustedConfidence, uncertainty };
        case null:
            return { buy: 0, sell: 0, uncertainty: 1 };
    }
}

// ─── Unified dispatcher (optional convenience) ─────────────────────────────────

/** Map indicator key → registry function & call with structured args.
 *  Consumer is responsible for extracting values from its data shape.
 *  Returns null for any missing required value (no silent crashes).
 */
export function checkSignal(
    key: string,
    values: { cur?: number; prev?: number; cur2?: number; prev2?: number; cur3?: number; prev3?: number; curC?: number; prevC?: number; curBB?: BBPoint; prevBB?: BBPoint },
): SignalDir {
    const v = values;
    switch (key) {
        case "macd": return v.cur !== undefined && v.cur2 !== undefined ? macdSignal(v.cur, v.cur2) : null;
        case "rsi": return v.cur !== undefined && v.cur2 !== undefined ? rsiSignal(v.cur, v.cur2) : null;
        case "stochrsi": return v.cur !== undefined && v.cur2 !== undefined ? stochRsiSignal(v.cur, v.cur2) : null;
        case "wavetrend": return v.cur !== undefined && v.cur2 !== undefined ? waveTrendSignal(v.cur, v.cur2) : null;
        case "dmi": return v.cur !== undefined && v.cur2 !== undefined ? dmiSignal(v.cur, v.cur2) : null;
        case "mfi": return v.cur !== undefined && v.prev !== undefined ? mfiSignal(v.cur, v.prev) : null;
        case "smi": return v.cur !== undefined && v.cur2 !== undefined ? smiSignal(v.cur, v.cur2) : null;
        case "ao": return v.cur !== undefined && v.prev !== undefined ? aoSignal(v.cur, v.prev) : null;
        case "cci": return v.cur !== undefined && v.cur2 !== undefined ? cciSignal(v.cur, v.cur2) : null;
        case "wpr": return v.cur !== undefined && v.prev !== undefined ? wprSignal(v.cur, v.prev) : null;
        case "di": return v.cur !== undefined ? diSignal(v.cur) : null;
        case "cmf": return v.cur !== undefined ? cmfSignal(v.cur) : null;
        case "ad": return v.cur !== undefined && v.cur2 !== undefined ? adSignal(v.cur, v.cur2) : null;
        case "netvol": return v.cur !== undefined ? netvolSignal(v.cur) : null;
        case "madr": return v.cur !== undefined ? madrSignal(v.cur) : null;
        case "alma": return v.cur !== undefined && v.prev !== undefined && v.curC !== undefined && v.prevC !== undefined ? almaSignal(v.cur, v.prev, v.curC, v.prevC) : null;
        case "bb": return v.curBB !== undefined && v.prevBB !== undefined && v.curC !== undefined && v.prevC !== undefined ? bbSignal(v.curBB, v.prevBB, v.curC, v.prevC) : null;
        default: return null;
    }
}
