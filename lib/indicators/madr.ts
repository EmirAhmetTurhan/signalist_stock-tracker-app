import { createSMA } from './_math';

export type MADRInput = {
    time: number;
    close: number;
};

export type MADRPoint = {
    time: number;
    value?: number; // BUGFIX: allow undefined for warmup bars
};

export function computeMADR(candles: MADRInput[], period = 21): MADRPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const closes = candles.map((c) => c.close);
    const smaValues = createSMA(closes, period);

    return candles.map((c, i) => {
        const sma = smaValues[i];
        const close = closes[i];
        if (typeof sma !== 'number' || sma === 0) {
            return { time: c.time, value: undefined };
        }
        return { time: c.time, value: ((close - sma) / sma) * 100 };
    });
}
