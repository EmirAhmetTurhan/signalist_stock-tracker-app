/**
 * Candle Pattern Recognition Engine
 * Detects 12 classic candlestick patterns from OHLC data.
 */

export type PatternType =
    | 'DOJI'
    | 'HAMMER'
    | 'INVERTED_HAMMER'
    | 'SHOOTING_STAR'
    | 'HANGING_MAN'
    | 'BULLISH_ENGULFING'
    | 'BEARISH_ENGULFING'
    | 'MORNING_STAR'
    | 'EVENING_STAR'
    | 'BULLISH_HARAMI'
    | 'BEARISH_HARAMI'
    | 'THREE_WHITE_SOLDIERS'
    | 'THREE_BLACK_CROWS'
    | 'TWEEZER_BOTTOM'
    | 'TWEEZER_TOP';

export type PatternSignal = 'bullish' | 'bearish' | 'neutral';

export interface CandlePattern {
    time: string | number;
    pattern: PatternType;
    signal: PatternSignal;
    label: string;
    description: string;
    /** 0–1 confidence score */
    strength: number;
}

type C = CandleDataPoint;

// ─── Helpers ────────────────────────────────────────────────────────────────

const body = (c: C) => Math.abs(c.close - c.open);
const range = (c: C) => c.high - c.low;
const upperWick = (c: C) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: C) => Math.min(c.open, c.close) - c.low;
const isBull = (c: C) => c.close > c.open;
const isBear = (c: C) => c.close < c.open;
const midpoint = (c: C) => (c.open + c.close) / 2;

// ─── Single-candle patterns ──────────────────────────────────────────────────

function detectDoji(c: C): boolean {
    const b = body(c);
    const r = range(c);
    return r > 0 && b / r < 0.1;
}

function detectHammer(c: C, prevTrend: 'down' | 'up' | 'none'): boolean {
    if (prevTrend !== 'down') return false;
    const b = body(c);
    const lw = lowerWick(c);
    const uw = upperWick(c);
    const r = range(c);
    return r > 0 && lw >= 2 * b && uw <= 0.3 * b && b > 0;
}

function detectInvertedHammer(c: C, prevTrend: 'down' | 'up' | 'none'): boolean {
    if (prevTrend !== 'down') return false;
    const b = body(c);
    const lw = lowerWick(c);
    const uw = upperWick(c);
    return uw >= 2 * b && lw <= 0.3 * b && b > 0;
}

function detectShootingStar(c: C, prevTrend: 'down' | 'up' | 'none'): boolean {
    if (prevTrend !== 'up') return false;
    const b = body(c);
    const lw = lowerWick(c);
    const uw = upperWick(c);
    return uw >= 2 * b && lw <= 0.3 * b && b > 0;
}

function detectHangingMan(c: C, prevTrend: 'down' | 'up' | 'none'): boolean {
    if (prevTrend !== 'up') return false;
    const b = body(c);
    const lw = lowerWick(c);
    const uw = upperWick(c);
    return lw >= 2 * b && uw <= 0.3 * b && b > 0;
}

// ─── Two-candle patterns ─────────────────────────────────────────────────────

function detectBullishEngulfing(prev: C, curr: C): boolean {
    return isBear(prev) && isBull(curr) &&
        curr.open < prev.close &&
        curr.close > prev.open &&
        body(curr) > body(prev);
}

function detectBearishEngulfing(prev: C, curr: C): boolean {
    return isBull(prev) && isBear(curr) &&
        curr.open > prev.close &&
        curr.close < prev.open &&
        body(curr) > body(prev);
}

function detectBullishHarami(prev: C, curr: C): boolean {
    return isBear(prev) && isBull(curr) &&
        curr.open > prev.close &&
        curr.close < prev.open &&
        body(curr) < body(prev) * 0.5;
}

function detectBearishHarami(prev: C, curr: C): boolean {
    return isBull(prev) && isBear(curr) &&
        curr.open < prev.close &&
        curr.close > prev.open &&
        body(curr) < body(prev) * 0.5;
}

function detectTweezerBottom(prev: C, curr: C): boolean {
    const lowDiff = Math.abs(prev.low - curr.low) / prev.low;
    return isBear(prev) && isBull(curr) && lowDiff < 0.002;
}

function detectTweezerTop(prev: C, curr: C): boolean {
    const highDiff = Math.abs(prev.high - curr.high) / prev.high;
    return isBull(prev) && isBear(curr) && highDiff < 0.002;
}

// ─── Three-candle patterns ───────────────────────────────────────────────────

function detectMorningStar(c1: C, c2: C, c3: C): boolean {
    if (!isBear(c1) || !isBull(c3)) return false;
    const smallBody = body(c2) < body(c1) * 0.4;
    const gapDown = Math.max(c2.open, c2.close) < c1.close;
    const bullishClose = c3.close > midpoint(c1);
    return smallBody && gapDown && bullishClose;
}

function detectEveningStar(c1: C, c2: C, c3: C): boolean {
    if (!isBull(c1) || !isBear(c3)) return false;
    const smallBody = body(c2) < body(c1) * 0.4;
    const gapUp = Math.min(c2.open, c2.close) > c1.close;
    const bearishClose = c3.close < midpoint(c1);
    return smallBody && gapUp && bearishClose;
}

function detectThreeWhiteSoldiers(c1: C, c2: C, c3: C): boolean {
    return isBull(c1) && isBull(c2) && isBull(c3) &&
        c2.open > c1.open && c2.close > c1.close &&
        c3.open > c2.open && c3.close > c2.close &&
        upperWick(c1) < body(c1) * 0.3 &&
        upperWick(c2) < body(c2) * 0.3 &&
        upperWick(c3) < body(c3) * 0.3;
}

function detectThreeBlackCrows(c1: C, c2: C, c3: C): boolean {
    return isBear(c1) && isBear(c2) && isBear(c3) &&
        c2.open < c1.open && c2.close < c1.close &&
        c3.open < c2.open && c3.close < c2.close &&
        lowerWick(c1) < body(c1) * 0.3 &&
        lowerWick(c2) < body(c2) * 0.3 &&
        lowerWick(c3) < body(c3) * 0.3;
}

// ─── Trend detector ──────────────────────────────────────────────────────────

function getTrend(candles: C[], endIdx: number, lookback = 5): 'up' | 'down' | 'none' {
    if (endIdx < lookback) return 'none';
    const slice = candles.slice(endIdx - lookback, endIdx);
    const first = slice[0].close;
    const last = slice[slice.length - 1].close;
    const change = (last - first) / first;
    if (change > 0.02) return 'up';
    if (change < -0.02) return 'down';
    return 'none';
}

// ─── Pattern strength helper ─────────────────────────────────────────────────

function patternStrength(candle: C): number {
    const bodyRatio = body(candle) / (range(candle) || 1);
    return Math.min(1, 0.5 + bodyRatio * 0.5);
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function detectCandlePatterns(candles: C[]): CandlePattern[] {
    const results: CandlePattern[] = [];
    const MIN_RANGE_THRESHOLD = 0.0005; // avoid flat / no-data candles

    for (let i = 2; i < candles.length; i++) {
        const c0 = candles[i - 2];
        const c1 = candles[i - 1];
        const c2 = candles[i];

        if (range(c2) / (c2.close || 1) < MIN_RANGE_THRESHOLD) continue;

        const trend = getTrend(candles, i);

        // --- Single candle ---
        if (detectDoji(c2)) {
            results.push({
                time: c2.time,
                pattern: 'DOJI',
                signal: 'neutral',
                label: 'Doji',
                description: 'Indecision: buyers and sellers are in balance. Watch for a potential trend reversal.',
                strength: 0.5,
            });
        }

        if (detectHammer(c2, trend)) {
            results.push({
                time: c2.time,
                pattern: 'HAMMER',
                signal: 'bullish',
                label: 'Hammer',
                description: 'Strong buying pressure at the end of a downtrend. Potential bullish reversal ahead.',
                strength: patternStrength(c2),
            });
        }

        if (detectInvertedHammer(c2, trend)) {
            results.push({
                time: c2.time,
                pattern: 'INVERTED_HAMMER',
                signal: 'bullish',
                label: 'Inverted Hammer',
                description: 'Buyers attempting to take control after a downtrend. Wait for confirmation.',
                strength: patternStrength(c2) * 0.8,
            });
        }

        if (detectShootingStar(c2, trend)) {
            results.push({
                time: c2.time,
                pattern: 'SHOOTING_STAR',
                signal: 'bearish',
                label: 'Shooting Star',
                description: 'Buyers lost momentum in an uptrend. Bearish reversal signal.',
                strength: patternStrength(c2),
            });
        }

        if (detectHangingMan(c2, trend)) {
            results.push({
                time: c2.time,
                pattern: 'HANGING_MAN',
                signal: 'bearish',
                label: 'Hanging Man',
                description: 'Dangerous selling pressure at the top of an uptrend. Elevated downside risk.',
                strength: patternStrength(c2),
            });
        }

        // --- Two candles ---
        if (detectBullishEngulfing(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'BULLISH_ENGULFING',
                signal: 'bullish',
                label: 'Bullish Engulfing',
                description: 'A large green candle engulfs the previous red one. Strong bullish reversal signal.',
                strength: Math.min(1, body(c2) / (body(c1) || 1) * 0.6),
            });
        }

        if (detectBearishEngulfing(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'BEARISH_ENGULFING',
                signal: 'bearish',
                label: 'Bearish Engulfing',
                description: 'A large red candle engulfs the previous green one. Strong bearish reversal signal.',
                strength: Math.min(1, body(c2) / (body(c1) || 1) * 0.6),
            });
        }

        if (detectBullishHarami(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'BULLISH_HARAMI',
                signal: 'bullish',
                label: 'Bullish Harami',
                description: 'A small green candle contained within a large red one. Gradual bullish reversal signal.',
                strength: 0.55,
            });
        }

        if (detectBearishHarami(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'BEARISH_HARAMI',
                signal: 'bearish',
                label: 'Bearish Harami',
                description: 'A small red candle contained within a large green one. Potential bearish reversal.',
                strength: 0.55,
            });
        }

        if (detectTweezerBottom(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'TWEEZER_BOTTOM',
                signal: 'bullish',
                label: 'Tweezer Bottom',
                description: 'Two consecutive candles tested the same low. Strong support zone identified.',
                strength: 0.7,
            });
        }

        if (detectTweezerTop(c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'TWEEZER_TOP',
                signal: 'bearish',
                label: 'Tweezer Top',
                description: 'Two consecutive candles hit the same high. Strong resistance zone identified.',
                strength: 0.7,
            });
        }

        // --- Three candles ---
        if (detectMorningStar(c0, c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'MORNING_STAR',
                signal: 'bullish',
                label: 'Morning Star',
                description: 'Three-candle pattern: bearish, small indecision, strong bullish. Classic reversal signal.',
                strength: 0.85,
            });
        }

        if (detectEveningStar(c0, c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'EVENING_STAR',
                signal: 'bearish',
                label: 'Evening Star',
                description: 'Three-candle pattern: bullish, small indecision, strong bearish. Classic reversal signal.',
                strength: 0.85,
            });
        }

        if (detectThreeWhiteSoldiers(c0, c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'THREE_WHITE_SOLDIERS',
                signal: 'bullish',
                label: 'Three White Soldiers',
                description: 'Three consecutive strong green candles. Confirms bullish momentum continuation.',
                strength: 0.9,
            });
        }

        if (detectThreeBlackCrows(c0, c1, c2)) {
            results.push({
                time: c2.time,
                pattern: 'THREE_BLACK_CROWS',
                signal: 'bearish',
                label: 'Three Black Crows',
                description: 'Three consecutive strong red candles. Selling pressure is sustained.',
                strength: 0.9,
            });
        }
    }

    // Return only the last 60 candles' worth of patterns to keep it manageable
    const cutoffTime = candles.length > 60 ? Number(candles[candles.length - 60].time) : Number(candles[0]?.time ?? 0);
    return results.filter(p => Number(p.time) >= cutoffTime);
}
