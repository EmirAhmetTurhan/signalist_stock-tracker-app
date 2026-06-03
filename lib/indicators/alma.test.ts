import { describe, it, expect } from 'vitest';
import { computeALMA } from './alma';

describe('computeALMA', () => {
    it('returns empty array for empty input', () => {
        expect(computeALMA([])).toEqual([]);
    });

    it('returns empty array when data length < window', () => {
        const data = Array.from({ length: 5 }, (_, i) => ({ time: i + 1, close: 100 }));
        const result = computeALMA(data, 9);
        // ALMA requires at least `window` bars to compute; returns [] when insufficient
        expect(result).toEqual([]);
    });

    it('returns same-length array with defined values after warmup', () => {
        const data = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, close: 100 + i }));
        const result = computeALMA(data, 9);
        expect(result.length).toBe(20);
        // First 8 entries are undefined (warmup), index 8 is the first defined (window-1)
        expect(result[0].value).toBeUndefined();
        expect(result[8].value).toBeDefined();
        expect(result[8].time).toBe(9);
    });

    it('returns ALMA near the close value for flat prices', () => {
        const data = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, close: 100 }));
        const result = computeALMA(data, 9);
        result.filter(p => p.value !== undefined).forEach(p => expect(p.value!).toBeCloseTo(100, 5));
    });

    it('ALMA lags behind rising prices (smoothing)', () => {
        const data = Array.from({ length: 30 }, (_, i) => ({ time: i + 1, close: 100 + i }));
        const result = computeALMA(data, 9);
        // Last value: ALMA should be less than current close (lag)
        const lastClose = data[data.length - 1].close;
        expect(result[result.length - 1].value!).toBeLessThan(lastClose);
    });

    it('ALMA is above falling prices (smoothing)', () => {
        const data = Array.from({ length: 30 }, (_, i) => ({ time: i + 1, close: 200 - i }));
        const result = computeALMA(data, 9);
        const lastClose = data[data.length - 1].close;
        expect(result[result.length - 1].value!).toBeGreaterThan(lastClose);
    });

    it('different window size produces different values', () => {
        const data = Array.from({ length: 30 }, (_, i) => ({ time: i + 1, close: 100 + i }));
        const result5 = computeALMA(data, 5);
        const result15 = computeALMA(data, 15);
        // Both return full-length arrays, but different first-defined indices
        expect(result5.length).toBe(30);
        expect(result15.length).toBe(30);
        // The last value should differ
        expect(Math.abs(result5[result5.length - 1].value! - result15[result15.length - 1].value!)).toBeGreaterThan(0.01);
    });

    it('handles string time values', () => {
        const data = Array.from({ length: 20 }, (_, i) => ({ time: `2024-01-${String(i + 1).padStart(2, '0')}`, close: 100 }));
        const result = computeALMA(data, 9);
        expect(result.length).toBeGreaterThan(0);
        expect(typeof result[0].time).toBe('string');
    });

    it('different offset produces different ALMA values', () => {
        const data = Array.from({ length: 20 }, (_, i) => ({ time: i + 1, close: 100 + i }));
        const result085 = computeALMA(data, 9, 0.85);
        const result05 = computeALMA(data, 9, 0.5);
        const last085 = result085[result085.length - 1].value!;
        const last05 = result05[result05.length - 1].value!;
        expect(Math.abs(last085 - last05)).toBeGreaterThan(0.01);
    });
});
