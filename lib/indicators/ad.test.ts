import { describe, it, expect } from 'vitest';
import { computeAD } from './ad';

const makeCandles = (bars: { high: number; low: number; close: number; volume: number }[]) =>
    bars.map((b, i) => ({ time: i + 1, ...b }));

describe('computeAD', () => {
    it('returns empty array for empty input', () => {
        expect(computeAD([])).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const candles = makeCandles(
            Array.from({ length: 10 }, () => ({ high: 105, low: 95, close: 100, volume: 1000 }))
        );
        expect(computeAD(candles).length).toBe(10);
    });

    it('returns defined values for all bars (no warmup)', () => {
        const candles = makeCandles(
            Array.from({ length: 5 }, () => ({ high: 105, low: 95, close: 100, volume: 1000 }))
        );
        const result = computeAD(candles);
        result.forEach(p => expect(p.value).toBeDefined());
    });

    it('AD increases on accumulation (close near high)', () => {
        const candles = makeCandles([
            { high: 110, low: 90, close: 108, volume: 1000 },
            { high: 112, low: 92, close: 110, volume: 1000 },
            { high: 115, low: 95, close: 113, volume: 1000 },
        ]);
        const result = computeAD(candles);
        // Each bar's close is near high, so MFM > 0, AD should increase
        expect(result[2].value).toBeGreaterThan(result[1].value);
        expect(result[1].value).toBeGreaterThan(result[0].value);
    });

    it('AD decreases on distribution (close near low)', () => {
        const candles = makeCandles([
            { high: 110, low: 90, close: 92, volume: 1000 },
            { high: 112, low: 92, close: 94, volume: 1000 },
            { high: 115, low: 95, close: 97, volume: 1000 },
        ]);
        const result = computeAD(candles);
        // Each bar's close is near low, so MFM < 0, AD should decrease
        expect(result[2].value).toBeLessThan(result[1].value);
        expect(result[1].value).toBeLessThan(result[0].value);
    });

    it('AD stays same for mid-range close (MFM = 0)', () => {
        const candles = makeCandles([
            { high: 110, low: 90, close: 100, volume: 1000 },
            { high: 110, low: 90, close: 100, volume: 1000 },
        ]);
        const result = computeAD(candles);
        // MFM = 0 for mid-range close, so AD stays at previous value
        expect(result[1].value).toBe(result[0].value);
    });

    it('larger volume amplifies AD changes', () => {
        const smallVol = makeCandles([
            { high: 110, low: 90, close: 108, volume: 100 },
            { high: 110, low: 90, close: 108, volume: 100 },
        ]);
        const largeVol = makeCandles([
            { high: 110, low: 90, close: 108, volume: 1000 },
            { high: 110, low: 90, close: 108, volume: 1000 },
        ]);
        const smallResult = computeAD(smallVol);
        const largeResult = computeAD(largeVol);
        expect(Math.abs(largeResult[1].value)).toBeGreaterThan(Math.abs(smallResult[1].value));
    });

    it('different time values preserved in output', () => {
        const candles = makeCandles(
            Array.from({ length: 3 }, (_, i) => ({ high: 105, low: 95, close: 100, volume: 1000 }))
        );
        const result = computeAD(candles);
        expect(result[0].time).toBe(1);
        expect(result[1].time).toBe(2);
        expect(result[2].time).toBe(3);
    });
});
