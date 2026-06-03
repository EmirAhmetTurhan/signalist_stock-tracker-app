// Directional Movement Index (DMI) utilities
// Default period: 14

import { createSMMA } from './_math';

export type DMIInput = {
    time: UTCTimestamp;
    high: number;
    low: number;
    close: number;
};

export type DMIPoint = {
    time: UTCTimestamp;
    plusDI?: number; // +DI
    minusDI?: number; // -DI
    adx?: number; // Average Directional Index
};

/**
 * Wilder's Smoothing for DMI
 *
 * DOĞRU formül: prev = (prev * (period - 1) + cur) / period
 * (createSMMA ile aynı, ama eski DMI implementasyonu
 *  prev = prev - prev/period + cur kullanıyordu — bu kümülatif toplamdır, MA değil)
 *
 * @deprecated Use createSMMA from _math.ts instead. Kept for backward compat.
 */
function wildersSmooth(values: number[], period: number): (number | undefined)[] {
    return createSMMA(values, period);
}

export function computeDMI(
    candles: DMIInput[],
    diLength = 14,      // DI Length
    adxSmoothing = 14   // ADX Smoothing
): DMIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const highs = candles.map((c) => Number(c.high ?? 0));
    const lows = candles.map((c) => Number(c.low ?? 0));
    const closes = candles.map((c) => Number(c.close ?? 0));

    const len = candles.length;
    const trArr: number[] = new Array(len).fill(0);
    const plusDMArr: number[] = new Array(len).fill(0);
    const minusDMArr: number[] = new Array(len).fill(0);

    for (let i = 1; i < len; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        const prevHigh = highs[i - 1];
        const prevLow = lows[i - 1];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trArr[i] = tr;

        const upMove = high - prevHigh;
        const downMove = prevLow - low;
        plusDMArr[i] = upMove > 0 && upMove > downMove ? upMove : 0;
        minusDMArr[i] = downMove > 0 && downMove > upMove ? downMove : 0;
    }

    const trSmooth = wildersSmooth(trArr, diLength);
    const plusDMSmooth = wildersSmooth(plusDMArr, diLength);
    const minusDMSmooth = wildersSmooth(minusDMArr, diLength);

    const plusDI: (number | undefined)[] = new Array(len).fill(undefined);
    const minusDI: (number | undefined)[] = new Array(len).fill(undefined);
    for (let i = 0; i < len; i++) {
        const trS = trSmooth[i];
        const p = plusDMSmooth[i];
        const m = minusDMSmooth[i];
        if (typeof trS === 'number' && trS > 0 && typeof p === 'number' && typeof m === 'number') {
            plusDI[i] = (p / trS) * 100;
            minusDI[i] = (m / trS) * 100;
        }
    }

    const dxArr: number[] = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
        const p = plusDI[i];
        const m = minusDI[i];
        if (typeof p === 'number' && typeof m === 'number' && p + m !== 0) {
            dxArr[i] = (Math.abs(p - m) / (p + m)) * 100;
        } else {
            dxArr[i] = 0;
        }
    }

    // ADX: Wilder's Smoothing of DX
    // Not: Artık createSMMA doğru ortalamayı üretir, ek bölme işlemi gerekmez.
    // Eski kod `v / adxSmoothing` yapıyordu çünkü wildersSmooth kümülatif toplamdı.
    const adxSmooth = wildersSmooth(dxArr, adxSmoothing);

    const out: DMIPoint[] = candles.map((c, i) => ({
        time: c.time,
        plusDI: plusDI[i],
        minusDI: minusDI[i],
        adx: adxSmooth[i], // Artık ek bölme yok — doğru ADX değeri
    }));

    return out;
}
