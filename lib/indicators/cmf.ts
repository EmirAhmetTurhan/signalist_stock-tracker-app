export type CMFInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type CMFPoint = {
    time: number;
    value: number;
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

    const out: CMFPoint[] = [];

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
            let cmfValue = 0;
            if (sumVol !== 0) {
                cmfValue = sumMFV / sumVol;
            }
            out.push({
                time: candles[i].time,
                value: cmfValue
            });
        }
    }

    return out;
}