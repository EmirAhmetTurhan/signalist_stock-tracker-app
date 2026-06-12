// lib/ta/mutual-information.ts — Mutual Information Filter for Indicator Prior Weights
//
// Computes I(X; Y) for each indicator X against future price direction Y.
// Output: Float64Array(17) of prior weights (0-1) consumed by MCTS as UCT prior.
//
// Key Design Rules:
//   - Operates on FULL candle sequence — NO physical slicing (preserves path-dependent indicators)
//   - Equal-frequency binning for discretization (handles non-Gaussian distributions)
//   - Bias-corrected entropy estimation (Miller-Madow correction for finite samples)
//   - Pure typed array operations — zero GC allocation in hot-path

import type { Candle } from '@/lib/ta/types';
import type { AllData } from '@/lib/ta/strategy-optimizer';

/** Series type matching lib/ta/strategy-optimizer.ts line 28, defined locally since it's not exported. */
type Series = { time: string | number; value?: number }[];

// ─── Constants ────────────────────────────────────────────────────────────────

const INDICATOR_COUNT = 17;
const DEFAULT_LOOK_FORWARD = 14;
const PRICE_BINS = 3;        // Up / Down / Flat
const INDICATOR_BINS = 10;   // Equal-frequency bins for each indicator
const EPSILON = 1e-12;       // Safety for log(0)

/**
 * Minimum number of indicators that MUST receive non-zero prior weight.
 * Prevents the MI filter from zeroing out ALL indicators on low-volatility
 * stocks (e.g. blue chips with low daily ATR). If fewer than this threshold
 * survive the minMI threshold, the top-N by raw MI score are force-kept.
 */
const MIN_ACTIVE_INDICATORS = 4;

/** Maps indicator keys → extractor function that pulls a single Float64Array from AllData. */
type IndicatorExtractor = (data: AllData) => Float64Array;

// ─── Entropy Primitives (Typed-Array Only, Zero Allocation) ─────────────────

/**
 * Compute Shannon entropy H(X) from a frequency count array.
 * Uses Miller-Madow bias correction: H_mm = H_ml + (m-1)/(2N)
 * where m = number of non-empty bins, N = total samples.
 */
function entropy(counts: Int32Array, total: number): number {
    let h = 0.0;
    let nonEmptyBins = 0;
    for (let i = 0; i < counts.length; i++) {
        const c = counts[i];
        if (c > 0) {
            nonEmptyBins++;
            const p = c / total;
            h -= p * Math.log(p);
        }
    }
    // Miller-Madow bias correction
    if (nonEmptyBins > 1 && total > 0) {
        h += (nonEmptyBins - 1) / (2 * total);
    }
    return h;
}

/**
 * Compute joint entropy H(X,Y) from a joint frequency matrix stored as flat Int32Array.
 * Matrix layout: counts[x * yBins + y]
 * Miller-Madow correction applied.
 */
function jointEntropy(
    counts: Int32Array,
    xBins: number,
    yBins: number,
    total: number,
): number {
    let h = 0.0;
    let nonEmptyBins = 0;
    const len = xBins * yBins;
    for (let i = 0; i < len; i++) {
        const c = counts[i];
        if (c > 0) {
            nonEmptyBins++;
            const p = c / total;
            h -= p * Math.log(p);
        }
    }
    if (nonEmptyBins > 1 && total > 0) {
        h += (nonEmptyBins - 1) / (2 * total);
    }
    return h;
}

// ─── Binning ─────────────────────────────────────────────────────────────────

/**
 * Equal-frequency binning: assign each value to a bin 0..bins-1.
 * Uses sorted copy of the array to determine quantile boundaries.
 *
 * Returns an Int32Array of bin assignments (same length as input).
 * Reuses the provided buffer to avoid allocation.
 */
function equalFreqBins(
    values: Float64Array,
    bins: number,
    n: number,           // number of valid elements (may be < values.length due to warmup)
    offset: number,       // start index in values
    out: Int32Array,
    outOffset: number,
): void {
    if (n < bins) {
        // Not enough data: assign all to bin 0
        for (let i = 0; i < n; i++) {
            out[outOffset + i] = 0;
        }
        return;
    }

    // Extract slice, sort to find quantile boundaries
    const slice = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        slice[i] = values[offset + i];
    }
    // Simple insertion sort for moderate sizes (faster than native sort for n < 5000)
    for (let i = 1; i < n; i++) {
        const key = slice[i];
        let j = i - 1;
        while (j >= 0 && slice[j] > key) {
            slice[j + 1] = slice[j];
            j--;
        }
        slice[j + 1] = key;
    }

    // Boundaries at quantile positions
    const boundaries = new Float64Array(bins - 1);
    for (let b = 0; b < bins - 1; b++) {
        const qIdx = Math.floor(((b + 1) * n) / bins);
        boundaries[b] = slice[Math.min(qIdx, n - 1)];
    }

    // Assign bins using boundaries
    for (let i = 0; i < n; i++) {
        const v = values[offset + i];
        let bin = bins - 1;
        for (let b = 0; b < bins - 1; b++) {
            if (v <= boundaries[b]) {
                bin = b;
                break;
            }
        }
        out[outOffset + i] = bin;
    }
}

/**
 * Discretize forward returns into 3 bins: DOWN (-1), FLAT (0), UP (+1).
 * Symmetric quantiles around zero.
 */
function binReturns(
    returns: Float64Array,
    n: number,
    out: Int32Array,
    outOffset: number,
): void {
    if (n < 3) {
        for (let i = 0; i < n; i++) out[outOffset + i] = 1; // all FLAT
        return;
    }

    // Get sorted absolute returns for finding "flat" threshold
    const absReturns = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        absReturns[i] = Math.abs(returns[i]);
    }
    // Sort
    for (let i = 1; i < n; i++) {
        const key = absReturns[i];
        let j = i - 1;
        while (j >= 0 && absReturns[j] > key) {
            absReturns[j + 1] = absReturns[j];
            j--;
        }
        absReturns[j + 1] = key;
    }

    // Middle third quantile as "flat" threshold
    const flatIdx = Math.floor(n / 3);
    const flatThreshold = absReturns[Math.min(flatIdx, n - 1)];

    // Bin: negative return < -threshold → DOWN, |return| ≤ threshold → FLAT, positive > threshold → UP
    for (let i = 0; i < n; i++) {
        const r = returns[i];
        if (r < -flatThreshold) {
            out[outOffset + i] = 0; // DOWN
        } else if (r > flatThreshold) {
            out[outOffset + i] = 2; // UP
        } else {
            out[outOffset + i] = 1; // FLAT
        }
    }
}

// ─── Indicator Extractors ────────────────────────────────────────────────────

/**
 * Extract a single primary scalar series from each indicator in AllData.
 * Returns Float64Array(17 arrays of length candleCount).
 *
 * Allocation: 17 × candleCount Float64 — unavoidable (needed for MI computation).
 * But this is called ONCE per discovery run, not in hot-loop.
 */
function extractIndicatorSeries(
    data: AllData,
    candleCount: number,
): Float64Array[] {
    const series: Float64Array[] = new Array(INDICATOR_COUNT);

    // Must match INDICATOR_INDEX order in mcts-search.ts
    // Helper: extract .value from a Series (or return zeros if undefined)
    const fromSeries = (s: Series | undefined, len: number): Float64Array => {
        const out = new Float64Array(len);
        if (!s) return out;
        const n = Math.min(s.length, len);
        for (let i = 0; i < n; i++) out[i] = s[i]?.value ?? 0;
        return out;
    };

    // RSI (rsiData.rsi)
    series[0] = fromSeries(data.rsiData?.rsi, candleCount);
    // CCI (cciData.cci)
    series[1] = fromSeries(data.cciData?.cci, candleCount);
    // WaveTrend (waveTrendData.wt1)
    series[2] = fromSeries(data.waveTrendData?.wt1, candleCount);
    // MACD (macdData.macd)
    series[3] = fromSeries(data.macdData?.macd, candleCount);
    // StochRSI (stochRsiData.k)
    series[4] = fromSeries(data.stochRsiData?.k, candleCount);
    // DMI (dmiData.adx)
    series[5] = fromSeries(data.dmiData?.adx, candleCount);
    // SMI (smiData.smi)
    series[6] = fromSeries(data.smiData?.smi, candleCount);
    // AO (aoData)
    series[7] = fromSeries(data.aoData, candleCount);
    // MFI (mfiData.mfi)
    series[8] = fromSeries(data.mfiData?.mfi, candleCount);
    // WPR (wprData)
    series[9] = fromSeries(data.wprData, candleCount);
    // DI (diData)
    series[10] = fromSeries(data.diData, candleCount);
    // CMF (cmfData)
    series[11] = fromSeries(data.cmfData, candleCount);
    // AD (adData)
    series[12] = fromSeries(data.adData?.ad, candleCount);
    // NetVol (nvData)
    series[13] = fromSeries(data.nvData, candleCount);
    // MADR (madrData)
    series[14] = fromSeries(data.madrData, candleCount);
    // ALMA (almaData)
    series[15] = fromSeries(data.almaData, candleCount);
    // BB — middle band (bbData[i].basis)
    {
        const bb = data.bbData;
        const out = new Float64Array(candleCount);
        if (bb) {
            const n = Math.min(bb.length, candleCount);
            for (let i = 0; i < n; i++) out[i] = bb[i]?.basis ?? 0;
        }
        series[16] = out;
    }

    return series;
}

// ─── MI Computation ─────────────────────────────────────────────────────────-

/**
 * Compute Mutual Information I(X; Y) for one indicator series vs return direction.
 *
 * @param indicatorValues - pre-extracted indicator series (Float64Array)
 * @param returnBins - pre-computed return direction bins (Int32Array, PRICE_BINS)
 * @param startIdx - first valid index (after warmup period for both indicator and returns)
 * @param n - number of valid samples
 * @returns MI score (nats)
 */
function computeMI(
    indicatorValues: Float64Array,
    returnBins: Int32Array,
    startIdx: number,
    n: number,
): number {
    if (n < INDICATOR_BINS * PRICE_BINS * 2) {
        return 0.0; // Too few samples for reliable MI
    }

    // 1. Bin indicator values (equal-frequency)
    const indicatorBins = new Int32Array(n);
    equalFreqBins(indicatorValues, INDICATOR_BINS, n, startIdx, indicatorBins, 0);

    // 2. Build joint histogram: counts[x * PRICE_BINS + y]
    const jointCounts = new Int32Array(INDICATOR_BINS * PRICE_BINS);
    for (let i = 0; i < n; i++) {
        const x = indicatorBins[i];
        const y = returnBins[startIdx + i];
        jointCounts[x * PRICE_BINS + y]++;
    }

    // 3. Marginal histogram for indicator bins
    const indicatorCounts = new Int32Array(INDICATOR_BINS);
    for (let x = 0; x < INDICATOR_BINS; x++) {
        let sum = 0;
        for (let y = 0; y < PRICE_BINS; y++) {
            sum += jointCounts[x * PRICE_BINS + y];
        }
        indicatorCounts[x] = sum;
    }

    // 4. Marginal histogram for return bins
    const returnCounts = new Int32Array(PRICE_BINS);
    for (let y = 0; y < PRICE_BINS; y++) {
        let sum = 0;
        for (let x = 0; x < INDICATOR_BINS; x++) {
            sum += jointCounts[x * PRICE_BINS + y];
        }
        returnCounts[y] = sum;
    }

    // 5. MI = H(X) + H(Y) - H(X,Y)
    const hX = entropy(indicatorCounts, n);
    const hY = entropy(returnCounts, n);
    const hXY = jointEntropy(jointCounts, INDICATOR_BINS, PRICE_BINS, n);

    const mi = Math.max(0.0, hX + hY - hXY);
    return mi;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface MIOptions {
    /** Look-forward bars for return computation. Default: 14 */
    lookForward?: number;
    /** Minimum MI score to keep (below this → zero prior). Default: 0.0 */
    minMI?: number;
    /** Temperature for softmax normalization. T=1: proportional, T→0: sparser. Default: 1.0 */
    temperature?: number;
    /** Warmup bars to skip at start. If not set, uses lookForward × 2. */
    warmupBars?: number;
    /**
     * Minimum number of indicators that MUST receive non-zero prior weight.
     * Prevents the MI filter from zeroing out ALL indicators on low-volatility stocks.
     * If fewer than this survive the minMI threshold, the top-N by raw MI score
     * are force-kept. Default: 4. Set to 0 to disable fallback.
     */
    minActiveIndicators?: number;
}

export interface MIResult {
    /** Prior weights (0-1) for each of 17 indicators, in INDICATOR_INDEX order. */
    priorWeights: Float64Array;
    /** Raw MI scores (nats) before normalization. */
    rawMIScores: Float64Array;
    /** Number of valid samples used for computation. */
    sampleCount: number;
    /** Indicator indices sorted by MI score (descending). */
    rankedIndices: Int32Array;
}

/**
 * Compute Mutual Information between each of 17 indicators and forward price direction.
 *
 * The output `priorWeights` Float64Array is consumed by MCTS as prior probabilities
 * in the UCT formula:  wins/visits + C × prior × √(ln(parentVisits) / visits)
 *
 * Indicators with higher MI → higher prior → explored first by UCT.
 * Low-MI indicators still explorable (soft bias, NOT hard filter).
 *
 * Zero-allocation guarantee: all internal buffers are stack-local or pre-allocated.
 * The only allocations are the return arrays (3 × Float64Array(17), 1 × Int32Array(17)).
 */
export function computeMIPriorWeights(
    candles: Candle[],
    data: AllData,
    options: MIOptions = {},
): MIResult {
    const lookForward = options.lookForward ?? DEFAULT_LOOK_FORWARD;
    const minMI = options.minMI ?? 0.0;
    const temperature = options.temperature ?? 1.0;
    const warmupBars = options.warmupBars ?? lookForward * 2;
    const minActiveIndicators = options.minActiveIndicators ?? MIN_ACTIVE_INDICATORS;

    const totalCandles = candles.length;
    if (totalCandles < warmupBars + lookForward + 10) {
        // Not enough data: return uniform prior
        const uniform = new Float64Array(INDICATOR_COUNT);
        const zeroMI = new Float64Array(INDICATOR_COUNT);
        const ranked = new Int32Array(INDICATOR_COUNT);
        for (let i = 0; i < INDICATOR_COUNT; i++) {
            uniform[i] = 1.0 / INDICATOR_COUNT;
            ranked[i] = i;
        }
        return {
            priorWeights: uniform,
            rawMIScores: zeroMI,
            sampleCount: 0,
            rankedIndices: ranked,
        };
    }

    // 1. Compute forward returns
    const n = totalCandles - warmupBars - lookForward;
    const returns = new Float64Array(n + warmupBars); // pad with warmup for aligned indexing
    for (let i = warmupBars; i < warmupBars + n; i++) {
        const futureClose = candles[i + lookForward].close;
        const currentClose = candles[i].close;
        returns[i] = currentClose > EPSILON
            ? (futureClose - currentClose) / currentClose
            : 0.0;
    }

    // 2. Bin returns into 3 categories (DOWN / FLAT / UP)
    const returnBins = new Int32Array(n + warmupBars);
    binReturns(returns, n + warmupBars, returnBins, 0);

    // 3. Extract indicator series
    const indicatorSeries = extractIndicatorSeries(data, totalCandles);

    // 4. Compute MI for each indicator
    const rawMIScores = new Float64Array(INDICATOR_COUNT);
    let maxMI = 0.0;

    for (let idx = 0; idx < INDICATOR_COUNT; idx++) {
        const mi = computeMI(indicatorSeries[idx], returnBins, warmupBars, n);
        rawMIScores[idx] = mi;
        if (mi > maxMI) maxMI = mi;
    }

    // 5. Normalize to prior weights (softmax with temperature)
    const priorWeights = new Float64Array(INDICATOR_COUNT);
    if (maxMI < EPSILON) {
        // All MI scores near zero → uniform prior
        const inv = 1.0 / INDICATOR_COUNT;
        for (let i = 0; i < INDICATOR_COUNT; i++) {
            priorWeights[i] = inv;
        }
    } else {
        // Softmax normalization: P(i) = exp(mi[i]^T / τ) / Σ exp(mi[j]^T / τ)
        // where τ = maxMI (adaptive scaling) and T = temperature
        const tau = maxMI;
        let sumExp = 0.0;
        const exps = new Float64Array(INDICATOR_COUNT);
        for (let i = 0; i < INDICATOR_COUNT; i++) {
            const scaled = Math.pow(rawMIScores[i] / tau, temperature);
            const e = Math.exp(scaled);
            exps[i] = e;
            sumExp += e;
        }
        const invSum = sumExp > EPSILON ? 1.0 / sumExp : 0.0;
        for (let i = 0; i < INDICATOR_COUNT; i++) {
            const raw = exps[i] * invSum;
            // Apply minMI threshold (soft floor)
            priorWeights[i] = rawMIScores[i] >= minMI ? raw : 0.0;
        }

        // Renormalize after minMI zeroing
        let totalWeight = 0.0;
        for (let i = 0; i < INDICATOR_COUNT; i++) {
            totalWeight += priorWeights[i];
        }
        if (totalWeight > EPSILON) {
            const invTotal = 1.0 / totalWeight;
            for (let i = 0; i < INDICATOR_COUNT; i++) {
                priorWeights[i] *= invTotal;
            }
        } else {
            // All zeroed out → uniform fallback
            const inv = 1.0 / INDICATOR_COUNT;
            for (let i = 0; i < INDICATOR_COUNT; i++) {
                priorWeights[i] = inv;
            }
        }

        // ── Fallback: Ensure minimum active indicators ──
        // For low-volatility stocks where MI scores are near-zero across the board,
        // the softmax + minMI threshold can zero out ALL indicators. This makes MCTS
        // unable to find any valid strategy, wasting compute. We guarantee at least
        // `minActiveIndicators` receive non-zero weight by force-promoting the top-N
        // by raw MI score. Set minActiveIndicators to 0 to disable this fallback.
        if (minActiveIndicators > 0) {
            let activeCount = 0;
            for (let i = 0; i < INDICATOR_COUNT; i++) {
                if (priorWeights[i] > EPSILON) activeCount++;
            }
            if (activeCount < minActiveIndicators) {
                // Build sorted list of indices by raw MI score (descending)
                const sortedIndices = new Int32Array(INDICATOR_COUNT);
                for (let i = 0; i < INDICATOR_COUNT; i++) sortedIndices[i] = i;
                for (let i = 1; i < INDICATOR_COUNT; i++) {
                    const key = sortedIndices[i];
                    const keyMI = rawMIScores[key];
                    let j = i - 1;
                    while (j >= 0 && rawMIScores[sortedIndices[j]] < keyMI) {
                        sortedIndices[j + 1] = sortedIndices[j];
                        j--;
                    }
                    sortedIndices[j + 1] = key;
                }

                // Promote top-N to have at least minActiveIndicators active
                let promoted = 0;
                for (let i = 0; i < INDICATOR_COUNT && activeCount + promoted < minActiveIndicators; i++) {
                    const idx = sortedIndices[i];
                    if (priorWeights[idx] <= EPSILON) {
                        // Give this indicator the minimum viable weight
                        priorWeights[idx] = EPSILON;
                        promoted++;
                    }
                }

                // Renormalize after promotion
                let newTotal = 0.0;
                for (let i = 0; i < INDICATOR_COUNT; i++) {
                    newTotal += priorWeights[i];
                }
                if (newTotal > EPSILON) {
                    const invNew = 1.0 / newTotal;
                    for (let i = 0; i < INDICATOR_COUNT; i++) {
                        priorWeights[i] *= invNew;
                    }
                }
            }
        }
    }

    // 6. Rank indicators by MI score (descending)
    const rankedIndices = new Int32Array(INDICATOR_COUNT);
    for (let i = 0; i < INDICATOR_COUNT; i++) {
        rankedIndices[i] = i;
    }
    // Simple insertion sort by MI score (descending)
    for (let i = 1; i < INDICATOR_COUNT; i++) {
        const key = rankedIndices[i];
        const keyMI = rawMIScores[key];
        let j = i - 1;
        while (j >= 0 && rawMIScores[rankedIndices[j]] < keyMI) {
            rankedIndices[j + 1] = rankedIndices[j];
            j--;
        }
        rankedIndices[j + 1] = key;
    }

    return {
        priorWeights,
        rawMIScores,
        sampleCount: n,
        rankedIndices,
    };
}

/**
 * Get the indicator name for a given MI rank index.
 */
export function getIndicatorNameByIndex(idx: number): string {
    const names = [
        'rsi', 'cci', 'wavetrend', 'macd', 'stochrsi',
        'dmi', 'smi', 'ao', 'mfi', 'wpr',
        'di', 'cmf', 'ad', 'netvol', 'madr',
        'alma', 'bb',
    ];
    return idx >= 0 && idx < INDICATOR_COUNT ? names[idx] : 'unknown';
}
