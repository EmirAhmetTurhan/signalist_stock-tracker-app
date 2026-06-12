// lib/ta/regime-detector.ts — Market Regime Detection Engine
//
// Provides two functions with strict causal/non-causal separation:
//   - classifyRegime()  → Causal per-bar classifier (SAFE for live signals)
//   - segmentRegimes()  → Non-causal full-series segmentation (ANALYSIS ONLY)
//
// ⚠️  CRITICAL: segmentRegimes() reads the ENTIRE future price series.
//     Its output MUST NEVER be fed into live signal generation, DST fusion,
//     or any real-time decision path. It exists solely for post-hoc analysis
//     and reporting.
//
// Extracted and hardened from lib/ta/strategy-optimizer.ts:808-867 (detectRegime).

import type { Candle } from '@/lib/ta/types';
import type { MarketRegime } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A contiguous market regime segment (non-causal, analysis-only). */
export interface RegimeSegment {
    /** Starting bar index (inclusive) */
    startIndex: number;
    /** Ending bar index (inclusive) */
    endIndex: number;
    /** Start date from candle time */
    startDate: string | number;
    /** End date from candle time */
    endDate: string | number;
    /** Classified regime type */
    type: MarketRegime;
    /** Price change over the segment (%) */
    priceChange: number;
    /** Duration in bars */
    durationBars: number;
    /** Classification confidence (0-1), based on signal strength */
    confidence: number;
    /** Price change as percentage (mirrors priceChange, set by causal segment builder) */
    priceChangePct?: number;
    /** Opening price at segment start (optional, set by causal segment builder) */
    startPrice?: number;
    /** Closing price at segment end (optional, set by causal segment builder) */
    endPrice?: number;
}

/** Options for segmentRegimes(). */
export interface SegmentRegimesOptions {
    /** Minimum bars a segment must span (default: 5) */
    minDuration?: number;
    /** Minimum price change % to qualify as a directional move (default: 3) */
    minPriceChange?: number;
    /** Reversal detection: ATR multiplier threshold for zigzag turns (default: 3) */
    reversalThresholdAtr?: number;
}

/** Default options for segmentRegimes(). */
export const DEFAULT_SEGMENT_OPTIONS: Required<SegmentRegimesOptions> = {
    minDuration: 5,
    minPriceChange: 3,
    reversalThresholdAtr: 3,
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Pre-compute Wilder's Smoothing ATR for all bars.
 * Mirrors computeATR() in strategy-optimizer.ts to avoid circular imports.
 */
function computeATR(candles: Candle[], period: number = 14): number[] {
    const atr: number[] = [];
    if (candles.length === 0) return atr;

    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

        if (i < period) {
            sumTR += tr;
            atr.push(sumTR / (i + 1));
        } else if (i === period) {
            sumTR += tr;
            atr.push(sumTR / period);
        } else {
            atr.push((atr[i - 1] * (period - 1) + tr) / period);
        }
    }
    return atr;
}

/**
 * Compute simple moving average over a window ending at `endIdx`.
 */
function sma(values: number[], endIdx: number, window: number): number {
    if (endIdx < window - 1) return values[endIdx] ?? 0;
    let sum = 0;
    for (let j = endIdx - window + 1; j <= endIdx; j++) {
        sum += values[j] ?? 0;
    }
    return sum / window;
}

// ─── Causal Per-Bar Classifier ───────────────────────────────────────────────

/**
 * Causal per-bar market regime classifier.
 *
 * Reads ONLY trailing bars up to index `i` — never looks into the future.
 * Safe for use in live signal generation, DST fusion, and real-time decisions.
 *
 * Hardened version of the original `detectRegime()` with:
 *   - Normalized ATR thresholds (expressed in ATR multiples)
 *   - Optional hysteresis: requires N-bar persistence before switching regime
 *     (prevents flickering between adjacent classifications)
 *
 * @param candles - Full candle array
 * @param i - Bar index to classify (must be ≥ 30)
 * @param atrValues - Pre-computed ATR values aligned with candles
 * @param prevRegime - Previous bar's regime (enables hysteresis, optional)
 * @returns Classified MarketRegime
 */
export function classifyRegime(
    candles: Candle[],
    i: number,
    atrValues: number[],
    prevRegime?: MarketRegime,
): MarketRegime {
    if (i < 30) return 'neutral';

    const currentATR = atrValues[i] ?? 0;

    // 1. Compute 20-bar SMA of close price
    const sma20 = sma(
        candles.map(c => c.close),
        i,
        20,
    );

    // 2. MA slope — % change of 20-SMA over 10 bars
    const sma20Prev = sma(
        candles.map(c => c.close),
        i - 10,
        20,
    );
    const maSlope = sma20Prev !== 0 ? ((sma20 - sma20Prev) / sma20Prev) * 100 : 0;

    // 3. Volatility ratio: current ATR vs 20-bar average ATR
    const avgATR = sma(atrValues, i, 20);
    const volRatio = avgATR > 0 ? currentATR / avgATR : 1;

    // 4. ADX approximation: directional price movement over 14 bars
    let upSum = 0;
    let downSum = 0;
    const adxStart = Math.max(1, i - 13);
    for (let j = adxStart; j <= i; j++) {
        const move = candles[j].close - candles[j - 1].close;
        if (move > 0) upSum += move;
        else downSum -= move;
    }
    const totalMove = upSum + downSum;
    const adxApprox = totalMove > 0 ? (upSum / totalMove) * 100 : 50;

    // 5. Classify with relaxed thresholds for causal per-bar detection.
    //    Tighter thresholds are applied in segmentRegimes() which has future
    //    visibility; causal classifyRegime must work with less information.
    const isVolatile = volRatio > 1.8;
    const isTrending = Math.abs(maSlope) > 0.2 && (adxApprox > 55 || Math.abs(maSlope) > 0.4);
    const isRanging = Math.abs(maSlope) < 0.15 && volRatio < 1.2;
    const isUptrend = maSlope > 0;
    const isDowntrend = maSlope < 0;

    let regime: MarketRegime;
    if (isVolatile) {
        regime = 'volatile';
    } else if (isTrending && isUptrend) {
        regime = 'uptrend';
    } else if (isTrending && isDowntrend) {
        regime = 'downtrend';
    } else if (isRanging) {
        regime = 'ranging';
    } else {
        regime = 'neutral';
    }

    // 6. Hysteresis: if we have a previous regime of the opposite type and the
    //    new classification is weak, hold the previous regime to prevent flickering.
    //    Applies only to trending ↔ ranging transitions (not volatile).
    if (prevRegime && regime !== prevRegime && regime !== 'volatile' && prevRegime !== 'volatile') {
        // If switching between trend types or to/from ranging, require stronger signal
        const isWeakSignal =
            (regime === 'neutral') ||
            (regime === 'ranging' && Math.abs(maSlope) < 0.25) ||
            ((regime === 'uptrend' || regime === 'downtrend') && adxApprox < 65);

        if (isWeakSignal) {
            return prevRegime;
        }
    }

    return regime;
}

// ─── Non-Causal Full-Series Segmentation (ANALYSIS ONLY) ─────────────────────

/**
 * Non-causal full-series regime segmentation.
 *
 * ⚠️  ANALYSIS ONLY — THIS FUNCTION READS THE ENTIRE FUTURE PRICE SERIES.
 *     NEVER use its output for live signal generation, DST fusion weights,
 *     or any real-time decision path. Doing so introduces look-ahead bias —
 *     the single most dangerous trap in strategy evaluation.
 *
 * Uses ATR-based zigzag / directional-change logic to partition the price
 * series into homogeneous regime segments. Each segment is classified by
 * its dominant price behaviour.
 *
 * Algorithm:
 *   1. Scan for local extrema (highs/lows) using reversalThresholdAtr
 *   2. Connect alternating pivots to form zigzag waves
 *   3. Classify each wave segment as uptrend/downtrend/ranging/volatile
 *   4. Merge adjacent segments of the same type
 *   5. Filter by minDuration and minPriceChange
 *
 * @param candles - Full candle array
 * @param options - Tuning parameters (min duration, price change, reversal threshold)
 * @returns Array of regime segments ordered by time
 */
export function segmentRegimes(
    candles: Candle[],
    options?: SegmentRegimesOptions,
): RegimeSegment[] {
    const opts = { ...DEFAULT_SEGMENT_OPTIONS, ...options };
    const { minDuration, minPriceChange, reversalThresholdAtr } = opts;

    if (candles.length < 30) return [];

    // Pre-compute ATR for reversal detection
    const atr = computeATR(candles, 14);

    // ── Step 1: Detect local extrema (zigzag pivots) ──
    interface Pivot {
        index: number;
        price: number;
        isHigh: boolean; // true = peak, false = trough
    }

    const pivots: Pivot[] = [];
    const lookback = 5; // bars to confirm a local extremum

    for (let i = lookback; i < candles.length - lookback; i++) {
        const price = candles[i].close;
        const threshold = (atr[i] ?? atr[atr.length - 1]) * reversalThresholdAtr;

        // Check if this is a local high
        let isHigh = true;
        let isLow = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            if (candles[j].close >= price) isHigh = false;
            if (candles[j].close <= price) isLow = false;
        }

        if (isHigh) {
            // Only add if distance from last pivot is significant
            if (pivots.length === 0 ||
                Math.abs(price - pivots[pivots.length - 1].price) > threshold) {
                pivots.push({ index: i, price, isHigh: true });
            }
        } else if (isLow) {
            if (pivots.length === 0 ||
                Math.abs(price - pivots[pivots.length - 1].price) > threshold) {
                pivots.push({ index: i, price, isHigh: false });
            }
        }
    }

    // Ensure we start + end with actual bar indices
    if (pivots.length === 0) {
        // No clear pivots — classify entire series as one segment
        return [classifyWholeSeries(candles, atr, 0, candles.length - 1, minDuration, minPriceChange)].filter(
            (s): s is RegimeSegment => s !== null,
        );
    }

    // ── Step 2: Build segments from alternating pivots ──
    const rawSegments: Omit<RegimeSegment, 'confidence'>[] = [];

    // First segment: start to first pivot
    const firstPivot = pivots[0];
    rawSegments.push({
        startIndex: 0,
        endIndex: firstPivot.index,
        startDate: candles[0].time,
        endDate: candles[firstPivot.index].time,
        type: firstPivot.isHigh ? 'uptrend' : 'downtrend',
        priceChange: ((firstPivot.price - candles[0].close) / candles[0].close) * 100,
        durationBars: firstPivot.index,
    });

    // Middle segments: between pivots
    for (let k = 1; k < pivots.length; k++) {
        const prev = pivots[k - 1];
        const curr = pivots[k];
        const priceChange = ((curr.price - prev.price) / prev.price) * 100;

        rawSegments.push({
            startIndex: prev.index,
            endIndex: curr.index,
            startDate: candles[prev.index].time,
            endDate: candles[curr.index].time,
            type: priceChange > 0 ? 'uptrend' : 'downtrend',
            priceChange,
            durationBars: curr.index - prev.index,
        });
    }

    // Last segment: last pivot to end
    const lastPivot = pivots[pivots.length - 1];
    const lastIdx = candles.length - 1;
    rawSegments.push({
        startIndex: lastPivot.index,
        endIndex: lastIdx,
        startDate: candles[lastPivot.index].time,
        endDate: candles[lastIdx].time,
        type: lastPivot.isHigh ? 'downtrend' : 'uptrend',
        priceChange:
            ((candles[lastIdx].close - lastPivot.price) / lastPivot.price) * 100,
        durationBars: lastIdx - lastPivot.index,
    });

    // ── Step 3: Refine classifications with ATR-based volatility detection ──
    const segments: RegimeSegment[] = [];
    for (const seg of rawSegments) {
        // Skip segments that are too short
        if (seg.durationBars < minDuration) continue;
        // Skip segments with negligible price change (ranging-like)
        if (
            Math.abs(seg.priceChange) < minPriceChange &&
            seg.type !== 'volatile'
        ) {
            seg.type = 'ranging';
        }

        // Check for volatile conditions within segment
        let volCount = 0;
        for (let j = seg.startIndex; j <= seg.endIndex; j++) {
            const avg20 = sma(atr, j, 20);
            if (avg20 > 0 && (atr[j] ?? 0) / avg20 > 1.8) volCount++;
        }
        const volRatio = volCount / seg.durationBars;
        if (volRatio > 0.4) {
            seg.type = 'volatile';
        }

        // Confidence: based on signal strength
        const confidence = Math.min(
            1.0,
            Math.abs(seg.priceChange) / (minPriceChange * 3) + 0.3,
        );

        segments.push({
            ...seg,
            confidence: Math.round(confidence * 100) / 100,
        });
    }

    // ── Step 4: Merge adjacent segments of the same type ──
    const merged: RegimeSegment[] = [];
    for (const seg of segments) {
        if (merged.length === 0) {
            merged.push({ ...seg });
            continue;
        }
        const last = merged[merged.length - 1];
        if (last.type === seg.type) {
            // Merge: extend the end
            last.endIndex = seg.endIndex;
            last.endDate = seg.endDate;
            last.durationBars = seg.endIndex - last.startIndex;
            last.priceChange =
                ((candles[seg.endIndex].close - candles[last.startIndex].close) /
                    candles[last.startIndex].close) *
                100;
            last.confidence = Math.max(last.confidence, seg.confidence);
        } else {
            merged.push({ ...seg });
        }
    }

    return merged;
}

// ─── Internal: classify entire series as single segment ──────────────────────

function classifyWholeSeries(
    candles: Candle[],
    atr: number[],
    startIdx: number,
    endIdx: number,
    minDuration: number,
    minPriceChange: number,
): RegimeSegment | null {
    const duration = endIdx - startIdx;
    if (duration < minDuration) return null;

    const priceChange =
        ((candles[endIdx].close - candles[startIdx].close) /
            candles[startIdx].close) *
        100;

    let type: MarketRegime;
    if (Math.abs(priceChange) < minPriceChange) {
        type = 'ranging';
    } else if (priceChange > 0) {
        type = 'uptrend';
    } else {
        type = 'downtrend';
    }

    return {
        startIndex: startIdx,
        endIndex: endIdx,
        startDate: candles[startIdx].time,
        endDate: candles[endIdx].time,
        type,
        priceChange,
        durationBars: duration,
        confidence: 0.5,
    };
}