import { createSMMA, createSMA } from './_math';

export type RSIInput = {
    time: number;
    close: number;
};

export type RSIOutput = {
    time: number;
    rsi?: number;
    ma?: number;
    /**
     * Per-bar confidence flag (Sprint 1 / B4.1):
     *   - 1 = reliable (warmup done AND fallback not triggered)
     *   - 0 = unreliable (warmup, undefined gain/loss, or "no movement" fallback)
     *
     * Swing trade sistemi bu alanı okuyarak o barın oylama gücünü sıfırlar.
     * RSI değerinin kendisi (100 fallback dahil) KORUNUR — sadece güven
     * seviyesi etiketlenir. Pipeline'ın NaN/0 ile çökme riski yoktur.
     */
    confidence: 0 | 1;
};

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

    // Wilder's Smoothing (merkezi SMMA)
    const avgGain = createSMMA(gains, length);
    const avgLoss = createSMMA(losses, length);

    const rsiValues: (number | undefined)[] = new Array(closes.length).fill(undefined);
    const confidenceArr: (0 | 1)[] = new Array(closes.length).fill(0);

    for (let i = 0; i < closes.length; i++) {
        const gain = avgGain[i];
        const loss = avgLoss[i];

        if (typeof gain === 'number' && typeof loss === 'number') {
            // SPRINT 5: Warmup eşiği `i < length - 1`'e güncellendi.
            // SMMA'nın ilk geçerli indeksi (SMA tohumu) `length - 1`'dir.
            // Eski `i < length` eşiği bu tohumu da fallback'e hapsederek,
            // gain=0/loss>0 (falling) ve gain>0/loss>0 (oscillating)
            // durumlarında 100 yerine gerçek değeri hesaplamayı engelliyordu.
            if (i < length - 1) {
                // SMMA henüz tanımlı değil → undefined, güven=0
                rsiValues[i] = undefined;
                confidenceArr[i] = 0;
            } else if (i === length - 1) {
                // SMMA tohumu (SMA seed) — değer hesaplanabilir,
                // fakat tam ısınma henüz tamamlanmadı → warmup confidence.
                if (gain === 0 && loss === 0) {
                    // "No movement" durumu — fallback 100, güven=0
                    rsiValues[i] = 100;
                } else if (loss === 0) {
                    // All-gain, no-loss — matematiksel olarak geçerli 100
                    rsiValues[i] = 100;
                } else {
                    // Gerçek RS hesabı (falling, oscillating, vb.)
                    const rs = gain / loss;
                    rsiValues[i] = 100 - 100 / (1 + rs);
                }
                confidenceArr[i] = 0; // warmup güveni
            } else if (gain === 0 && loss === 0) {
                // SPRINT 1 / B4.1: "No movement" fallback (Pine Script na karşılığı).
                // Hem gain hem loss sıfır → gerçek bir sinyal yok, sadece 100 yazıldı.
                // Değer 100 kalır (sistem çökmesin), confidence=0 yapılır.
                rsiValues[i] = 100;
                confidenceArr[i] = 0;
            } else if (loss === 0) {
                // SPRINT 1 / B4.1: Gerçek "all gains, no losses" durumu.
                // Bu GEÇERLI bir RSI=100 sinyali (sürekli yükselen piyasa).
                // Fallback DEĞİL — confidence=1 ile etiketlenir, sinyal geçerli.
                rsiValues[i] = 100;
                confidenceArr[i] = 1;
            } else {
                const rs = gain / loss;
                rsiValues[i] = 100 - 100 / (1 + rs);
                confidenceArr[i] = 1;
            }
        } else {
            // undefined gain/loss (aşırı uç durum)
            rsiValues[i] = undefined;
            confidenceArr[i] = 0;
        }
    }

    const rsiMA = createSMA(rsiValues, maLength);

    return candles.map((c, i) => ({
        time: c.time,
        rsi: rsiValues[i],
        ma: rsiMA[i],
        confidence: confidenceArr[i],
    }));
}
