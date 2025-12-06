export type AOInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
};

export type AOPoint = {
    time: number;
    value: number;
    color?: string;
};

function sma(values: number[], period: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);
    if (values.length < period) return out;

    let sum = 0;

    for (let i = 0; i < period; i++) {
        sum += values[i];
    }
    out[period - 1] = sum / period;

    for (let i = period; i < values.length; i++) {
        sum += values[i] - values[i - period];
        out[i] = sum / period;
    }
    return out;
}

export function computeAO(candles: AOInput[]): AOPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const hl2 = candles.map(c => (c.high + c.low) / 2);

    const sma5 = sma(hl2, 5);
    const sma34 = sma(hl2, 34);

    const results: AOPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
        const s5 = sma5[i];
        const s34 = sma34[i];

        if (typeof s5 === 'number' && typeof s34 === 'number') {
            const val = s5 - s34;

            let color = '#0db27a'; // Default Green
            if (results.length > 0) {
                const prev = results[results.length - 1].value;
                if (val < prev) {
                    color = '#ef4444'; // Red
                }
            }

            results.push({
                time: candles[i].time,
                value: val,
                color: color
            });
        }
    }

    return results;
}