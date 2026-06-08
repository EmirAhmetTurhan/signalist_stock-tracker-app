// lib/ai/tools/helpers.ts — Shared helpers for AI tools (timeout, error formatting, signals)
// All tool category files import from here.

import type { ComputedIndicators } from '@/lib/ta/types';

// ─── Event-loop yield ───────────────────────────────────────────────────────

/** CPU-bound işlemlerin Node.js Event Loop'unu bloke etmemesi için */
export const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ─── Timeouts ───────────────────────────────────────────────────────────────

export const HEAVY_TIMEOUT_MS = 45000; // 45 saniye (optimizasyon/backtest/ranking için)
export const LIGHT_TIMEOUT_MS = 30000; // 30 saniye (veri çekme için — Yahoo fallback'e yeterli süre)

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT: ${label} exceeded ${ms / 1000}s limit`)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── Error formatting ───────────────────────────────────────────────────────

export function formatError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.startsWith('TIMEOUT:')) return e.message;
    return e.message.length > 200 ? e.message.slice(0, 200) + '...' : e.message;
  }
  return String(e).slice(0, 200);
}

export type ToolResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
  userMessage?: string;
  recoverable?: boolean;
  [key: string]: unknown;
};

export function toToolError(e: unknown, symbol?: string): ToolResult {
  const errMsg = formatError(e);
  const lower = errMsg.toLowerCase();

  if (lower.includes('403') || lower.includes('denied') || lower.includes('access')) {
    return {
      success: false, error: errMsg, errorCode: 'EXTERNAL_API_DENIED',
      userMessage: `Borsa veri saglayicisi ${symbol ? symbol + ' icin ' : ''}erisimi reddetti. API planinizi kontrol edin.`,
      recoverable: true,
    };
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      success: false, error: errMsg, errorCode: 'EXTERNAL_API_RATE_LIMIT',
      userMessage: 'API istek limitine ulasildi (60 istek/dakika). Lutfen 1 dakika bekleyip tekrar deneyin.',
      recoverable: true,
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      success: false, error: errMsg, errorCode: 'EXTERNAL_API_TIMEOUT',
      userMessage: 'Borsa veri saglayicisi yanit vermedi. Sunucular yogun olabilir.',
      recoverable: true,
    };
  }
  if (lower.includes('insufficient') || lower.includes('candle') || lower.includes('no data')) {
    return {
      success: false, error: errMsg, errorCode: 'INSUFFICIENT_DATA',
      userMessage: `${symbol ? symbol + ' icin y' : 'Y'}eterli gecmis veri bulunamadi.`,
      recoverable: false,
    };
  }
  if (lower.includes('invalid') && lower.includes('symbol')) {
    return {
      success: false, error: errMsg, errorCode: 'INVALID_SYMBOL',
      userMessage: `Gecersiz hisse sembolu: ${symbol || 'bilinmiyor'}. Sembolu kontrol edip tekrar deneyin.`,
      recoverable: false,
    };
  }
  return {
    success: false, error: errMsg, errorCode: 'INTERNAL_ERROR',
    userMessage: 'Beklenmeyen bir sistem hatasi olustu. Lutfen daha sonra tekrar deneyin.',
    recoverable: false,
  };
}

export function safeResult(fnName: string, result: unknown): ToolResult {
  if (result && typeof result === 'object' && 'success' in result) return result as ToolResult;
  return { success: true, data: result as unknown };
}

// ─── Indicator data mapping ─────────────────────────────────────────────────

export function mapIndicatorData(computed: ComputedIndicators, key: string): unknown | undefined {
  const map: Record<string, unknown> = {
    macd: computed.macd, rsi: computed.rsi, stochrsi: computed.stochrsi,
    wavetrend: computed.wavetrend, dmi: computed.dmi, mfi: computed.mfi,
    smi: computed.smi, ao: computed.ao, cci: computed.cci, wpr: computed.wpr,
    di: computed.di, cmf: computed.cmf, ad: computed.ad, netvol: computed.netvol,
    madr: computed.madr, bb: computed.bb, alma: computed.alma,
  };
  return map[key] ?? undefined;
}

// ─── Signal descriptions ────────────────────────────────────────────────────

export function getSignalDescription(indicator: string, signal: string): string {
  const isBuy = signal.includes('BUY');
  const isStrong = signal.includes('STRONG');
  const isNeutral = signal === 'NEUTRAL';
  if (isNeutral) return 'Nötr sinyal; belirgin bir trend gözlemlenmiyor.';

  switch (indicator.toLowerCase()) {
    case 'macd': return isBuy ? (isStrong ? 'Güçlü alım sinyali; MACD çizgisi sinyal çizgisini güçlü şekilde yukarı kesti.' : 'Hafif alım sinyali; kısa vadeli momentum toparlanıyor.') : (isStrong ? 'Güçlü satış sinyali; MACD çizgisi sinyal çizgisini sert şekilde aşağı kesti.' : 'Hafif satış sinyali; kısa vadeli momentum zayıflıyor.');
    case 'rsi': return isBuy ? (isStrong ? 'Aşırı satım bölgesinden dönüş; güçlü alım fırsatı.' : 'Hafif alım sinyali; momentum zayıf ancak yükseliş eğilimi sürüyor.') : (isStrong ? 'Aşırı alım bölgesinden dönüş; güçlü satış baskısı.' : 'Hafif satış sinyali; fiyat zirvelerden geriliyor.');
    case 'stochrsi': return isBuy ? (isStrong ? 'Güçlü alım sinyali; fiyatın aşırı satım bölgesinden çıkma ihtimali yüksek.' : 'Hafif alım sinyali; fiyatın aşırı satım bölgesine girme ihtimali düşük.') : (isStrong ? 'Güçlü satış sinyali; aşırı alım bölgesinden dönüş başladı.' : 'Hafif satış sinyali; kısa vadeli tepe oluşumu gözlemleniyor.');
    case 'bb': return isBuy ? 'Fiyat alt banda yaklaştı/değdi; tepki alımı gelebilir.' : 'Fiyat üst banda yaklaştı/değdi; dirençle karşılaşabilir.';
    default: return isBuy ? (isStrong ? 'Güçlü bir yükseliş trendi teyidi.' : 'Yükseliş yönünde ılımlı bir sinyal.') : (isStrong ? 'Güçlü bir düşüş trendi teyidi.' : 'Düşüş yönünde ılımlı bir sinyal.');
  }
}

export function generateOverallEvaluation(
  signals: Array<{ indicator: string; signal: string }>,
  overallSignal: string,
  _overallScore: number,
): string {
  const buys = signals.filter(s => s.signal.includes('BUY')).map(s => s.indicator.toUpperCase());
  const sells = signals.filter(s => s.signal.includes('SELL')).map(s => s.indicator.toUpperCase());

  if (buys.length > sells.length) {
    if (overallSignal === 'STRONG BUY') return `${buys.slice(0, 2).join(' ve ')} güçlü bir yükseliş sinyali üretirken, diğer indikatörler bu hareketi destekliyor. Genel trend pozitif yönde.`;
    return `${buys.slice(0, 2).join(' ve ')} alım yönünde sinyaller üretiyor, ancak piyasada temkinli bir iyimserlik hakim. Trendin gücünü doğrulamak için hacim verilerine dikkat edilmeli.`;
  }
  if (sells.length > buys.length) {
    if (overallSignal === 'STRONG SELL') return `${sells.slice(0, 2).join(' ve ')} güçlü bir düşüş sinyali veriyor. Ayı piyasası baskısı belirginleşmiş durumda.`;
    return `${sells.slice(0, 2).join(' ve ')} satış yönünde sinyaller üretiyor. Trend zayıflığı gözlemleniyor, olası destek seviyeleri takip edilmeli.`;
  }
  return `İndikatörler arasında net bir uzlaşma bulunmuyor. Piyasa yatay veya kararsız bir seyir izliyor. İşlem yapmadan önce ek sinyallerin (hacim, formasyon) onaylanması önerilir.`;
}
