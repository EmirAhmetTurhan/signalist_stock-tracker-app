import { describe, it, expect } from 'vitest';
import {
    decodeMask, encodeMask, geneticOptimize, localRefine,
    DEFAULT_GA_CONFIG, type GAIndividual,
} from '@/lib/ta/ga-optimizer';
import { DISCOVERY_POOL } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/backtest';
import type { AllData } from '@/lib/ta/strategy-optimizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function constantSeries(candles: Candle[], value: number): { time: string | number; value: number }[] {
    return candles.map((c) => ({ time: c.time, value }));
}

function oscillatingSeries(
    candles: Candle[],
    highVal: number,
    lowVal: number,
    period: number = 3,
): { time: string | number; value: number }[] {
    return candles.map((c, i) => ({
        time: c.time,
        value: Math.floor(i / period) % 2 === 0 ? highVal : lowVal,
    }));
}

function makeAllData(key: string, candles: Candle[], value: number, secondary?: number): AllData {
    const series = (v: number) => constantSeries(candles, v);
    switch (key) {
        case 'rsi': return { rsiData: { rsi: series(value), ma: series(secondary ?? value - 10) } };
        case 'macd': return { macdData: { macd: series(value), signal: series(secondary ?? value - 10), histogram: candles.map(c => ({ time: c.time, value: 0, color: 'gray' })) } };
        case 'cci': return { cciData: { cci: series(value), ma: series(secondary ?? value - 10) } };
        case 'mfi': return { mfiData: { mfi: series(value) } };
        default: return {};
    }
}

function makeMultiAllData(candles: Candle[], keys: string[], value: number, secondary?: number): AllData {
    let acc: AllData = {};
    for (const key of keys) {
        acc = { ...acc, ...makeAllData(key, candles, value, secondary) };
    }
    return acc;
}

function makeOscAllData(candles: Candle[], keys: string[], high: number, low: number, period: number = 3): AllData {
    let acc: AllData = {};
    for (const key of keys) {
        const primary = oscillatingSeries(candles, high, low, period);
        const sec = constantSeries(candles, (high + low) / 2);
        switch (key) {
            case 'rsi': acc = { ...acc, rsiData: { rsi: primary, ma: sec } }; break;
            case 'cci': acc = { ...acc, cciData: { cci: primary, ma: sec } }; break;
            case 'macd': acc = { ...acc, macdData: { macd: primary, signal: sec, histogram: candles.map(c => ({ time: c.time, value: 0, color: 'gray' })) } }; break;
            case 'mfi': acc = { ...acc, mfiData: { mfi: primary } }; break;
            default: break;
        }
    }
    return acc;
}

// ─── decodeMask / encodeMask ─────────────────────────────────────────────────

describe('decodeMask / encodeMask', () => {
    it('encodes and decodes a single indicator', () => {
        const indicators = ['rsi'];
        const mask = encodeMask(indicators);
        const decoded = decodeMask(mask);
        expect(decoded).toEqual(indicators);
    });

    it('encodes and decodes multiple indicators', () => {
        const indicators = ['rsi', 'macd', 'cci'];
        const mask = encodeMask(indicators);
        const decoded = decodeMask(mask);
        // decodeMask returns in DISCOVERY_POOL order (alphabetical), not input order
        expect(new Set(decoded)).toEqual(new Set(indicators));
    });

    it('encodes and decodes all 17 indicators', () => {
        const indicators = [...DISCOVERY_POOL];
        const mask = encodeMask(indicators);
        const decoded = decodeMask(mask);
        expect(decoded).toEqual(indicators);
    });

    it('empty mask returns empty array', () => {
        expect(decodeMask(0)).toEqual([]);
    });

    it('encodeMask returns 0 for empty array', () => {
        expect(encodeMask([])).toBe(0);
    });

    it('unknown keys are skipped in encodeMask', () => {
        const mask = encodeMask(['unknown_key']);
        expect(mask).toBe(0);
    });
});

// ─── geneticOptimize ──────────────────────────────────────────────────────────

describe('geneticOptimize', () => {
    it('returns population sorted by fitness descending', async () => {
        const candles = makeCandles(200, 'up');
        const data = makeOscAllData(candles, ['rsi', 'macd', 'cci', 'mfi'], 80, 20, 15);
        const topScreen = [
            { indicators: ['rsi', 'macd'], winRate: 50, totalSignals: 10, bestLookForward: 14 },
            { indicators: ['rsi', 'cci'], winRate: 45, totalSignals: 8, bestLookForward: 14 },
            { indicators: ['macd', 'mfi'], winRate: 40, totalSignals: 6, bestLookForward: 14 },
        ];

        const result = await geneticOptimize(candles, data, topScreen, {
            interval: '1d',
            mode: 'all',
            config: {
                populationSize: 30,
                maxGenerations: 10,
                staleGenerationLimit: 5,
            },
        });

        expect(result.length).toBe(30);
        // Verify sorted descending
        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].fitness).toBeGreaterThanOrEqual(result[i].fitness);
        }
    });

    it('all individuals have at least 2 indicators', async () => {
        const candles = makeCandles(200, 'up');
        const data = makeOscAllData(candles, ['rsi', 'macd'], 80, 20, 15);
        const topScreen = [
            { indicators: ['rsi', 'macd'], winRate: 50, totalSignals: 10, bestLookForward: 14 },
        ];

        const result = await geneticOptimize(candles, data, topScreen, {
            interval: '1d',
            mode: 'all',
            config: { populationSize: 20, maxGenerations: 5, staleGenerationLimit: 3 },
        });

        for (const ind of result) {
            const decoded = decodeMask(ind.indicatorMask);
            expect(decoded.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('fitness improves over generations (best not zero)', async () => {
        const candles = makeCandles(200, 'up');
        const data = makeOscAllData(candles, ['rsi', 'macd'], 80, 20, 15);
        const topScreen = [
            { indicators: ['rsi', 'macd'], winRate: 50, totalSignals: 10, bestLookForward: 14 },
        ];

        const result = await geneticOptimize(candles, data, topScreen, {
            interval: '1d',
            mode: 'all',
            config: { populationSize: 20, maxGenerations: 10, staleGenerationLimit: 5 },
        });

        // With oscillating data, best should be > 0
        expect(result[0].fitness).toBeGreaterThan(0);
        expect(result[0].totalSignals).toBeGreaterThan(0);
    });

    it('handles empty topScreen gracefully', async () => {
        const candles = makeCandles(100, 'flat');
        const data = {};

        const result = await geneticOptimize(candles, data, [], {
            interval: '1d',
            mode: 'all',
            config: { populationSize: 20, maxGenerations: 5, staleGenerationLimit: 3 },
        });

        // Should still produce a full random population
        expect(result.length).toBe(20);
    });

    it('respects parameter ranges for all individuals', async () => {
        const candles = makeCandles(200, 'up');
        const data = makeOscAllData(candles, ['rsi', 'macd'], 80, 20, 15);
        const topScreen = [
            { indicators: ['rsi', 'macd'], winRate: 50, totalSignals: 10, bestLookForward: 14 },
        ];

        const result = await geneticOptimize(candles, data, topScreen, {
            interval: '1d',
            mode: 'all',
            config: { populationSize: 20, maxGenerations: 5, staleGenerationLimit: 3 },
        });

        for (const ind of result) {
            expect(ind.lookForward).toBeGreaterThanOrEqual(5);
            expect(ind.lookForward).toBeLessThanOrEqual(30);
            // RSI param should be in [2, 40] if selected
            if (ind.params.rsi_len !== undefined) {
                expect(ind.params.rsi_len).toBeGreaterThanOrEqual(2);
                expect(ind.params.rsi_len).toBeLessThanOrEqual(40);
            }
        }
    });
});

// ─── localRefine ──────────────────────────────────────────────────────────────

describe('localRefine', () => {
    it('returns refined strategies sorted by winRate', () => {
        const candles = makeCandles(250, 'up');
        const data = makeOscAllData(candles, ['rsi', 'macd', 'cci'], 80, 20, 15);

        // Create GA individuals manually for testing
        const gaIndividuals: GAIndividual[] = [
            {
                indicatorMask: (1 << DISCOVERY_POOL.indexOf('rsi')) | (1 << DISCOVERY_POOL.indexOf('macd')),
                params: { rsi_len: 14, macd_fast: 12 },
                lookForward: 10,
                mode: 'all',
                fitness: 50,
                rawWinRate: 55,
                totalSignals: 8,
                generation: 10,
            },
            {
                indicatorMask: (1 << DISCOVERY_POOL.indexOf('rsi')) | (1 << DISCOVERY_POOL.indexOf('cci')),
                params: { rsi_len: 14, cci_len: 14 },
                lookForward: 14,
                mode: 'all',
                fitness: 45,
                rawWinRate: 50,
                totalSignals: 6,
                generation: 10,
            },
        ];

        const refined = localRefine(gaIndividuals, candles, data, '1d', 'all', 2);
        expect(refined.length).toBe(2);
        expect(refined[0].winRate).toBeGreaterThanOrEqual(refined[1].winRate);
        expect(refined[0].rank).toBe(1);
        expect(refined[1].rank).toBe(2);
        expect(refined[0].indicators.length).toBeGreaterThanOrEqual(2);
        expect(refined[0].params.lookForward).toBeDefined();
    });

    it('returns empty array for empty input', () => {
        const candles = makeCandles(100, 'flat');
        const data = {};
        const refined = localRefine([], candles, data, '1d', 'all', 5);
        expect(refined).toEqual([]);
    });

    it('handles individuals with non-optimizable indicators', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi'], 80, 30);

        // Include 'bb' (Bollinger) which IS optimizable via OPTIMIZABLE_INDICATORS
        const mask = (1 << DISCOVERY_POOL.indexOf('rsi')) | (1 << DISCOVERY_POOL.indexOf('bb'));
        const gaIndividuals: GAIndividual[] = [
            {
                indicatorMask: mask,
                params: { rsi_len: 14, bb_len: 20 },
                lookForward: 10,
                mode: 'all',
                fitness: 40,
                rawWinRate: 42,
                totalSignals: 5,
                generation: 10,
            },
        ];

        const refined = localRefine(gaIndividuals, candles, data, '1d', 'all', 1);
        expect(refined.length).toBe(1);
        expect(refined[0].indicators).toContain('rsi');
    });
});
