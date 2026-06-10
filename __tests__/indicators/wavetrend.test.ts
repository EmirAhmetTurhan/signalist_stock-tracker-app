import { describe, it, expect } from 'vitest';
import { computeWaveTrend } from '@/lib/indicators/wavetrend';

const makeCandles = (prices: number[]) =>
    prices.map((close, i) => ({
        time: i + 1, high: close + 2, low: close - 2, close,
    }));

describe('computeWaveTrend', () => {
    it('returns empty array for empty input', () => {
        expect(computeWaveTrend([], 21, 4)).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i));
        expect(computeWaveTrend(c, 21, 4)).toHaveLength(100);
    });

    it('wt1 and wt2 are defined after warmup', () => {
        const c = makeCandles(Array.from({ length: 100 }, () => 100));
        const r = computeWaveTrend(c, 21, 4);
        const last = r[r.length - 1];
        expect(typeof last.wt1).toBe('number');
        expect(typeof last.wt2).toBe('number');
    });

    it('wt1 and wt2 values change with trend direction', () => {
        // Uptrend: rising prices
        const up = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + i * 2));
        const rUp = computeWaveTrend(up, 21, 4);
        const lastUp = rUp[rUp.length - 1];

        // Downtrend: falling prices
        const down = makeCandles(Array.from({ length: 100 }, (_, i) => 300 - i * 2));
        const rDown = computeWaveTrend(down, 21, 4);
        const lastDown = rDown[rDown.length - 1];

        // wt1 should be higher in uptrend than in downtrend
        expect(lastUp.wt1!).toBeGreaterThan(lastDown.wt1!);
        // wt2 should also be higher in uptrend than in downtrend
        expect(lastUp.wt2!).toBeGreaterThan(lastDown.wt2!);
    });

    it('different channel length produces different values', () => {
        const c = makeCandles(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20));
        const r21 = computeWaveTrend(c, 21, 4);
        const r14 = computeWaveTrend(c, 14, 4);
        expect(r21[r21.length - 1].wt1).not.toBe(r14[r14.length - 1].wt1);
    });
});
