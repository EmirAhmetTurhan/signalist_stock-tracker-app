import { describe, it, expect } from 'vitest';
import { computeNetVolume } from '@/lib/indicators/net_volume';

const makeCandles = (bars: { open: number; close: number; volume: number }[]) =>
    bars.map((b, i) => ({ time: i + 1, ...b }));

describe('computeNetVolume', () => {
    it('returns empty array for empty input', () => {
        expect(computeNetVolume([])).toEqual([]);
    });

    it('returns array of same length as input', () => {
        const candles = makeCandles(
            Array.from({ length: 10 }, () => ({ open: 99, close: 100, volume: 1000 }))
        );
        expect(computeNetVolume(candles).length).toBe(10);
    });

    it('returns positive volume when close > open', () => {
        const candles = makeCandles([
            { open: 99, close: 102, volume: 5000 },
        ]);
        const result = computeNetVolume(candles);
        expect(result[0].value).toBe(5000);
    });

    it('returns negative volume when close < open', () => {
        const candles = makeCandles([
            { open: 101, close: 98, volume: 3000 },
        ]);
        const result = computeNetVolume(candles);
        expect(result[0].value).toBe(-3000);
    });

    it('returns zero when close equals open', () => {
        const candles = makeCandles([
            { open: 100, close: 100, volume: 2000 },
        ]);
        const result = computeNetVolume(candles);
        expect(result[0].value).toBe(0);
    });

    it('accumulates net volume correctly over multiple bars', () => {
        const candles = makeCandles([
            { open: 99, close: 102, volume: 1000 },  // +1000
            { open: 103, close: 98, volume: 500 },   // -500
            { open: 97, close: 100, volume: 2000 },  // +2000
        ]);
        const result = computeNetVolume(candles);
        expect(result[0].value).toBe(1000);
        expect(result[1].value).toBe(-500);
        expect(result[2].value).toBe(2000);
    });

    it('different times preserved in output', () => {
        const candles = makeCandles([
            { open: 99, close: 101, volume: 1000 },
            { open: 100, close: 102, volume: 2000 },
        ]);
        const result = computeNetVolume(candles);
        expect(result[0].time).toBe(1);
        expect(result[1].time).toBe(2);
    });
});
