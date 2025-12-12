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

function calculateEMA(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(0);

    out[0] = values[0];

    for (let i = 1; i < values.length; i++) {
        const val = Number.isFinite(values[i]) ? values[i] : 0;
        out[i] = val * k + out[i - 1] * (1 - k);
    }
    return out;
}

function calculateSMA(values: number[], period: number): number[] {
    const out = new Array(values.length).fill(0);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) {
            sum -= values[i - period];
        }

        if (i >= period - 1) {
            out[i] = sum / period;
        } else {
            out[i] = sum / (i + 1);
        }
    }
    return out;
}

function highest(values: number[], index: number, length: number): number {
    let maxVal = -Infinity;
    const start = Math.max(0, index - length + 1);
    for (let i = start; i <= index; i++) {
        if (values[i] > maxVal) maxVal = values[i];
    }
    return maxVal;
}

function lowest(values: number[], index: number, length: number): number {
    let minVal = Infinity;
    const start = Math.max(0, index - length + 1);
    for (let i = start; i <= index; i++) {
        if (values[i] < minVal) minVal = values[i];
    }
    return minVal;
}

export function computeDemandIndex(
    candles: DIInput[],
    period = 10,
    smooth = 10,
    priceRange = 2
): DIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const rawVaSeries: number[] = [];
    for (let i = 0; i < candles.length; i++) {
        const h = highest(highs, i, priceRange);
        const l = lowest(lows, i, priceRange);
        rawVaSeries.push(h - l);
    }

    const vaSeries = calculateSMA(rawVaSeries, period);

    const diRaw: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const open = c.open;
        const close = c.close;
        const volume = c.volume;

        let p = open !== 0 ? (close - open) / open : 0;

        let va = vaSeries[i];
        if (va === 0) va = 1;

        const k = (3 * close) / va;

        p = p * k;

        let bp = 0;
        let sp = 0;

        if (close > open) {
            bp = volume;
            sp = p !== 0 ? volume / p : volume; // p 0 ise koruma
        } else {
            bp = p !== 0 ? volume / p : volume;
            sp = volume;
        }

        let di = 0;

        const absBp = Math.abs(bp);
        const absSp = Math.abs(sp);

        if (absBp > absSp && bp !== 0) {
            di = sp / bp;
        } else if (sp !== 0) {
            di = bp / sp;
        } else {
            di = 0;
        }

        diRaw.push(di);
    }

    const diSmoothed = calculateEMA(diRaw, smooth);

    return candles.map((c, i) => ({
        time: c.time,
        value: diSmoothed[i]
    }));
}