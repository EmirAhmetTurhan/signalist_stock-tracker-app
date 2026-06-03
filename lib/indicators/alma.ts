export function computeALMA(data: { time: string | number; close: number }[], window: number = 9, offset: number = 0.85, sigma: number = 6) {
    if (!data || data.length < window) return [];

    const m = offset * (window - 1);
    const s = window / sigma;

    const weights: number[] = [];
    let weightSum = 0;
    for (let i = 0; i < window; i++) {
        const w = Math.exp(-Math.pow(i - m, 2) / (2 * Math.pow(s, 2)));
        weights.push(w);
        weightSum += w;
    }

    const almaData: ({ time: string | number; value?: number })[] = new Array(data.length);

    // Fill all entries with time and undefined value (dense array, warmup-safe)
    for (let i = 0; i < data.length; i++) {
        almaData[i] = { time: data[i].time, value: undefined };
    }

    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) continue;

        let weightedSum = 0;
        for (let j = 0; j < window; j++) {
            const priceIndex = i - (window - 1) + j;
            weightedSum += data[priceIndex].close * weights[j];
        }

        const alma = weightedSum / weightSum;
        almaData[i] = { time: data[i].time, value: alma };
    }

    return almaData;
}
