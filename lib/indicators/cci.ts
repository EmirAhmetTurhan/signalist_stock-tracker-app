export type CCIInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
};

export type CCIOutput = {
    time: number;
    cci?: number;
    ma?: number; // Smoothing Line
};

function sma(values: (number | undefined)[], period: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);
    let sum = 0;
    let count = 0;
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

export function computeCCI(
    candles: CCIInput[],
    period = 20,
    smoothPeriod = 14
): CCIOutput[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const tp = candles.map((c) => (c.high + c.low + c.close) / 3);

    const smas = sma(tp, period);

    const cciValues: (number | undefined)[] = new Array(candles.length).fill(undefined);

    for (let i = 0; i < candles.length; i++) {
        const currentTP = tp[i];
        const currentSMA = smas[i];

        if (typeof currentSMA !== 'number') continue;

        let sumAbsDiff = 0;
        for (let j = 0; j < period; j++) {
            const prevTP = tp[i - j];
            sumAbsDiff += Math.abs(prevTP - currentSMA);
        }
        const meanDev = sumAbsDiff / period;

        let val = 0;
        if (meanDev !== 0) {
            val = (currentTP - currentSMA) / (0.015 * meanDev);
        }
        cciValues[i] = val;
    }

    const cciMA = sma(cciValues, smoothPeriod);

    return candles.map((c, i) => ({
        time: c.time,
        cci: cciValues[i],
        ma: cciMA[i],
    }));
}