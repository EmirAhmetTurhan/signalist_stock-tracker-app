import { createEMA, createSMA } from './_math';

export type WTInput = {
  time: UTCTimestamp;
  high: number;
  low: number;
  close: number;
};

export type WTPoint = {
  time: UTCTimestamp;
  wt1?: number;
  wt2?: number;
  cross?: 1 | -1; // 1: bullish cross (wt1 crosses above wt2), -1: bearish cross
  /**
   * Per-bar confidence flags (Sprint 1 / B4.1):
   *   - 1 = reliable (warmup done AND no upstream fallback)
   *   - 0 = unreliable (warmup, undefined ESA, or DE=0 fallback)
   *
   * WaveTrend pipeline'ı çok katmanlı:
   *   CI = (hlc3 - ESA) / (0.015 × DE)
   *   wt1 = EMA(CI, n2)
   *   wt2 = SMA(wt1, signal)
   *
   * Her katmanda fallback tetiklenirse (CI=0) alt katmanlar da
   * confidence=0 miras alır. Bu sayede Pine Script'in `na` davranışının
   * fonksiyonel karşılığı elde edilir — değer 0 kalır, oylama gücü sıfırlanır.
   */
  wt1Confidence: 0 | 1;
  wt2Confidence: 0 | 1;
};

export function computeWaveTrend(
  candles: WTInput[],
  n1 = 10,
  n2 = 21,
  signal = 4
): WTPoint[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const hlc3 = candles.map((c) => (Number(c.high ?? 0) + Number(c.low ?? 0) + Number(c.close ?? 0)) / 3);

  // ESA and DE per LazyBear (EMA with SMA seed)
  const esa = createEMA(hlc3, n1, 'sma');
  const deInput: number[] = hlc3.map((v, i) => Math.abs(v - (typeof esa[i] === 'number' ? (esa[i] as number) : v)));
  const de = createEMA(deInput, n1, 'sma');

  // SPRINT 1 / B4.1: CI hesaplanırken her bar için confidence takip et.
  // Fallback tetiklenen bar (ESA undefined veya DE=0) → confidence=0.
  // Değer 0 olarak KORUNUR (sistem çökmesin), sadece güven etiketlenir.
  const ci: number[] = new Array(hlc3.length);
  const ciConfidence: (0 | 1)[] = new Array(hlc3.length);
  for (let i = 0; i < hlc3.length; i++) {
    const e = esa[i];
    const d = de[i];
    const denom = 0.015 * (typeof d === 'number' ? d : 0);
    if (typeof e !== 'number' || denom === 0) {
      ci[i] = 0; // Fallback korunur (MCTS/DE'yi çökertmemek için)
      ciConfidence[i] = 0;
    } else {
      ci[i] = (hlc3[i] - e) / denom;
      ciConfidence[i] = 1;
    }
  }

  // wt1 = EMA(CI, n2) — TCI (Trend Confirmation Indicator)
  const wt1Arr = createEMA(ci, n2, 'sma');
  // SPRINT 1 / B4.1: wt1Confidence — EMA warmup'ta sıfır, ayrıca pencere
  // içindeki HERHANGİ bir CI bar'ı confidence=0 ise wt1 de confidence=0.
  const wt1Confidence: (0 | 1)[] = new Array(hlc3.length);
  for (let i = 0; i < hlc3.length; i++) {
    if (i < n2 - 1) {
      // EMA warmup — yeterli veri yok
      wt1Confidence[i] = 0;
    } else {
      let allOk: 0 | 1 = 1;
      for (let j = i - n2 + 1; j <= i; j++) {
        if (ciConfidence[j] === 0) { allOk = 0; break; }
      }
      wt1Confidence[i] = allOk;
    }
  }

  // wt2 = SMA(wt1, signal) — sinyal çizgisi
  const wt1Values: number[] = wt1Arr.map((v) => (typeof v === 'number' ? v : 0));
  const wt2Arr = createSMA(wt1Values, signal);
  // SPRINT 1 / B4.1: wt2Confidence — SMA warmup'ta sıfır, ayrıca pencere
  // içindeki HERHANGİ bir wt1 bar'ı confidence=0 ise wt2 de confidence=0.
  const wt2Confidence: (0 | 1)[] = new Array(hlc3.length);
  for (let i = 0; i < hlc3.length; i++) {
    if (i < signal - 1) {
      // SMA warmup
      wt2Confidence[i] = 0;
    } else {
      let allOk: 0 | 1 = 1;
      for (let j = i - signal + 1; j <= i; j++) {
        if (wt1Confidence[j] === 0) { allOk = 0; break; }
      }
      wt2Confidence[i] = allOk;
    }
  }

  const out: WTPoint[] = candles.map((c, i) => ({
    time: c.time,
    wt1: wt1Arr[i],
    wt2: wt2Arr[i],
    wt1Confidence: wt1Confidence[i],
    wt2Confidence: wt2Confidence[i],
  }));

  // Detect crosses
  for (let i = 1; i < out.length; i++) {
    const p1 = out[i - 1];
    const p2 = out[i];
    const a1 = p1.wt1;
    const b1 = p1.wt2;
    const a2 = p2.wt1;
    const b2 = p2.wt2;
    if (typeof a1 === 'number' && typeof b1 === 'number' && typeof a2 === 'number' && typeof b2 === 'number') {
      // bullish cross when wt1 crosses above wt2
      if (a1 <= b1 && a2 > b2) p2.cross = 1;
      // bearish cross when wt1 crosses below wt2
      else if (a1 >= b1 && a2 < b2) p2.cross = -1;
    }
  }

  return out;
}
