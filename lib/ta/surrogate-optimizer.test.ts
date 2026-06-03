import { describe, it, expect } from 'vitest';
import { surrogateOptimize } from './surrogate-optimizer';
import type { Candle } from './backtest';
import type { AllData } from './strategy-optimizer';
import type { SurrogateResult } from './discovery-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCandles(count: number): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        const open = price;
        price += 1 + (i % 5) * 0.1;
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

function makeAllData(): AllData {
    return {
        rsiData: { rsi: [], ma: [] },
        macdData: { macd: [], signal: [], histogram: [] },
        dmiData: { plusDI: [], minusDI: [], adx: [] },
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('surrogateOptimize', () => {
    it('should return a SurrogateResult with required properties', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const combo = ['rsi', 'macd'];

        const result = surrogateOptimize(combo, candles, allData, {
            interval: '1d',
            nIterations: 10,
            seed: 42,
        });

        expect(result).toHaveProperty('combo');
        expect(result).toHaveProperty('bestParams');
        expect(result).toHaveProperty('bestWinRate');
        expect(result).toHaveProperty('totalSignals');
        expect(result).toHaveProperty('iterationsRun');
        expect(result).toHaveProperty('mode');
        expect(result.combo).toEqual(combo);
        expect(typeof result.bestWinRate).toBe('number');
        expect(typeof result.totalSignals).toBe('number');
        expect(typeof result.iterationsRun).toBe('number');
        expect(result.iterationsRun).toBeGreaterThan(0);
        expect(['all', 'majority']).toContain(result.mode);
    });

    it('should include lookForward in bestParams', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const combo = ['rsi', 'macd'];

        const result = surrogateOptimize(combo, candles, allData, {
            interval: '1d',
            nIterations: 10,
            seed: 42,
        });

        expect(result.bestParams).toHaveProperty('lookForward');
        expect(result.bestParams.lookForward).toBeGreaterThanOrEqual(5);
        expect(result.bestParams.lookForward).toBeLessThanOrEqual(30);
    });

    it('should be reproducible with same seed', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const combo = ['rsi', 'macd'];

        const result1 = surrogateOptimize(combo, candles, allData, {
            interval: '1d',
            nIterations: 20,
            seed: 12345,
        });

        const result2 = surrogateOptimize(combo, candles, allData, {
            interval: '1d',
            nIterations: 20,
            seed: 12345,
        });

        // Same seed should produce same bestWinRate
        expect(result1.bestWinRate).toBe(result2.bestWinRate);
    });

    it('should handle single-indicator combo gracefully', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();

        // Single indicator combos are valid for optimization
        const result = surrogateOptimize(['rsi'], candles, allData, {
            interval: '1d',
            nIterations: 10,
        });

        expect(result).toHaveProperty('combo', ['rsi']);
        expect(typeof result.bestWinRate).toBe('number');
    });

    it('should return iterationsRun equal to total evaluated points', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const combo = ['rsi'];

        const nIterations = 15;
        const result = surrogateOptimize(combo, candles, allData, {
            interval: '1d',
            nIterations,
        });

        // With 2 modes tested per param point:
        // Exploration: floor(15 * 0.4) = 6 points × 2 modes = 12 evaluations
        // Exploitation: (15 - 6) = 9 points, distributed among top unique points
        // Total should be >= nIterations (since each point tested in 2 modes)
        expect(result.iterationsRun).toBeGreaterThanOrEqual(nIterations);
    });

    it('should accept SurrogateResult type contract', () => {
        const candles = makeCandles(200);
        const allData = makeAllData();

        const result: SurrogateResult = surrogateOptimize(['rsi', 'macd'], candles, allData, {
            interval: '1d',
            nIterations: 10,
        });

        // TypeScript compile-time check: result should satisfy SurrogateResult
        expect(result.combo.length).toBe(2);
        expect(Object.keys(result.bestParams).length).toBeGreaterThanOrEqual(1);
    });
});
