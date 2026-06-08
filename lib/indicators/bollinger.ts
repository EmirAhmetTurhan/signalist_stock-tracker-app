import { createSMA } from './_math';

// Standart Bollinger Bands (20,2)
// NOTE: offset parameter accepted for API compatibility but not yet implemented
// (TradingView-style bar shift requires cross-bar index mapping).
export function computeBollingerBands(
    candles: { time: number; close: number }[],
    period = 20,
    multiplier = 2,
    _offset = 0
) {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const closes = candles.map((c) => c.close);
    const smaValues = createSMA(closes, period);

    const result: { time: number; basis?: number; upper?: number; lower?: number }[] = new Array(candles.length);

    // Fill all entries with time and undefined bands (dense array, warmup-safe)
    for (let i = 0; i < candles.length; i++) {
        result[i] = { time: candles[i].time, basis: undefined, upper: undefined, lower: undefined };
    }

    for (let i = 0; i < candles.length; i++) {
        const middle = smaValues[i];
        if (typeof middle !== 'number') continue;

        // Population variance (N, not N-1) — TradingView uyumlu
        const start = i - period + 1;
        let sumSq = 0;
        for (let j = start; j <= i; j++) {
            if (j >= 0) {
                const diff = closes[j] - middle;
                sumSq += diff * diff;
            }
        }
        const stdDev = Math.sqrt(sumSq / period);

        result[i] = {
            time: candles[i].time,
            basis: middle,
            upper: middle + multiplier * stdDev,
            lower: middle - multiplier * stdDev,
        };
    }

    return result;
}
