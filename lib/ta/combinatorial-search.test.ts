import { describe, it, expect, vi } from 'vitest';
import { generateCombinations, countTotalCombinations, exhaustiveCombinatorialSearch } from './combinatorial-search';
import type { Candle } from './backtest';
import type { AllData } from './strategy-optimizer';

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
        cciData: { cci: [], ma: [] },
        waveTrendData: { wt1: [], wt2: [] },
        macdData: { macd: [], signal: [], histogram: [] },
    };
}

// ─── Tests: generateCombinations ──────────────────────────────────────────────

describe('generateCombinations', () => {
    it('should return empty array when k > arr.length', () => {
        expect(generateCombinations([1, 2], 3)).toEqual([]);
    });

    it('should return all elements when k === arr.length', () => {
        const result = generateCombinations(['a', 'b', 'c'], 3);
        expect(result).toEqual([['a', 'b', 'c']]);
    });

    it('should return all C(n, 2) pairs', () => {
        const pool = ['rsi', 'macd', 'dmi', 'cci'];
        const result = generateCombinations(pool, 2);
        expect(result.length).toBe(6); // C(4, 2) = 6
        expect(result).toContainEqual(['rsi', 'macd']);
        expect(result).toContainEqual(['rsi', 'dmi']);
        expect(result).toContainEqual(['rsi', 'cci']);
        expect(result).toContainEqual(['macd', 'dmi']);
        expect(result).toContainEqual(['macd', 'cci']);
        expect(result).toContainEqual(['dmi', 'cci']);
    });

    it('should produce consistent ordering', () => {
        const pool = ['a', 'b', 'c', 'd'];
        const result1 = generateCombinations(pool, 3);
        const result2 = generateCombinations(pool, 3);
        expect(result1).toEqual(result2);
    });

    it('should handle large k without stack overflow', () => {
        const pool = Array.from({ length: 30 }, (_, i) => `ind${i}`);
        // C(30, 2) should not overflow
        const result = generateCombinations(pool, 2);
        expect(result.length).toBe(435); // C(30, 2) = 435
    });
});

// ─── Tests: countTotalCombinations ────────────────────────────────────────────

describe('countTotalCombinations', () => {
    it('should return 0 for pool size < 2', () => {
        expect(countTotalCombinations(0)).toBe(0);
        expect(countTotalCombinations(1)).toBe(0);
    });

    it('should return C(3,2) + C(3,3) = 3 + 1 = 4', () => {
        expect(countTotalCombinations(3)).toBe(4);
    });

    it('should return C(4,2) + C(4,3) + C(4,4) = 6 + 4 + 1 = 11', () => {
        expect(countTotalCombinations(4)).toBe(11);
    });

    it('should return correct count for 17 indicators', () => {
        // 2^17 - C(17,0) - C(17,1) = 131072 - 1 - 17 = 131054
        const total = countTotalCombinations(17);
        expect(total).toBeGreaterThan(130000);
        expect(total).toBeLessThan(132000);
    });
});

// ─── Tests: exhaustiveCombinatorialSearch ─────────────────────────────────────

describe('exhaustiveCombinatorialSearch', () => {
    it('should be an async function', async () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const result = exhaustiveCombinatorialSearch(candles, allData, {
            interval: '1d',
            pool: ['rsi', 'macd'],
            minIndicators: 2,
            maxIndicators: 2,
        });
        // Should return a Promise
        expect(result).toBeInstanceOf(Promise);
        const resolved = await result;
        expect(Array.isArray(resolved)).toBe(true);
    });

    it('should call onProgress callback', async () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const onProgress = vi.fn();

        await exhaustiveCombinatorialSearch(candles, allData, {
            interval: '1d',
            pool: ['rsi', 'macd'],
            minIndicators: 2,
            maxIndicators: 2,
            onProgress,
        });

        // Should have been called at least once (start + final or during)
        expect(onProgress).toHaveBeenCalled();
        // Final call should have current === total
        const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
        expect(lastCall[0]).toBe(lastCall[1]);
    });

    it('should respect AbortSignal and return partial results', async () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const controller = new AbortController();
        controller.abort(); // Abort immediately

        const result = await exhaustiveCombinatorialSearch(candles, allData, {
            interval: '1d',
            pool: ['rsi', 'macd', 'dmi', 'cci', 'mfi', 'smi', 'wpr'],
            minIndicators: 2,
            maxIndicators: 4,
            signal: controller.signal,
        });

        // Should return early with whatever we had (potentially empty)
        expect(Array.isArray(result)).toBe(true);
    });

    it('should return top N results sorted by score descending', async () => {
        const candles = makeCandles(200);
        const allData = makeAllData();
        const pool = ['rsi', 'macd', 'dmi', 'cci'];

        const results = await exhaustiveCombinatorialSearch(candles, allData, {
            interval: '1d',
            pool,
            minIndicators: 2,
            maxIndicators: 3,
        });

        // Results should be sorted descending by score
        for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
        }

        // Each result should have required properties
        for (const r of results) {
            expect(r).toHaveProperty('combo');
            expect(r).toHaveProperty('lookForward');
            expect(r).toHaveProperty('mode');
            expect(r).toHaveProperty('winRate');
            expect(r).toHaveProperty('totalSignals');
            expect(r).toHaveProperty('score');
            expect(['all', 'majority']).toContain(r.mode);
            expect(typeof r.winRate).toBe('number');
            expect(typeof r.totalSignals).toBe('number');
            expect(r.totalSignals).toBeGreaterThanOrEqual(20); // MIN_SIGNAL_THRESHOLD
        }
    });
});
