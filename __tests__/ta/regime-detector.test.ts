// __tests__/ta/regime-detector.test.ts — Regime Detection Engine tests
// Tests causal/non-causal separation, synthetic regimes, and hysteresis

import { describe, it, expect } from 'vitest';
import { classifyRegime, segmentRegimes } from '@/lib/ta/regime-detector';
import type { Candle } from '@/lib/ta/backtest';
import type { MarketRegime } from '@/lib/ta/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create synthetic candles from an array of close prices */
function makeCandles(prices: number[]): Candle[] {
    return prices.map((close, i) => ({
        time: `2024-01-${String(i + 1).padStart(2, '0')}`,
        close,
        high: close * 1.01,
        low: close * 0.99,
        open: close,
        volume: 1000000,
    }));
}

/** Create synthetic ATR values (constant) */
function makeATR(length: number, value: number): number[] {
    return Array(length).fill(value);
}

/** Create a linearly rising price series (strong uptrend) */
function makeUptrend(length: number, start: number = 100, increment: number = 1): Candle[] {
    const prices: number[] = [];
    for (let i = 0; i < length; i++) {
        prices.push(start + i * increment);
    }
    return makeCandles(prices);
}

/** Create a linearly falling price series (strong downtrend) */
function makeDowntrend(length: number, start: number = 100, decrement: number = 1): Candle[] {
    const prices: number[] = [];
    for (let i = 0; i < length; i++) {
        prices.push(start - i * decrement);
    }
    return makeCandles(prices);
}

/** Create a flat/sideways price series (ranging) */
function makeRanging(length: number, center: number = 100, amplitude: number = 0.5): Candle[] {
    const prices: number[] = [];
    for (let i = 0; i < length; i++) {
        prices.push(center + Math.sin(i * 0.3) * amplitude);
    }
    return makeCandles(prices);
}

/** Create a volatile price series (shock-like) */
function makeVolatile(length: number, center: number = 100): Candle[] {
    const prices: number[] = [];
    for (let i = 0; i < length; i++) {
        // Alternating large swings
        const swing = (i % 5 === 0) ? center * 0.05 : (i % 3 === 0 ? center * 0.03 : 0);
        prices.push(center + (Math.random() - 0.5) * 8 + swing * (i % 2 === 0 ? 1 : -1));
    }
    return makeCandles(prices);
}

// ─── classifyRegime Tests ────────────────────────────────────────────────────

describe('classifyRegime', () => {
    it('uptrend: rising prices with high ADX', () => {
        const candles = makeUptrend(60, 100, 1); // +60 points over 60 bars
        const atr = makeATR(candles.length, 1);

        // Check at bar 50 (well into the uptrend)
        const regime = classifyRegime(candles, 50, atr);
        expect(regime).toBe('uptrend');
    });

    it('downtrend: falling prices with high ADX', () => {
        const candles = makeDowntrend(60, 100, 1); // -60 points
        const atr = makeATR(candles.length, 1);

        const regime = classifyRegime(candles, 50, atr);
        expect(regime).toBe('downtrend');
    });

    it('ranging: flat prices, low ATR ratio', () => {
        const candles = makeRanging(60, 100, 0.2); // Very tight range
        const atr = makeATR(candles.length, 0.5);

        const regime = classifyRegime(candles, 50, atr);
        expect(regime).toBe('ranging');
    });

    it('volatile: high ATR ratio near shock bars', () => {
        const candles = makeVolatile(60, 100);
        // Make ATR spike at bar 50
        const atr = makeATR(candles.length, 2);
        atr[50] = 10; // 5x spike

        const regime = classifyRegime(candles, 50, atr);
        expect(regime).toBe('volatile');
    });

    it('neutral: bar index < 30 returns neutral', () => {
        const candles = makeUptrend(60, 100, 1);
        const atr = makeATR(candles.length, 1);

        const regime = classifyRegime(candles, 10, atr);
        expect(regime).toBe('neutral');
    });

    it('does NOT read future bars (causal check)', () => {
        // Create candles where the future (i > 50) looks completely different
        const uptrendPrices: number[] = [];
        for (let i = 0; i < 50; i++) {
            uptrendPrices.push(100 + i);
        }
        // After bar 50, crash
        for (let i = 50; i < 100; i++) {
            uptrendPrices.push(50 - i * 0.1);
        }
        const candles = makeCandles(uptrendPrices);
        const atr = makeATR(candles.length, 1);

        // At bar 49, we're in a clear uptrend — should NOT see the upcoming crash
        const regime = classifyRegime(candles, 49, atr);
        expect(regime).toBe('uptrend');
        // If it were reading future bars, it might see the crash and classify differently
    });

    it('neutral: near-zero slope with moderate ADX', () => {
        const candles = makeRanging(60, 100, 0.3);
        const atr = makeATR(candles.length, 1);

        const regime = classifyRegime(candles, 40, atr);
        // Should be ranging or neutral (not uptrend/downtrend)
        expect(['ranging', 'neutral']).toContain(regime);
    });
});

// ─── segmentRegimes Tests ────────────────────────────────────────────────────

describe('segmentRegimes', () => {
    it('detects uptrend segments in rising market', () => {
        const candles = makeUptrend(200, 100, 0.5); // +100 points over 200 bars
        const segments = segmentRegimes(candles, {
            minDuration: 5,
            minPriceChange: 2,
            reversalThresholdAtr: 3,
        });

        expect(segments.length).toBeGreaterThan(0);
        // The dominant segment should be uptrend
        const longest = segments.reduce((a, b) =>
            a.durationBars > b.durationBars ? a : b
        );
        expect(longest.type).toBe('uptrend');
    });

    it('detects downtrend segments in falling market', () => {
        const candles = makeDowntrend(200, 100, 0.5); // -100 points
        const segments = segmentRegimes(candles, {
            minDuration: 5,
            minPriceChange: 2,
            reversalThresholdAtr: 3,
        });

        expect(segments.length).toBeGreaterThan(0);
        const longest = segments.reduce((a, b) =>
            a.durationBars > b.durationBars ? a : b
        );
        expect(longest.type).toBe('downtrend');
    });

    it('segment structure is valid', () => {
        const candles = makeUptrend(200, 100, 0.5);
        const segments = segmentRegimes(candles);

        for (const seg of segments) {
            expect(seg.startIndex).toBeGreaterThanOrEqual(0);
            expect(seg.endIndex).toBeLessThan(candles.length);
            expect(seg.endIndex).toBeGreaterThanOrEqual(seg.startIndex);
            expect(seg.durationBars).toBeGreaterThan(0);
            expect(seg.confidence).toBeGreaterThanOrEqual(0);
            expect(seg.confidence).toBeLessThanOrEqual(1);
            expect(['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral']).toContain(seg.type);
        }
    });

    it('merge step: adjacent same-type segments are merged', () => {
        const candles = makeUptrend(300, 100, 0.5);
        const segments = segmentRegimes(candles, {
            minDuration: 5,
            minPriceChange: 1,
            reversalThresholdAtr: 3,
        });

        // No two adjacent segments should have the same type
        for (let i = 1; i < segments.length; i++) {
            expect(segments[i].type).not.toBe(segments[i - 1].type);
        }
    });

    it('returns empty for short candle arrays', () => {
        const candles = makeUptrend(20, 100, 1);
        const segments = segmentRegimes(candles);
        expect(segments).toHaveLength(0);
    });

    it('minDuration filter works', () => {
        const candles = makeDowntrend(300, 100, 0.5);
        const segments = segmentRegimes(candles, {
            minDuration: 50,
            minPriceChange: 1,
            reversalThresholdAtr: 3,
        });

        for (const seg of segments) {
            expect(seg.durationBars).toBeGreaterThanOrEqual(50);
        }
    });
});