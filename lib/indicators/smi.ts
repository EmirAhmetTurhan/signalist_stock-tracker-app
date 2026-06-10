// SMI Ergodic Indicator
// Pine Script reference:
//   hh = ta.highest(high, SMI_LONG)
//   ll = ta.lowest(low, SMI_LONG)
//   hh_ema = ta.ema(hh, SMI_SHORT)
//   ll_ema = ta.ema(ll, SMI_SHORT)
//   smi_diff = hh_ema - ll_ema
//   smi_avg = (hh_ema + ll_ema) / 2
//   smi_val = ((close - smi_avg) / (smi_diff / 2)) * 100
//   smi_signal = ta.ema(smi_val, SMI_SIG)

import { createEMA } from './_math';

export type SMIInput = {
    time: number; // UTCTimestamp
    high: number;
    low: number;
    close: number;
};

export type SMIPoint = {
    time: number; // UTCTimestamp
    smi?: number; // Ana Çizgi (Ergodic)
    signal?: number; // Sinyal Çizgisi
    histogram?: number; // Fark (Osilatör)
};

/** Rolling highest value over lookback period */
function rollingHighest(values: number[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            result.push(undefined);
            continue;
        }
        const start = i - period + 1;
        let max = -Infinity;
        for (let j = start; j <= i; j++) {
            if (values[j] > max) max = values[j];
        }
        result.push(max);
    }
    return result;
}

/** Rolling lowest value over lookback period */
function rollingLowest(values: number[], period: number): (number | undefined)[] {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
            result.push(undefined);
            continue;
        }
        const start = i - period + 1;
        let min = Infinity;
        for (let j = start; j <= i; j++) {
            if (values[j] < min) min = values[j];
        }
        result.push(min);
    }
    return result;
}

export function computeSMI(
    candles: SMIInput[],
    longLen = 14,
    shortLen = 3,
    sigLen = 3
): SMIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    // Rolling highest high / lowest low over longLen
    const hh = rollingHighest(highs, longLen);
    const ll = rollingLowest(lows, longLen);

    // EMA of highest highs / lowest lows (shortLen)
    const hhEma = createEMA(hh, shortLen, 'sma');
    const llEma = createEMA(ll, shortLen, 'sma');

    // Compute SMI value for each bar
    const smiValues: (number | undefined)[] = new Array(candles.length).fill(undefined);

    for (let i = 0; i < candles.length; i++) {
        const hhEmaVal = hhEma[i];
        const llEmaVal = llEma[i];

        if (typeof hhEmaVal !== 'number' || typeof llEmaVal !== 'number') continue;

        const smiDiff = hhEmaVal - llEmaVal;
        const smiAvg = (hhEmaVal + llEmaVal) / 2;

        if (smiDiff !== 0) {
            // Pine Script: ((close - smi_avg) / (smi_diff / 2)) * 100
            smiValues[i] = ((closes[i] - smiAvg) / (smiDiff / 2)) * 100;
        } else {
            smiValues[i] = 0;
        }
    }

    // Signal line: EMA of SMI values
    const signalLine = createEMA(smiValues, sigLen, 'sma');

    return candles.map((c, i) => {
        const s = smiValues[i];
        const sig = signalLine[i];
        let hist: number | undefined = undefined;

        if (typeof s === 'number' && typeof sig === 'number') {
            hist = s - sig;
        }

        return {
            time: c.time,
            smi: s,
            signal: sig,
            histogram: hist
        };
    });
}
