import { createSMA } from './_math';

export type AOInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
};

export type AOPoint = {
    time: number;
    value?: number;
    color?: string;
};

export function computeAO(candles: AOInput[]): AOPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const hl2 = candles.map(c => (c.high + c.low) / 2);

    const sma5 = createSMA(hl2, 5);
    const sma34 = createSMA(hl2, 34);

    const results: AOPoint[] = new Array(candles.length);

    // Fill all entries with time and undefined value (dense array, warmup-safe)
    for (let i = 0; i < candles.length; i++) {
        results[i] = { time: candles[i].time, value: undefined, color: undefined };
    }

    for (let i = 0; i < candles.length; i++) {
        const s5 = sma5[i];
        const s34 = sma34[i];

        if (typeof s5 === 'number' && typeof s34 === 'number') {
            const val = s5 - s34;

            let color = '#0db27a'; // Default Green
            if (i > 0 && results[i - 1]?.value !== undefined) {
                const prev = results[i - 1].value as number;
                if (val < prev) {
                    color = '#ef4444'; // Red
                }
            }

            results[i] = {
                time: candles[i].time,
                value: val,
                color: color
            };
        }
    }

    return results;
}
