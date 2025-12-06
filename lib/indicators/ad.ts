export type ADInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type ADPoint = {
    time: number;
    value: number;
};

export function computeAD(candles: ADInput[]): ADPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const out: ADPoint[] = [];
    let prevAD = 0;

    for (let i = 0; i < candles.length; i++) {
        const { high, low, close, volume } = candles[i];

        const range = high - low;
        let mfm = 0;

        if (range > 0) {
            mfm = ((close - low) - (high - close)) / range;
        }

        const moneyFlowVolume = mfm * volume;

        const currentAD = prevAD + moneyFlowVolume;

        out.push({
            time: candles[i].time,
            value: currentAD
        });

        prevAD = currentAD;
    }

    return out;
}