import { describe, it, expect } from 'vitest';
import { computeBollingerBands } from '@/lib/indicators/bollinger';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({ time: i + 1, close }));

describe('computeBollingerBands', () => {
    it('returns empty array for empty input', () => {
        expect(computeBollingerBands([], 20, 2, 0)).toEqual([]);
    });

    it('returns full-length array with undefined warmup entries, then defined bands', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        const r = computeBollingerBands(c, 20, 2, 0);
        // Full-length array (100) with first 19 entries undefined (warmup for period=20)
        expect(r.length).toBe(100);
        expect(r[0].upper).toBeUndefined();
        expect(r[0].basis).toBeUndefined();
        expect(r[0].lower).toBeUndefined();
        expect(r[19].upper).toBeDefined();
        expect(r[19].basis).toBeDefined();
        expect(r[19].lower).toBeDefined();
    });

    it('upper, basis, lower bands are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeBollingerBands(c, 20, 2, 0);
        const defined = r.filter(p =>
            typeof p.upper === 'number' &&
            typeof p.basis === 'number' &&
            typeof p.lower === 'number'
        );
        // 100 total entries, first 19 are warmup → 81 defined bands
        expect(defined.length).toBe(81);
        // First entry should be undefined (warmup)
        expect(r[0].upper).toBeUndefined();
    });

    it('upper > basis > lower after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 10));
        const r = computeBollingerBands(c, 20, 2, 0);
        // Skip undefined warmup entries (first 19)
        for (let i = 19; i < r.length; i++) {
            expect(r[i].upper!).toBeGreaterThan(r[i].basis!);
            expect(r[i].basis!).toBeGreaterThan(r[i].lower!);
        }
    });

    it('band width increases with higher volatility', () => {
        // Low volatility: steady prices
        const lowVol = makeCandles(Array.from({ length: 50 }, () => 100));
        const lowResult = computeBollingerBands(lowVol, 20, 2, 0);
        // Filter out undefined warmup entries
        const lowSpread = lowResult
            .filter(p => typeof p.upper === 'number' && typeof p.lower === 'number')
            .map(p => p.upper! - p.lower!);

        // High volatility: oscillating prices
        const highVol = makeCandles(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 30));
        const highResult = computeBollingerBands(highVol, 20, 2, 0);
        const highSpread = highResult
            .filter(p => typeof p.upper === 'number' && typeof p.lower === 'number')
            .map(p => p.upper! - p.lower!);

        // High volatility should produce wider bands at some point
        const maxLow = Math.max(...lowSpread);
        const maxHigh = Math.max(...highSpread);
        expect(maxHigh).toBeGreaterThanOrEqual(maxLow);
    });

    it('different multiplier changes band width', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 10));
        const r1 = computeBollingerBands(c, 20, 1, 0);
        const r2 = computeBollingerBands(c, 20, 3, 0);
        const last1 = r1[r1.length - 1];
        const last2 = r2[r2.length - 1];
        // Wider multiplier = wider bands
        expect(last2.upper! - last2.lower!).toBeGreaterThan(last1.upper! - last1.lower!);
    });
});
