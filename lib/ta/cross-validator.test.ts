import { describe, it, expect } from 'vitest';
import { crossValidate } from './cross-validator';
import type { DiverseStrategy } from './discovery-types';
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
        macdData: { macd: [], signal: [], histogram: [] },
    };
}

function makeStrategy(combo: string[], bestWinRate: number): DiverseStrategy {
    return {
        combo,
        bestParams: { lookForward: 14 },
        bestWinRate,
        totalSignals: 100,
        iterationsRun: 50,
        mode: 'all',
        indicatorCount: combo.length,
        badge: `${combo.length}-IND` as `${number}-IND`,
        rank: 1,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('crossValidate', () => {
    it('should return ValidatedStrategy with risk assessment', () => {
        const candles = makeCandles(500);
        const allData = makeAllData();
        const strategies = [makeStrategy(['rsi', 'macd'], 60)];

        const result = crossValidate(strategies, candles, allData, '1d');

        expect(result.length).toBe(1);
        expect(result[0]).toHaveProperty('validatedWinRate');
        expect(result[0]).toHaveProperty('overfittingRisk');
        expect(result[0]).toHaveProperty('riskLevel');
        expect(result[0]).toHaveProperty('riskBadge');
        expect(result[0]).toHaveProperty('avgTrainWinRate');
        expect(['low', 'medium', 'high']).toContain(result[0].riskLevel);
    });

    it('should return fallback risk when insufficient data (foldSize < 60)', () => {
        const candles = makeCandles(200); // foldSize = 40 < 60
        const allData = makeAllData();
        const strategies = [makeStrategy(['rsi', 'macd'], 65)];

        const result = crossValidate(strategies, candles, allData, '1d');

        // Should use fallback: validatedWinRate === bestWinRate, risk = low
        expect(result[0].validatedWinRate).toBe(strategies[0].bestWinRate);
        expect(result[0].overfittingRisk).toBe(0);
        expect(result[0].riskLevel).toBe('low');
    });

    it('should sort by validatedWinRate descending', () => {
        const candles = makeCandles(600);
        const allData = makeAllData();
        const strategies = [
            makeStrategy(['rsi', 'macd'], 70),
            makeStrategy(['rsi', 'macd', 'dmi'], 65),
            makeStrategy(['rsi', 'macd', 'dmi', 'cci'], 60),
        ];

        const result = crossValidate(strategies, candles, allData, '1d');

        for (let i = 1; i < result.length; i++) {
            expect(result[i - 1].validatedWinRate).toBeGreaterThanOrEqual(result[i].validatedWinRate);
        }
    });

    it('should assign consecutive ranks', () => {
        const candles = makeCandles(600);
        const allData = makeAllData();
        const strategies = [
            makeStrategy(['rsi', 'macd'], 70),
            makeStrategy(['rsi', 'macd', 'dmi'], 65),
        ];

        const result = crossValidate(strategies, candles, allData, '1d');

        expect(result[0].rank).toBe(1);
        expect(result[1].rank).toBe(2);
    });

    it('should return overfittingRisk between 0 and 1', () => {
        const candles = makeCandles(500);
        const allData = makeAllData();
        const strategies = [
            makeStrategy(['rsi', 'macd'], 60),
            makeStrategy(['rsi', 'macd', 'dmi'], 55),
        ];

        const result = crossValidate(strategies, candles, allData, '1d');

        for (const v of result) {
            expect(v.overfittingRisk).toBeGreaterThanOrEqual(0);
            expect(v.overfittingRisk).toBeLessThanOrEqual(1);
        }
    });

    it('should preserve strategy properties through validation', () => {
        const candles = makeCandles(500);
        const allData = makeAllData();
        const strategy = makeStrategy(['rsi', 'macd'], 65);

        const result = crossValidate([strategy], candles, allData, '1d');

        expect(result[0].combo).toEqual(strategy.combo);
        expect(result[0].bestParams).toEqual(strategy.bestParams);
        expect(result[0].mode).toBe(strategy.mode);
        expect(result[0].indicatorCount).toBe(strategy.indicatorCount);
        expect(result[0].badge).toBe(strategy.badge);
    });
});
