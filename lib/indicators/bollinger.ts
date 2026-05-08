export function computeBollingerBands(
    data: { time: string | number; close: number }[],
    length: number = 20,
    stdDevMult: number = 2,
    offset: number = 0
) {
    if (!data || data.length < length) return [];

    const result: {
        time: string | number;
        basis: number;
        upper: number;
        lower: number;
    }[] = [];

    for (let i = length - 1; i < data.length; i++) {
        const slice = data.slice(i - length + 1, i + 1);
        const sum = slice.reduce((acc, val) => acc + val.close, 0);
        const basis = sum / length;

        const variance = slice.reduce((acc, val) => acc + Math.pow(val.close - basis, 2), 0) / length;
        const stdDev = Math.sqrt(variance);

        result.push({
            time: data[i].time,
            basis,
            upper: basis + stdDevMult * stdDev,
            lower: basis - stdDevMult * stdDev,
        });
    }

    // Apply offset if needed
    if (offset !== 0) {
        // Shift values forward or backward by `offset` periods
        const shiftedResult = [];
        for (let i = 0; i < result.length; i++) {
            const targetIndex = i - offset;
            if (targetIndex >= 0 && targetIndex < result.length) {
                shiftedResult.push({
                    time: result[i].time,
                    basis: result[targetIndex].basis,
                    upper: result[targetIndex].upper,
                    lower: result[targetIndex].lower,
                });
            } else {
                shiftedResult.push({
                    time: result[i].time,
                    basis: result[i].basis, // Fallback if out of bounds, or could be undefined
                    upper: result[i].upper,
                    lower: result[i].lower,
                });
            }
        }
        return shiftedResult;
    }

    return result;
}
