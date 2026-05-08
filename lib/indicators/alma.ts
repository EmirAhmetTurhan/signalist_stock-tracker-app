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

    const almaData = [];
    for (let i = 0; i < data.length; i++) {
        if (i < window - 1) {
            continue;
        }

        let weightedSum = 0;
        for (let j = 0; j < window; j++) {
            // i is current index. We need to go back up to window-1.
            // j=0 is oldest data point in the window, j=window-1 is newest.
            // In typical ALMA implementation:
            // price[0] is oldest, price[window-1] is newest in the window array.
            const priceIndex = i - (window - 1) + j;
            weightedSum += data[priceIndex].close * weights[j];
        }

        const alma = weightedSum / weightSum;
        almaData.push({ time: data[i].time, value: alma });
    }

    return almaData;
}
