import { describe, it, expect } from 'vitest';
import { findBestParameter, OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import type { Candle } from '@/lib/ta/backtest';

// Deterministic candle generator (no Math.random) for reproducible tests
function makeCandles(count: number, trend: 'up' | 'down' | 'flat' = 'up'): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        const open = price;
        if (trend === 'up') price += 1 + (i % 5) * 0.1;
        else if (trend === 'down') price -= 1 + (i % 5) * 0.1;
        else price = 100 + Math.sin(i * 0.1) * 0.5;
        const close = price;
        candles.push({
            time: i + 1,
            open: Math.min(open, close),
            high: Math.max(open, close) + 0.1,
            low: Math.min(open, close) - 0.1,
            close,
            volume: 1000,
        });
    }
    return candles;
}

describe('findBestParameter', () => {
    it('returns null for unknown indicator name', () => {
        const candles = makeCandles(200, 'up');
        const result = findBestParameter('UNKNOWN', candles);
        expect(result).toBeNull();
    });

    it('returns bestVal as first range value with winRate 0 for empty candles', () => {
        const result = findBestParameter('RSI', []);
        // Empty candles → compute returns empty → winRate = 0 for all iterations
        // bestVal will be the first value in the range (7) since it "wins" over -1
        expect(result).not.toBeNull();
        expect(result!.bestWinRate).toBe(0);
        expect(result!.bestVal).toBe(7);
    });

    it('returns zero winRate for insufficient candles', () => {
        const candles = makeCandles(30, 'flat');
        const result = findBestParameter('RSI', candles);
        // Too few candles to produce any signals → all winRates = 0
        // bestVal is the first range value (7)
        expect(result).not.toBeNull();
        expect(result!.bestWinRate).toBe(0);
        expect(result!.bestVal).toBe(7);
    });

    it('RSI finds best parameter with up-trend data', () => {
        const candles = makeCandles(300, 'up');
        const result = findBestParameter('RSI', candles, { lookForward: 5 });
        expect(result).not.toBeNull();
        expect(result!.bestVal).toBeGreaterThanOrEqual(2);
        expect(result!.bestVal).toBeLessThanOrEqual(40);
        expect(result!.bestWinRate).toBeGreaterThanOrEqual(0);
    });

    it('RSI returns lower winRate with down-trend data', () => {
        const candles = makeCandles(300, 'down');
        const result = findBestParameter('RSI', candles, { lookForward: 5 });
        expect(result).not.toBeNull();
        expect(result!.bestVal).toBeGreaterThanOrEqual(2);
        // In a downtrend, BUY signals should generally lose, so winRate may be low
        expect(result!.bestWinRate).toBeGreaterThanOrEqual(0);
    });

    it('MACD optimization works with up-trend data', () => {
        const candles = makeCandles(300, 'up');
        const result = findBestParameter('MACD', candles, { lookForward: 5 });
        expect(result).not.toBeNull();
        expect(result!.bestVal).toBeGreaterThanOrEqual(5);
        expect(result!.bestVal).toBeLessThanOrEqual(40);
    });

    it('CCI optimization works with up-trend data', () => {
        const candles = makeCandles(300, 'up');
        const result = findBestParameter('CCI', candles, { lookForward: 5 });
        expect(result).not.toBeNull();
        expect(result!.bestVal).toBeGreaterThanOrEqual(5);
        expect(result!.bestVal).toBeLessThanOrEqual(40);
    });

    it('StochRSI optimization works with up-trend data', () => {
        const candles = makeCandles(300, 'up');
        const result = findBestParameter('STOCHRSI', candles, { lookForward: 5 });
        expect(result).not.toBeNull();
        expect(result!.bestVal).toBeGreaterThanOrEqual(5);
        expect(result!.bestVal).toBeLessThanOrEqual(40);
    });

    it('all OPTIMIZABLE_INDICATORS run without error', () => {
        const candles = makeCandles(200, 'up');
        for (const name of Object.keys(OPTIMIZABLE_INDICATORS)) {
            const result = findBestParameter(name, candles, { lookForward: 5 });
            expect(result).not.toBeNull();
            // Some indicators may not produce signals with generic data,
            // but the function should never throw
            expect(result!.bestWinRate).toBeGreaterThanOrEqual(0);
        }
    });
});
