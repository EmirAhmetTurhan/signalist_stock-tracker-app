export type RSIInput = {
    time: number;
    close: number;
};

export type RSIOutput = {
    time: number;
    rsi?: number;
    ma?: number;
};

function smma(values: number[], length: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);
    if (values.length < length) return out;

    let sum = 0;
    for (let i = 0; i < length; i++) {
        sum += values[i];
    }
    let prev = sum / length;
    out[length - 1] = prev;

    for (let i = length; i < values.length; i++) {
        const val = values[i];
        prev = (prev * (length - 1) + val) / length;
        out[i] = prev;
    }
    return out;
}

function sma(values: (number | undefined)[], length: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);

    let window: number[] = [];
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        if (typeof val === 'number') {
            window.push(val);
            sum += val;
            if (window.length > length) {
                sum -= window.shift()!;
            }
            if (window.length === length) {
                out[i] = sum / length;
            }
        }
    }
    return out;
}

export function computeRSI(
    candles: RSIInput[],
    length = 14,
    maLength = 14
): RSIOutput[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const closes = candles.map((c) => c.close);
    const gains: number[] = new Array(closes.length).fill(0);
    const losses: number[] = new Array(closes.length).fill(0);

    for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) gains[i] = change;
        if (change < 0) losses[i] = -change;
    }

    // Wilder's Smoothing
    const avgGain = smma(gains, length);
    const avgLoss = smma(losses, length);

    const rsiValues: (number | undefined)[] = new Array(closes.length).fill(undefined);

    for (let i = 0; i < closes.length; i++) {
        const gain = avgGain[i];
        const loss = avgLoss[i];

        if (typeof gain === 'number' && typeof loss === 'number') {
            if (loss === 0) {
                rsiValues[i] = 100;
            } else {
                const rs = gain / loss;
                rsiValues[i] = 100 - 100 / (1 + rs);
            }
        }
    }

    const rsiMA = sma(rsiValues, maLength);

    return candles.map((c, i) => ({
        time: c.time,
        rsi: rsiValues[i],
        ma: rsiMA[i],
    }));
}