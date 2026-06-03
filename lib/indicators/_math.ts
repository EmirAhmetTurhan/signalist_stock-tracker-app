// =============================================================================
// _math.ts — Merkezi Matematik Çekirdeği
//
// Tüm teknik indikatörlerin kullandığı ortak MA fonksiyonları.
// Amaç: 3 farklı EMA, 5 farklı SMA implementasyonunu tek kaynakta birleştirmek.
// =============================================================================

// ─── Yardımcı Tip ──────────────────────────────────────────────────────────
type Numeric = number | undefined;

// ─── Exponential Moving Average (EMA) ──────────────────────────────────────
//
// İki seed stratejisi:
//   'value' — İlk değerle başlat (TradingView uyumlu, MACD için)
//   'sma'   — İlk `period` değerin SMA'i ile başlat (standart yaklaşım)
//
export function createEMA(
    values: Numeric[],
    period: number,
    seed: 'value' | 'sma' = 'sma'
): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n === 0 || period <= 0) return out;

    const k = 2 / (period + 1);

    // İlk geçerli indeksi bul
    let firstIdx = -1;
    for (let i = 0; i < n; i++) {
        if (typeof values[i] === 'number') { firstIdx = i; break; }
    }
    if (firstIdx === -1) return out;

    if (seed === 'value') {
        // TradingView uyumlu: ilk değerle başlat
        let prev = Number(values[firstIdx] ?? 0);
        out[firstIdx] = prev;
        for (let i = firstIdx + 1; i < n; i++) {
            const v = typeof values[i] === 'number' ? (values[i] as number) : prev;
            prev = v * k + prev * (1 - k);
            out[i] = prev;
        }
    } else {
        // SMA ile başlat (standart)
        if (n - firstIdx < period) return out;

        let sum = 0;
        for (let i = firstIdx; i < firstIdx + period; i++) {
            sum += values[i] as number;
        }
        let prev = sum / period;
        out[firstIdx + period - 1] = prev;

        for (let i = firstIdx + period; i < n; i++) {
            const v = typeof values[i] === 'number' ? (values[i] as number) : prev;
            prev = v * k + prev * (1 - k);
            out[i] = prev;
        }
    }

    return out;
}

// ─── Wilder's Smoothing (SMMA) ─────────────────────────────────────────────
//
// DOĞRU formül: prev = (prev * (period - 1) + cur) / period
// YANLIŞ formül: prev = prev - prev / period + cur  (kümülatif toplam, DMI'da var)
//
// RSI, DMI (+DI/-DI/ADX), ve diğer Wilder's Smoothing kullanan indikatörler için.
//
export function createSMMA(values: number[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n < period || period <= 0) return out;

    // SMA seed
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += Number(values[i] ?? 0);
    }
    let prev = sum / period;
    out[period - 1] = prev;

    // Wilder's Smoothing
    for (let i = period; i < n; i++) {
        const cur = Number(values[i] ?? 0);
        prev = (prev * (period - 1) + cur) / period;
        out[i] = prev;
    }

    return out;
}

// ─── Simple Moving Average (SMA) ───────────────────────────────────────────
//
// Pine Script uyumlu: undefined (na) değerleri toplamda 0 olarak sayar,
// ancak pencere pozisyonunu korur. İlk çıktı index `period-1`'de başlar
// (tıpkı ta.sma gibi).
//
// Önceki davranış: undefined değerleri tamamen atlardı → pencere kaymasına
// ve çıktının `2*period-2`'ye gecikmesine yol açardı (CCI MAD hatasının
// kök nedeni).
//
// CIRCULAR BUFFER IMPLEMENTATION (O(n) tek pass, 0 per-bar allocation):
// Eski versiyon `window.push() + window.shift() + window.filter()` kullanıyordu
// → O(n) per bar → 17 indikatör × 500 bar × 15K GA eval = 127M array allocation.
// Yeni versiyon: pre-allocated fixed-size buffer + rotating index + running sum.
export function createSMA(values: Numeric[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n <= 0 || period <= 0) return out;

    // Pre-allocated circular buffer (reuse across iterations, no allocation)
    const buffer: Numeric[] = new Array(period);
    let bufferIdx = 0;       // Sonraki yazılacak pozisyon (rotating)
    let bufferCount = 0;     // Pencerede şu anki eleman sayısı (period'dan fazla olamaz)
    let sum = 0;             // Penceredeki tanımlı (number) değerlerin toplamı
    let definedCount = 0;    // Penceredeki tanımlı değer sayısı

    for (let i = 0; i < n; i++) {
        const v = values[i];

        // Pencere doluysa, en eski elemanı çıkar (rotating out)
        if (bufferCount === period) {
            const oldest = buffer[bufferIdx];
            if (typeof oldest === 'number') {
                sum -= oldest;
                definedCount--;
            }
        } else {
            bufferCount++;
        }

        // Yeni elemanı buffer'a yaz
        buffer[bufferIdx] = v;
        if (typeof v === 'number') {
            sum += v;
            definedCount++;
        }

        // Circular index ilerlet
        bufferIdx = (bufferIdx + 1) % period;

        // Pencere doldu VE en az 1 geçerli değer var → SMA çıktısı
        if (bufferCount === period && definedCount > 0) {
            out[i] = sum / period;
        }
    }

    return out;
}

// ─── Mean Absolute Deviation (Pine Script ta.dev uyumlu) ──────────────────
//
// Pine Script: ta.dev(source, length) = sum(|source - mean|, length) / length
//   where mean = ta.sma(source, length)[i] (CURRENT bar's SMA for ALL terms)
//
// KRİTİK FARK: createSMA(absDiff, period) her terim için historical SMA
// kullanırken, ta.dev() AYNI mean (current SMA) kullanır. Bu fark özellikle
// CCI hesaplamasında büyük fark yaratır.
//
// Çıktı: İlk geçerli değer `period-1` indeksinde başlar (tıpkı ta.dev gibi).
//
export function createDev(values: number[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n < period || period <= 0) return out;

    // SMA of values (same as ta.sma(source, length))
    const smas = createSMA(values, period);

    for (let i = period - 1; i < n; i++) {
        const mean = smas[i];
        if (typeof mean !== 'number') continue;

        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sum += Math.abs(values[j] - mean);
        }
        out[i] = sum / period;
    }

    return out;
}
