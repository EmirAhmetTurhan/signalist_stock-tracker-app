// SMI Ergodic Indicator (TSI tabanlı mantık)
// Genellikle: Long Length=20, Short Length=5, Signal Length=5

export type SMIInput = {
    time: number; // UTCTimestamp
    close: number;
};

export type SMIPoint = {
    time: number; // UTCTimestamp
    smi?: number; // Ana Çizgi (Ergodic)
    signal?: number; // Sinyal Çizgisi
    histogram?: number; // Fark (Osilatör)
};

function ema(values: (number | undefined)[], period: number): (number | undefined)[] {
    const k = 2 / (period + 1);
    const out: (number | undefined)[] = new Array(values.length).fill(undefined);

    // İlk geçerli değeri bul
    let firstIndex = -1;
    for (let i = 0; i < values.length; i++) {
        if (typeof values[i] === 'number') {
            firstIndex = i;
            break;
        }
    }

    if (firstIndex === -1 || values.length < period) return out;

    // SMA ile başlat (Seed)
    let sum = 0;
    let count = 0;
    for (let i = firstIndex; i < firstIndex + period; i++) {
        if(i < values.length) {
            sum += values[i] as number;
            count++;
        }
    }

    if (count < period) return out;

    let prev = sum / period;
    out[firstIndex + period - 1] = prev;

    for (let i = firstIndex + period; i < values.length; i++) {
        const v = values[i];
        if (typeof v === 'number') {
            prev = v * k + prev * (1 - k);
            out[i] = prev;
        }
    }
    return out;
}

export function computeSMI(
    candles: SMIInput[],
    longLen = 20,
    shortLen = 5,
    sigLen = 5
): SMIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const closes = candles.map((c) => c.close);
    const changes: (number | undefined)[] = [undefined]; // İlk değer yok
    const absChanges: (number | undefined)[] = [undefined];

    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        changes.push(diff);
        absChanges.push(Math.abs(diff));
    }

    // 1. Düzeltme (Long Length)
    const smooth1 = ema(changes, longLen);
    const absSmooth1 = ema(absChanges, longLen);

    // 2. Düzeltme (Short Length)
    const smooth2 = ema(smooth1, shortLen);
    const absSmooth2 = ema(absSmooth1, shortLen);

    const smiLine: (number | undefined)[] = [];

    for (let i = 0; i < candles.length; i++) {
        const num = smooth2[i];
        const den = absSmooth2[i];

        if (typeof num === 'number' && typeof den === 'number' && den !== 0) {
            // TSI formülü: 100 * (DoubleSmoothChange / DoubleSmoothAbsChange)
            smiLine.push(100 * (num / den));
        } else {
            smiLine.push(undefined);
        }
    }

    // Sinyal Çizgisi
    // Sinyal hesabı için sadece tanımlı SMI değerlerini alıp EMA hesaplayıp geri eşlemeliyiz
    // Ancak basitlik adına undefined korumalı ema fonksiyonumuzla direkt verebiliriz.
    const signalLine = ema(smiLine, sigLen);

    return candles.map((c, i) => {
        const s = smiLine[i];
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