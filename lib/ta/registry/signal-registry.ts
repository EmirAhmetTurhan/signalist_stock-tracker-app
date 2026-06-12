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

// ─── Eşik Sabitleri (Threshold Constants) ──────────────────────────────────────
// Merkezi eşik yapılandırması — hem *Strength() fonksiyonları hem de
// calculateWinRate (tek indikatör optimizasyonu) tarafından kullanılır.

export const SIGNAL_THRESHOLDS = {
    rsi:       { oversold: 30, overbought: 70 },
    stochrsi:  { oversold: 20, overbought: 80 },
    wavetrend: { oversold: -60, overbought: 60 },
    mfi:       { oversold: 20, overbought: 80 },
    wpr:       { oversold: -80, overbought: -20 },
    ao:        { zeroLine: 0 },  // sıfır çizgisi
    di:        { zeroLine: 0 },
    cmf:       { zeroLine: 0 },
    netvol:    { zeroLine: 0 },
    madr:      { zeroLine: 0 },
} as const;

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
 
export function macdSignal(macd: number, signal: number, prevMacd?: number, prevSignal?: number): SignalDir {
    return macd > signal ? "BUY" : "SELL";
}

export function macdStrength(macd: number, signal: number, hist: number, prevHist: number, prevMacd?: number, prevSignal?: number): SignalStrength {
    if (macd > signal) return hist > prevHist ? "STRONG_BUY" : "WEAK_BUY";
    return hist < prevHist ? "STRONG_SELL" : "WEAK_SELL";
}

export function macdCross(macd: number, signal: number, pm: number, ps: number): boolean {
    return (pm <= ps && macd > signal) || (pm >= ps && macd < signal);
}

// ─── 2. RSI ────────────────────────────────────────────────────────────────────

export function rsiSignal(rsi: number, rsiMa: number, prevRsi?: number, prevRsiMa?: number): SignalDir {
    return rsi > rsiMa ? "BUY" : "SELL";
}

export function rsiStrength(rsi: number, rsiMa: number, prevRsi?: number, prevRsiMa?: number): SignalStrength {
    if (rsi > rsiMa) return rsi < 30 ? "STRONG_BUY" : "WEAK_BUY";
    return rsi > 70 ? "STRONG_SELL" : "WEAK_SELL";
}

export function rsiCross(rsi: number, rsiMa: number, p1: number, p1Ma: number): boolean {
    return (p1 <= p1Ma && rsi > rsiMa) || (p1 >= p1Ma && rsi < rsiMa);
}

// ─── 3. StochRSI ───────────────────────────────────────────────────────────────

export function stochRsiSignal(k: number, d: number, prevK?: number, prevD?: number): SignalDir {
    return k > d ? "BUY" : "SELL";
}

export function stochRsiStrength(k: number, d: number, prevK?: number, prevD?: number): SignalStrength {
    if (k > d) return k < 20 ? "STRONG_BUY" : "WEAK_BUY";
    return k > 80 ? "STRONG_SELL" : "WEAK_SELL";
}

export function stochRsiCross(k: number, d: number, pk: number, pd: number): boolean {
    return (pk <= pd && k > d) || (pk >= pd && k < d);
}

// ─── 4. WaveTrend ──────────────────────────────────────────────────────────────

export function waveTrendSignal(wt1: number, wt2: number, prevWt1?: number, prevWt2?: number): SignalDir {
    return wt1 > wt2 ? "BUY" : "SELL";
}

export function waveTrendStrength(wt1: number, wt2: number, prevWt1?: number, prevWt2?: number): SignalStrength {
    if (wt1 > wt2) return wt1 < -60 ? "STRONG_BUY" : "WEAK_BUY";
    return wt1 > 60 ? "STRONG_SELL" : "WEAK_SELL";
}

export function waveTrendCross(wt1: number, wt2: number, pw1: number, pw2: number): boolean {
    return (pw1 <= pw2 && wt1 > wt2) || (pw1 >= pw2 && wt1 < wt2);
}

// ─── 5. DMI ────────────────────────────────────────────────────────────────────

export function dmiSignal(plus: number, minus: number, prevPlus?: number, prevMinus?: number): SignalDir {
    return plus > minus ? "BUY" : "SELL";
}

export function dmiStrength(plus: number, minus: number, adx: number, prevPlus?: number, prevMinus?: number): SignalStrength {
    if (plus > minus) return adx > 20 ? "STRONG_BUY" : "WEAK_BUY";
    return adx > 20 ? "STRONG_SELL" : "WEAK_SELL";
}

export function dmiCross(plus: number, minus: number, pPlus: number, pMinus: number): boolean {
    return (pPlus <= pMinus && plus > minus) || (pPlus >= pMinus && plus < minus);
}

// ─── 6. MFI ────────────────────────────────────────────────────────────────────

export function mfiSignal(cur: number, prev?: number): SignalDir {
    return cur > 50 ? "BUY" : "SELL";
}

export function mfiStrength(cur: number, prev?: number): SignalStrength {
    if (cur > 50) return cur < 20 ? "STRONG_BUY" : "WEAK_BUY";
    return cur > 80 ? "STRONG_SELL" : "WEAK_SELL";
}

export function mfiCross(cur: number, prev: number): boolean {
    return crossedAbove(cur, prev, 50) || crossedBelow(cur, prev, 50);
}

// ─── 7. SMI ────────────────────────────────────────────────────────────────────

export function smiSignal(smi: number, signal: number, prevSmi?: number, prevSig?: number): SignalDir {
    return smi > signal ? "BUY" : "SELL";
}

export function smiStrength(smi: number, signal: number, hist: number, prevHist: number, prevSmi?: number, prevSig?: number): SignalStrength {
    if (smi > signal) return hist > prevHist ? "STRONG_BUY" : "WEAK_BUY";
    return hist < prevHist ? "STRONG_SELL" : "WEAK_SELL";
}

export function smiCross(smi: number, signal: number, ps: number, pss: number): boolean {
    return (ps <= pss && smi > signal) || (ps >= pss && smi < signal);
}

// ─── 8. AO (Awesome Oscillator) ────────────────────────────────────────────────

export function aoSignal(cur: number, prev?: number): SignalDir {
    return cur > 0 ? "BUY" : "SELL";
}

export function aoStrength(cur: number, prev?: number): SignalStrength {
    return cur > 0 ? "STRONG_BUY" : "STRONG_SELL";
}

export function aoCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 9. CCI ────────────────────────────────────────────────────────────────────

export function cciSignal(cci: number, ma: number, prevCci?: number, prevMa?: number): SignalDir {
    return cci > ma ? "BUY" : "SELL";
}

export function cciStrength(cci: number, ma: number, prevCci?: number, prevMa?: number): SignalStrength {
    if (cci > ma) return cci > 100 ? "STRONG_BUY" : "WEAK_BUY";
    return cci < -100 ? "STRONG_SELL" : "WEAK_SELL";
}

export function cciCross(cci: number, p1: number): boolean {
    return hasCrossed(cci, p1, 0);
}

// ─── 10. WPR (Williams %R) ─────────────────────────────────────────────────────

export function wprSignal(cur: number, prev?: number): SignalDir {
    return cur > -50 ? "BUY" : "SELL";
}

export function wprStrength(cur: number, prev?: number): SignalStrength {
    if (cur > -50) return cur < -80 ? "STRONG_BUY" : "WEAK_BUY";
    return cur > -20 ? "STRONG_SELL" : "WEAK_SELL";
}

export function wprCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, -50);
}

// ─── 11. DI (Demand Index) ─────────────────────────────────────────────────────

export function diSignal(cur: number, prev?: number): SignalDir {
    return cur > 1.0 ? "BUY" : "SELL";
}

export function diStrength(cur: number, prev?: number): SignalStrength {
    return cur > 1.0 ? "STRONG_BUY" : "STRONG_SELL";
}

export function diCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 1.0);
}

// ─── 12. CMF (Chaikin Money Flow) ──────────────────────────────────────────────

export function cmfSignal(val: number, prevVal?: number): SignalDir {
    return val > 0 ? "BUY" : "SELL";
}

export function cmfStrength(val: number, prevVal?: number): SignalStrength {
    if (val > 0) return val > 0.05 ? "STRONG_BUY" : "WEAK_BUY";
    return val < -0.05 ? "STRONG_SELL" : "WEAK_SELL";
}

export function cmfCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 13. AD (Accumulation/Distribution) ────────────────────────────────────────

export function adSignal(cur: number, curSma: number, prev?: number, prevSma?: number): SignalDir {
    return cur > curSma ? "BUY" : "SELL";
}

export function adStrength(cur: number, prev: number, curSma: number, prevSma: number): SignalStrength {
    return cur > curSma ? "STRONG_BUY" : "STRONG_SELL";
}

export function adCross(cur: number, prev: number, curSma: number, prevSma: number): boolean {
    return (prev <= prevSma && cur > curSma) || (prev >= prevSma && cur < curSma);
}

// ─── 14. Net Volume ────────────────────────────────────────────────────────────

export function netvolSignal(cur: number, prev?: number): SignalDir {
    return cur > 0 ? "BUY" : "SELL";
}

export function netvolStrength(cur: number, prev?: number): SignalStrength {
    return cur > 0 ? "STRONG_BUY" : "STRONG_SELL";
}

export function netvolCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 15. MADR ──────────────────────────────────────────────────────────────────

export function madrSignal(cur: number, prev?: number): SignalDir {
    return cur > 0 ? "BUY" : "SELL";
}

export function madrStrength(cur: number, prev?: number): SignalStrength {
    return cur > 0 ? "STRONG_BUY" : "STRONG_SELL";
}

export function madrCross(cur: number, prev: number): boolean {
    return hasCrossed(cur, prev, 0);
}

// ─── 16. ALMA (Arnaud Legoux Moving Average) ────────────────────────────────────

export function almaSignal(curA: number, prevA: number, curC: number, prevC: number): SignalDir {
    return curC > curA ? "BUY" : "SELL";
}

export function almaStrength(curA: number, prevA: number, curC: number, prevC: number): SignalStrength {
    return curC > curA ? "STRONG_BUY" : "STRONG_SELL";
}

export function almaCross(curA: number, prevA: number, curC: number, prevC: number): boolean {
    return (prevC <= prevA && curC > curA) || (prevC >= prevA && curC < curA);
}

// ─── 17. Bollinger Bands ───────────────────────────────────────────────────────

export interface BBPoint {
    lower: number;
    upper: number;
    basis?: number;
}

export function bbSignal(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): SignalDir {
    const basis = curBB.basis ?? ((curBB.upper + curBB.lower) / 2);
    return curC > basis ? "BUY" : "SELL";
}

export function bbStrength(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): SignalStrength {
    const basis = curBB.basis ?? ((curBB.upper + curBB.lower) / 2);
    if (curC > basis) {
        return curC > curBB.upper ? "STRONG_BUY" : "WEAK_BUY";
    } else {
        return curC < curBB.lower ? "STRONG_SELL" : "WEAK_SELL";
    }
}

export function bbCross(curBB: BBPoint, prevBB: BBPoint, curC: number, prevC: number): boolean {
    return (prevC <= prevBB.lower && curC > curBB.lower) || (prevC >= prevBB.upper && curC < curBB.upper);
}

// ─── 18. Kaufman Efficiency Ratio ──────────────────────────────────────────────

/**
 * Kaufman Efficiency Ratio (Fractal Efficiency).
 * Measures the signal-to-noise ratio of price movement over n periods.
 *
 * ER → 1: Price moving efficiently in a straight line (strong trend).
 * ER → 0: High intraday volatility with zero net progress (noise).
 *
 * Used as a continuous multiplier for DST BBA to degrade trend-following
 * indicator confidence during noisy, inefficient market regimes.
 *
 * @param candles - Price candle array
 * @param i       - Current bar index
 * @param n       - Lookback period (default: 10)
 * @returns Efficiency Ratio (0-1)
 */
export function efficiencyRatio(candles: { close: number }[], i: number, n: number = 10): number {
    if (i < n) return 0.5; // Not enough data, assume neutral
    const netChange = Math.abs(candles[i].close - candles[i - n].close);
    let sumAbsChange = 0;
    for (let j = i - n + 1; j <= i; j++) {
        sumAbsChange += Math.abs(candles[j].close - candles[j - 1].close);
    }
    if (sumAbsChange < 1e-10) return 0;
    return netChange / sumAbsChange;
}

// ─── 19. Bollinger/Keltner Squeeze Detection ───────────────────────────────────

/**
 * Detect Bollinger Band / Keltner Channel Squeeze state.
 * A squeeze occurs when BB width contracts inside KC width, signaling
 * extreme volatility compression — a precursor to momentum expansion.
 *
 * @param bbUpper   - Current upper Bollinger Band value
 * @param bbLower   - Current lower Bollinger Band value
 * @param kcUpper   - Current upper Keltner Channel value
 * @param kcLower   - Current lower Keltner Channel value
 * @returns true if market is in a squeeze (compressed) state
 */
export function isSqueezed(
    bbUpper: number,
    bbLower: number,
    kcUpper: number,
    kcLower: number,
): boolean {
    return bbUpper < kcUpper && bbLower > kcLower;
}

/**
 * Compute Keltner Channel values for a bar.
 * Centerline = EMA(close, 20), width = k × ATR(20)
 *
 * @param ema      - 20-period EMA of close at current bar
 * @param atr      - 20-period ATR at current bar
 * @param multiplier - KC width multiplier (default: 1.5)
 * @returns { upper, lower } Keltner Channel values
 */
export function keltnerChannel(
    ema: number,
    atr: number,
    multiplier: number = 1.5,
): { upper: number; lower: number } {
    const width = multiplier * atr;
    return { upper: ema + width, lower: ema - width };
}

// ─── 20. Volume Confirmation ────────────────────────────────────────────────────

/**
 * Check if current bar's volume confirms a breakout signal.
 * Volume must exceed κ × SMA(volume, 20) to validate institutional
 * participation behind the price move.
 *
 * @param volume     - Current bar's volume
 * @param volumeSMA  - 20-period SMA of volume
 * @param multiplier - Threshold multiplier (default: 1.5)
 * @returns true if volume confirms the move
 */
export function volumeConfirms(
    volume: number,
    volumeSMA: number,
    multiplier: number = 1.5,
): boolean {
    if (volumeSMA <= 0) return true; // Not enough data, signal allow
    return volume > multiplier * volumeSMA;
}

// ─── 21. On-Balance Volume (OBV) ────────────────────────────────────────────────

/**
 * Compute cumulative On-Balance Volume series.
 * OBV accumulates volume on up days and subtracts on down days.
 *
 * @param candles - Price candle array with close and volume
 * @returns Float64Array of OBV values aligned with candles
 */
export function computeOBV(candles: { close: number; volume: number }[]): Float64Array {
    const obv = new Float64Array(candles.length);
    if (candles.length === 0) return obv;
    obv[0] = candles[0].volume;
    for (let i = 1; i < candles.length; i++) {
        if (candles[i].close > candles[i - 1].close) {
            obv[i] = obv[i - 1] + candles[i].volume;
        } else if (candles[i].close < candles[i - 1].close) {
            obv[i] = obv[i - 1] - candles[i].volume;
        } else {
            obv[i] = obv[i - 1];
        }
    }
    return obv;
}

/**
 * Detect OBV bearish divergence (price making higher high, OBV making lower high).
 * This is a leading indicator of trend exhaustion — price rises without volume support.
 *
 * @param prices  - Close price array
 * @param obv     - Pre-computed OBV array (from computeOBV)
 * @param i       - Current bar index
 * @param window  - Lookback window for local extrema detection (default: 5)
 * @returns true if bearish divergence detected
 */
export function obvBearishDivergence(
    prices: Float64Array,
    obv: Float64Array,
    i: number,
    window: number = 5,
): boolean {
    if (i < window * 3) return false;

    // Find second most recent price peak
    let peak2Idx = -1, peak2Val = -Infinity;
    for (let j = i - window; j >= window; j--) {
        let isPeak = true;
        for (let k = 1; k <= window; k++) {
            if (prices[j] <= prices[j - k] || prices[j] <= prices[j + k]) { isPeak = false; break; }
        }
        if (isPeak && prices[j] > peak2Val) { peak2Idx = j; peak2Val = prices[j]; break; }
    }
    if (peak2Idx < 0) return false;

    // Find most recent price peak (before peak2)
    let peak1Idx = -1, peak1Val = -Infinity;
    for (let j = peak2Idx - window; j >= window; j--) {
        let isPeak = true;
        for (let k = 1; k <= window; k++) {
            if (prices[j] <= prices[j - k] || prices[j] <= prices[j + k]) { isPeak = false; break; }
        }
        if (isPeak && prices[j] > peak1Val) { peak1Idx = j; peak1Val = prices[j]; break; }
    }
    if (peak1Idx < 0) return false;

    // Bearish divergence: price higher high, OBV lower high
    return peak2Val > peak1Val && obv[peak2Idx] < obv[peak1Idx];
}

// ─── 22. Volume Climax / Exhaustion Detection ───────────────────────────────────

/**
 * Detect volume climax (trend exhaustion).
 * Requires: established trend (ADX > 25), anomalous volume (> 3x SMA),
 * and price rejection (small real body vs total range).
 *
 * @param candle    - Current candle { high, low, open, close, volume }
 * @param volumeSMA - 20-period SMA of volume
 * @param adx       - Current ADX value (trend strength indicator)
 * @returns true if volume climax detected (trend likely ending)
 */
export function isVolumeClimax(
    candle: { high: number; low: number; open: number; close: number; volume: number },
    volumeSMA: number,
    adx: number,
): boolean {
    // 1. Established trend: ADX > 25
    if (adx <= 25) return false;

    // 2. Anomalous volume: > 3x SMA
    if (volumeSMA <= 0 || candle.volume <= 3 * volumeSMA) return false;

    // 3. Price rejection: real body < 30% of total range
    const totalRange = candle.high - candle.low;
    const realBody = Math.abs(candle.close - candle.open);
    if (totalRange <= 0) return false;

    return (realBody / totalRange) < 0.3;
}

// ─── 23. Probabilistic Sharpe Ratio (PSR) ──────────────────────────────────────

/**
 * Compute Probabilistic Sharpe Ratio (PSR).
 * Corrects standard Sharpe for non-normality (skewness, kurtosis)
 * and answers: "What is the probability this Sharpe represents real skill,
 * not just luck?"
 *
 * Formula (Bailey & López de Prado, 2012):
 *   PSR = Φ( (ŜR - SR*)√(T-1) / √(1 - γ̂₃·ŜR + (γ̂₄-1)/4·ŜR²) )
 *
 * @param observedSR      - Observed non-annualized Sharpe Ratio (ŜR)
 * @param benchmarkSR     - Benchmark SR to beat, usually 0 (SR*)
 * @param tradeCount      - Number of independent trades (T)
 * @param returns         - Array of per-trade returns for skewness/kurtosis
 * @returns PSR value (0-1). PSR ≥ 0.95 → 95% probability of genuine skill
 */
export function computePSR(
    observedSR: number,
    benchmarkSR: number,
    tradeCount: number,
    returns: number[],
): number {
    if (tradeCount < 3 || returns.length < 3) return 0;

    // Compute skewness (γ̂₃)
    const n = returns.length;
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    let m2 = 0, m3 = 0, m4 = 0;
    for (let i = 0; i < n; i++) {
        const d = returns[i] - mean;
        const d2 = d * d;
        m2 += d2;
        m3 += d * d2;
        m4 += d2 * d2;
    }
    const variance = m2 / n;
    if (variance < 1e-10) return 0;

    const std = Math.sqrt(variance);
    const skewness = m3 / (n * std * std * std);
    const kurtosis = m4 / (n * variance * variance);

    // PSR denominator
    const denominator = Math.sqrt(
        1 - skewness * observedSR + ((kurtosis - 1) / 4) * observedSR * observedSR,
    );
    if (denominator < 1e-10) return 0;

    // PSR numerator
    const numerator = (observedSR - benchmarkSR) * Math.sqrt(tradeCount - 1);

    // Standard normal CDF (Abramowitz & Stegun approximation)
    const z = numerator / denominator;
    const cdf = 1 / (1 + Math.exp(-1.59791 * z - 0.07056 * z * z * z));

    return Math.max(0, Math.min(1, cdf));
}

// ─── 24. Triple Barrier Labeling ──────────────────────────────────────────────

/**
 * Label outcome for a bar using the Triple Barrier Method (López de Prado, 2018).
 * Simulates future price path and returns which barrier was hit first.
 *
 * @param candles    - Full candle array
 * @param entryIndex - Bar index where signal occurs
 * @param upperMult  - Upper barrier as ATR multiple for profit target (default: 2.0)
 * @param lowerMult  - Lower barrier as ATR multiple for stop-loss (default: 1.0)
 * @param maxBars    - Vertical (time) barrier in bars (default: 20)
 * @param atrValues  - Pre-computed ATR array
 * @returns { label: 1 (upper hit) | -1 (lower hit) | 0 (time hit), barsHeld, exitPrice }
 */
export function tripleBarrierLabel(
    candles: { high: number; low: number; close: number }[],
    entryIndex: number,
    upperMult: number,
    lowerMult: number,
    maxBars: number,
    atrValues: number[],
): { label: 1 | -1 | 0; barsHeld: number; exitPrice: number } {
    const entryPrice = candles[entryIndex].close;
    const currentATR = atrValues[entryIndex] ?? 0.01;
    const upperBarrier = entryPrice + upperMult * currentATR;
    const lowerBarrier = entryPrice - lowerMult * currentATR;
    const endIdx = Math.min(entryIndex + maxBars, candles.length - 1);

    for (let j = entryIndex + 1; j <= endIdx; j++) {
        const c = candles[j];
        if (c.high >= upperBarrier) return { label: 1, barsHeld: j - entryIndex, exitPrice: upperBarrier };
        if (c.low <= lowerBarrier) return { label: -1, barsHeld: j - entryIndex, exitPrice: lowerBarrier };
    }
    return { label: 0, barsHeld: maxBars, exitPrice: candles[endIdx].close };
}

// ─── Dempster-Shafer Theory Fusion ───────────────────────────────────────────

import type { BBA, MarketRegime } from '../types';

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
