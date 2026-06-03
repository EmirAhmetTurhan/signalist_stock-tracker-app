import { createEMA, createSMA } from './_math';

export type DIInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
    open: number;
    volume: number;
};

export type DIPoint = {
    time: number;
    value: number;
};

/**
 * Demand Index (James Sibbet)
 *
 * Pine Script reference:
 *   bp = volume * (close - low) / (high - low)      // buy pressure
 *   sp = volume * (high - close) / (high - low)      // sell pressure
 *   demand = ta.ema(bp, DI_LEN)
 *   supply = ta.ema(sp, DI_LEN)
 *   di = demand / supply                             // ratio (≈1.0 when balanced)
 *   di_smoothed = ta.sma(di, DI_SMOOTH)
 *
 * ÖNCEKİ formül (hatalı): signed-volume EMA → volume-scale değerler (34M)
 * YENİ formül: James Sibbet buy/sell pressure ratio → 0..∞ (≈0.4-1.5 tipik)
 */
export function computeDemandIndex(
    candles: DIInput[],
    length = 13,
    smooth = 8
): DIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const eps = 1e-10;

    // Buy pressure / sell pressure (James Sibbet)
    const bp: number[] = candles.map((c) => {
        const range = c.high - c.low;
        if (range < eps) return c.volume * 0.5; // flat bar → equal pressure
        return c.volume * (c.close - c.low) / range;
    });
    const sp: number[] = candles.map((c) => {
        const range = c.high - c.low;
        if (range < eps) return c.volume * 0.5; // flat bar → equal pressure
        return c.volume * (c.high - c.close) / range;
    });

    // EMA of buy/sell pressure
    const demand = createEMA(bp, length, 'sma');
    const supply = createEMA(sp, length, 'sma');

    // DI ratio: demand / supply
    const diRatio: (number | undefined)[] = new Array(candles.length).fill(undefined);
    for (let i = 0; i < candles.length; i++) {
        const d = demand[i];
        const s = supply[i];
        if (typeof d === 'number' && typeof s === 'number') {
            diRatio[i] = d / (s + eps);
        }
    }

    // SMA smoothing of DI ratio
    const smoothed = createSMA(diRatio, smooth);

    return candles.map((c, i) => ({
        time: c.time,
        value: smoothed[i] ?? 0
    }));
}
