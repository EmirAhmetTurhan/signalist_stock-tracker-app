export type WPRInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
};

export type WPRPoint = {
    time: number;
    value: number;
};

export function computeWPR(
    candles: WPRInput[],
    period = 14
): WPRPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const out: WPRPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) continue;

        let highestHigh = -Infinity;
        let lowestLow = Infinity;

        for (let j = 0; j < period; j++) {
            const idx = i - j;
            if (candles[idx].high > highestHigh) highestHigh = candles[idx].high;
            if (candles[idx].low < lowestLow) lowestLow = candles[idx].low;
        }

        const close = candles[i].close;
        const denominator = highestHigh - lowestLow;
        let wpr = 0;

        if (denominator !== 0) {
            wpr = ((highestHigh - close) / denominator) * -100;
        }

        out.push({
            time: candles[i].time,
            value: wpr,
        });
    }

    return out;
}