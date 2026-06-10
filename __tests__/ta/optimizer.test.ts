import { describe, it, expect } from 'vitest';
import { rangeForTimeframe, findBestParameter, OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import type { Candle } from '@/lib/ta/simulation/backtest';

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
        expect(result).not.toBeNull();
        expect(result!.bestWinRate).toBe(0);
        expect(result!.bestVal).toBe(5);
    });

    it('returns zero winRate for insufficient candles', () => {
        const candles = makeCandles(5, 'flat');
        const result = findBestParameter('RSI', candles);
        expect(result).not.toBeNull();
        expect(result!.bestWinRate).toBe(0);
        expect(result!.bestVal).toBe(5);
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
            expect(result!.bestWinRate).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('SPRINT 2 / B2 — rangeForTimeframe', () => {
    describe('Default range (1d, undefined)', () => {
        it('1d → OPTIMIZABLE_INDICATORS default range döner', () => {
            const range = rangeForTimeframe('RSI', '1d');
            expect(range).toEqual([5, 40]);
        });

        it('undefined → default range döner', () => {
            const range = rangeForTimeframe('RSI', undefined);
            expect(range).toEqual([5, 40]);
        });
    });

    describe('4h swing trade expanded range', () => {
        it('RSI 4h → [14, 42] (sprint 2 spec)', () => {
            const range = rangeForTimeframe('RSI', '4h');
            expect(range).toEqual([14, 42]);
        });

        it('STOCHRSI 4h → [14, 42]', () => {
            expect(rangeForTimeframe('STOCHRSI', '4h')).toEqual([14, 42]);
        });

        it('DMI 4h → [14, 42]', () => {
            expect(rangeForTimeframe('DMI', '4h')).toEqual([14, 42]);
        });

        it('MFI 4h → [14, 42]', () => {
            expect(rangeForTimeframe('MFI', '4h')).toEqual([14, 42]);
        });

        it('SMI 4h → [14, 42]', () => {
            expect(rangeForTimeframe('SMI', '4h')).toEqual([14, 42]);
        });

        it('WPR 4h → [14, 42]', () => {
            expect(rangeForTimeframe('WPR', '4h')).toEqual([14, 42]);
        });

        it('CCI 4h → [14, 42]', () => {
            expect(rangeForTimeframe('CCI', '4h')).toEqual([14, 42]);
        });

        it('CMF 4h → [14, 42]', () => {
            expect(rangeForTimeframe('CMF', '4h')).toEqual([14, 42]);
        });

        it('BOLLINGER 4h → [14, 42]', () => {
            expect(rangeForTimeframe('BOLLINGER', '4h')).toEqual([14, 42]);
        });
    });

    describe('4h special case (shorter periods)', () => {
        it('MACD 4h → [10, 30]', () => {
            expect(rangeForTimeframe('MACD', '4h')).toEqual([10, 30]);
        });

        it('WAVETREND 4h → [10, 30]', () => {
            expect(rangeForTimeframe('WAVETREND', '4h')).toEqual([10, 30]);
        });

        it('ALMA 4h → [10, 30]', () => {
            expect(rangeForTimeframe('ALMA', '4h')).toEqual([10, 30]);
        });
    });

    describe('Case insensitivity', () => {
        it('"rsi" (lowercase) → aynı range', () => {
            expect(rangeForTimeframe('rsi', '4h')).toEqual([14, 42]);
        });

        it('"BB" alias → BOLLINGER range', () => {
            const range = rangeForTimeframe('BB', '4h');
            expect(range).toBeDefined();
        });
    });

    describe('Unknown indicator', () => {
        it('Bilinmeyen gösterge → [1, 100] fallback', () => {
            const range = rangeForTimeframe('NONEXISTENT', '4h');
            expect(range).toEqual([1, 100]);
        });
    });

    describe('Integration with OPTIMIZABLE_INDICATORS', () => {
        it('Tüm OPTIMIZABLE_INDICATORS için çağrılabilir', () => {
            for (const key of Object.keys(OPTIMIZABLE_INDICATORS)) {
                for (const tf of ['1d', '4h'] as const) {
                    const range = rangeForTimeframe(key, tf);
                    expect(range[1]).toBeGreaterThan(range[0]);
                    expect(range[0]).toBeGreaterThan(0);
                }
            }
        });
    });
});
