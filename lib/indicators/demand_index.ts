export type DIInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type DIPoint = {
    time: number;
    value: number;
};

function ema(values: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(0);
    out[0] = values[0];
    for (let i = 1; i < values.length; i++) {
        out[i] = values[i] * k + out[i - 1] * (1 - k);
    }
    return out;
}

function sma(values: number[], period: number): number[] {
    const out = new Array(values.length).fill(0);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= period) sum -= values[i - period];
        if (i >= period - 1) out[i] = sum / period;
        else out[i] = sum / (i + 1);
    }
    return out;
}

export function computeDemandIndex(candles: DIInput[], length = 19): DIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const prices = candles.map(c => (c.high + c.low + 2 * c.close) / 4);
    const volumes = candles.map(c => c.volume);

    const avgVol = sma(volumes, length);

    const K = 3;

    const buyPower: number[] = [];
    const sellPower: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            buyPower.push(volumes[i]);
            sellPower.push(volumes[i]);
            continue;
        }

        const P = prices[i];
        const prevP = prices[i - 1];
        const V = volumes[i];
        const vAvg = avgVol[i] || 1;


        let priceChange = P - prevP;

        const TR = Math.max(candles[i].high, candles[i-1].close) - Math.min(candles[i].low, candles[i-1].close);
        const cost = (K * Math.abs(priceChange)) / Math.max(TR, 0.00001); // 0 koruması

        let bp = V;
        let sp = V;

        if (priceChange > 0) {
            bp = V;
            sp = V / Math.exp(cost);
        }
        else if (priceChange < 0) {
            sp = V;
            bp = V / Math.exp(cost);
        }

        buyPower.push(bp);
        sellPower.push(sp);
    }

    const smoothBP = ema(buyPower, length);
    const smoothSP = ema(sellPower, length);

    const out: DIPoint[] = [];
    for (let i = 0; i < candles.length; i++) {
        const b = smoothBP[i];
        const s = smoothSP[i];

        let di = 0;
        if ((b + s) !== 0) {
            di = (100 * (b - s)) / (b + s);
        }

        out.push({
            time: candles[i].time,
            value: di
        });
    }

    return out;
}