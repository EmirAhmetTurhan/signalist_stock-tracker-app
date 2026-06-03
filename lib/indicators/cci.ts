import { createSMA, createDev } from './_math';

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

/**
 * Commodity Channel Index (CCI)
 * Pine Script reference:
 *   tp_cci = (high + low + close) / 3
 *   sma_tp = ta.sma(tp_cci, CCI_LEN)
 *   mad = ta.dev(tp_cci, CCI_LEN)   ← ta.dev uses CURRENT sma as mean for ALL terms
 *   cci_val = (tp_cci - sma_tp) / (0.015 * mad)
 *
 * KRİTİK: ta.dev() ile createSMA(absDiff, period) ARASINDAKİ FARK:
 *   ta.dev[i] = sum(|tp[i-k] - sma_tp[i]|, k) / period   ← AYNI mean
 *   createSMA(absDiff)[i] = sum(|tp[i-k] - sma_tp[i-k]|, k) / period   ← historical mean'ler
 *   Bu fark özellikle trendli piyasalarda CCI değerlerini tamamen değiştirir.
 */
export function computeCCI(
    candles: CCIInput[],
    period = 20,
    smoothPeriod = 14
): CCIOutput[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const tp = candles.map((c) => (c.high + c.low + c.close) / 3);

    // SMA of typical price
    const smas = createSMA(tp, period);

    // Mean Absolute Deviation using Pine Script ta.dev approach.
    // createDev computes dev[i] = sum(|tp[i-k] - smas[i]|, k=0..period-1) / period
    // which matches ta.dev(tp, period) — all terms use current SMA as mean.
    const mad = createDev(tp, period);

    const cciValues: (number | undefined)[] = new Array(candles.length).fill(undefined);

    for (let i = 0; i < candles.length; i++) {
        const currentTP = tp[i];
        const currentSMA = smas[i];
        const currentMAD = mad[i];

        if (typeof currentSMA !== 'number' || typeof currentMAD !== 'number') continue;

        if (currentMAD !== 0) {
            cciValues[i] = (currentTP - currentSMA) / (0.015 * currentMAD);
        } else {
            cciValues[i] = 0;
        }
    }

    const cciMA = createSMA(cciValues, smoothPeriod);

    return candles.map((c, i) => ({
        time: c.time,
        cci: cciValues[i],
        ma: cciMA[i],
    }));
}
