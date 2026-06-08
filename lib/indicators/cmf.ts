export type CMFInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type CMFPoint = {
    time: number;
    value?: number;
};

export function computeCMF(candles: CMFInput[], period = 20): CMFPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const mfv: number[] = [];
    const vols: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        const { high, low, close, volume } = candles[i];

        const range = high - low;
        let mfm = 0;
        if (range > 0) {
            mfm = ((close - low) - (high - close)) / range;
        }

        const moneyFlowVol = mfm * volume;

        mfv.push(moneyFlowVol);
        vols.push(volume);
    }

    const out: CMFPoint[] = new Array(candles.length);

    // Fill all entries with time and undefined value (dense array, warmup-safe)
    for (let i = 0; i < candles.length; i++) {
        out[i] = { time: candles[i].time, value: undefined };
    }

    let sumMFV = 0;
    let sumVol = 0;

    for (let i = 0; i < candles.length; i++) {
        sumMFV += mfv[i];
        sumVol += vols[i];

        if (i >= period) {
            sumMFV -= mfv[i - period];
            sumVol -= vols[i - period];
        }

        if (i >= period - 1) {
            out[i] = {
                time: candles[i].time,
                value: sumVol !== 0 ? sumMFV / sumVol : undefined,
            };
        }
    }

    return out;
}