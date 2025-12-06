export type MADRInput = {
    time: number; // UTCTimestamp
    close: number;
};

export type MADRPoint = {
    time: number;
    value: number;
};

function sma(values: (number | undefined)[], period: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);
    let sum = 0;
    let window: number[] = [];

    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (typeof v === 'number') {
            window.push(v);
            sum += v;
            if (window.length > period) {
                sum -= window.shift()!;
            }
            if (window.length === period) {
                out[i] = sum / period;
            }
        }
    }
    return out;
}

export function computeMADR(candles: MADRInput[], period = 25): MADRPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const closes = candles.map((c) => c.close);
    const smas = sma(closes, period);
    const out: MADRPoint[] = [];

    for (let i = 0; i < candles.length; i++) {
        const close = closes[i];
        const ma = smas[i];

        if (typeof close === 'number' && typeof ma === 'number' && ma !== 0) {
            // (Close - MA) / MA * 100
            const devRate = ((close - ma) / ma) * 100;

            out.push({
                time: candles[i].time,
                value: devRate,
            });
        }
    }

    return out;
}