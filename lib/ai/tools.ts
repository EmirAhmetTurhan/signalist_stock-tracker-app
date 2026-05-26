// lib/ai/tools.ts — AI Agent'ın kullanabileceği 16 araç
// Her tool: Zod schema (input validasyonu) + execute (iş mantığı)
// Dört savunma hattı: Zod, try-catch, timeout, event-loop yield

// CPU-bound işlemlerin Node.js Event Loop'unu bloke etmemesi için
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

import { tool } from 'ai';
import { z } from 'zod';
import { getDailyCandlesForAI, getDailyCandles, get4HourCandles, getNews } from '@/lib/actions/finnhub.actions';
import { getCurrentUserWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';
import { createAlert, deleteAlert, getUserAlerts } from '@/lib/actions/alerts.actions';
import { createSmartAlert as createSmartAlertAction, getSmartAlerts as getSmartAlertsAction } from '@/lib/actions/smart-alerts.actions';
import { computeIndicators } from '@/lib/ta/compute';
import { generateAllSignals } from '@/lib/ta/signals';
import { calculateWinRate } from '@/lib/ta/backtest';
import { findBestParameter, OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import { randomUUID } from 'crypto';
import { inngest } from '@/lib/inngest/client';
import { stockSymbolSchema } from '@/lib/validations/schemas';
import type { Candle } from '@/lib/ta/backtest';

// ========================================================================
// SAVUNMA HATTI 1: Timeout koruması
// ========================================================================

const HEAVY_TIMEOUT_MS = 45000; // 45 saniye (optimizasyon/backtest/ranking için)
const LIGHT_TIMEOUT_MS = 30000; // 30 saniye (veri çekme için — Yahoo fallback'e yeterli süre)

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

function formatError(e: unknown): string {
  if (e instanceof Error) {
    // Timeout hatalarini ozel formatla
    if (e.message.startsWith('TIMEOUT:')) return e.message;
    return e.message.length > 200 ? e.message.slice(0, 200) + '...' : e.message;
  }
  return String(e).slice(0, 200);
}

// Insancil hata yonetimi: teknik hatayi kullanici dostu mesaja + errorCode'a cevirir
function toToolError(e: unknown, symbol?: string): ToolResult {
  const errMsg = formatError(e);
  const lower = errMsg.toLowerCase();

  // Finnhub erisim hatalari
  if (lower.includes('403') || lower.includes('denied') || lower.includes('access')) {
    return {
      success: false,
      error: errMsg,
      errorCode: 'EXTERNAL_API_DENIED',
      userMessage: `Borsa veri saglayicisi ${symbol ? symbol + ' icin ' : ''}erisimi reddetti. API planinizi kontrol edin.`,
      recoverable: true,
    };
  }

  // Rate limit
  if (lower.includes('429') || lower.includes('rate limit')) {
    return {
      success: false,
      error: errMsg,
      errorCode: 'EXTERNAL_API_RATE_LIMIT',
      userMessage: 'API istek limitine ulasildi (60 istek/dakika). Lutfen 1 dakika bekleyip tekrar deneyin.',
      recoverable: true,
    };
  }

  // Timeout
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      success: false,
      error: errMsg,
      errorCode: 'EXTERNAL_API_TIMEOUT',
      userMessage: 'Borsa veri saglayicisi yanit vermedi. Sunucular yogun olabilir.',
      recoverable: true,
    };
  }

  // Yetersiz veri
  if (lower.includes('insufficient') || lower.includes('candle') || lower.includes('no data')) {
    return {
      success: false,
      error: errMsg,
      errorCode: 'INSUFFICIENT_DATA',
      userMessage: `${symbol ? symbol + ' icin y' : 'Y'}eterli gecmis veri bulunamadi.`,
      recoverable: false,
    };
  }

  // Gecersiz sembol
  if (lower.includes('invalid') && lower.includes('symbol')) {
    return {
      success: false,
      error: errMsg,
      errorCode: 'INVALID_SYMBOL',
      userMessage: `Gecersiz hisse sembolu: ${symbol || 'bilinmiyor'}. Sembolu kontrol edip tekrar deneyin.`,
      recoverable: false,
    };
  }

  // Beklenmeyen hata
  return {
    success: false,
    error: errMsg,
    errorCode: 'INTERNAL_ERROR',
    userMessage: 'Beklenmeyen bir sistem hatasi olustu. Lutfen daha sonra tekrar deneyin.',
    recoverable: false,
  };
}

// ========================================================================
// SAVUNMA HATTI 2: Try-catch wrapper
// ========================================================================

type ToolResult = { success: boolean; error?: string; errorCode?: string; userMessage?: string; recoverable?: boolean; [key: string]: unknown };

function safeResult(fnName: string, result: any): ToolResult {
  // Eğer zaten { success: ... } formatında döndüyse aynen kullan
  if (result && typeof result === 'object' && 'success' in result) return result as ToolResult;
  // Değilse success'e sar
  return { success: true, data: result };
}

// ========================================================================
// Yardımcılar
// ========================================================================

// ========================================================================
// Yardımcılar
// ========================================================================

export const DEFAULT_PARAMS = {
  macdFast: 12, macdSlow: 26, macdSig: 9,
  stochRsiLen: 14, stochLen: 14, stochK: 3, stochD: 3,
  wtAvgLen: 10, wtChannelLen: 21, wtMaLen: 4,
  dmiDiLen: 14, dmiAdxSmooth: 14,
  mfiPeriod: 14,
  smiLongLen: 20, smiShortLen: 5, smiSigLen: 5,
  rsiLen: 14, rsiMaLen: 14,
  cciLen: 20, cciMaLen: 14,
  wprLen: 14,
  diLen: 10, diSmooth: 10, diK: 2,
  cmfLen: 20,
  madrLen: 21,
  almaLen: 9, almaOffset: 0.85, almaSigma: 6,
  almaColor: '#fbbf24', almaOpacity: 100, almaWidth: 2, almaStyle: 0,
  bbLen: 20, bbStdDev: 2, bbOffset: 0,
  bbColor: '#3b82f6', bbOpacity: 100, bbWidth: 1,
};

const intervalSchema = z.enum(['1d', '4h']).default('1d');
const indicatorsListSchema = z.array(z.string()).min(1).max(17);

// SAVUNMA HATTI 1: Zorunlu sembol şeması — AI'a açık talimat
const requiredSymbol = stockSymbolSchema.describe(
  'REQUIRED: Stock symbol (e.g. AAPL, TSLA). If user did not provide a symbol, DO NOT call this tool — first ask the user which stock they want to analyze.'
);

// ========================================================================
// TOOL KATEGORİLERİ (Router Agent — 20+ tool'da token patlamasını önler)
// ========================================================================
// KATEGORİ A: TA_TOOLS — Teknik Analiz / Hesaplama (analiz, sinyal, fiyat)
// KATEGORİ B: RESEARCH_TOOLS — Araştırma / Backtest / Optimizasyon (ağır CPU)
// KATEGORİ C: USER_TOOLS — Kullanıcı Verisi (watchlist, alarm, not)

export const INDICATOR_NAMES = [
  'macd', 'rsi', 'stochrsi', 'wavetrend', 'dmi', 'mfi', 'smi', 'ao',
  'cci', 'wpr', 'di', 'cmf', 'ad', 'netvol', 'madr', 'alma', 'bb',
];

export function mapIndicatorData(computed: Record<string, unknown>, key: string): unknown | undefined {
  const map: Record<string, unknown> = {
    macd: computed.macd, rsi: computed.rsi, stochrsi: computed.stochrsi,
    wavetrend: computed.wavetrend, dmi: computed.dmi, mfi: computed.mfi,
    smi: computed.smi, ao: computed.ao, cci: computed.cci, wpr: computed.wpr,
    di: computed.di, cmf: computed.cmf, ad: computed.ad, netvol: computed.netvol,
    madr: computed.madr,
  };
  return map[key] ?? undefined;
}

// ========================================================================
// 16 TOOL (her biri try-catch + timeout ile zırhlanmış)
// ========================================================================

export const getTools = (userId?: string | null) => ({
  // --- 0. askClarification ---
  askClarification: tool({
    description: '[SYSTEM] Use this tool when you are missing required arguments to fulfill the user\'s request (like missing stock symbol, indicator name, or timeframe). It halts execution and renders a UI for the user to pick or type the missing information.',
    inputSchema: z.object({
      missingFields: z.array(z.string()).describe('List of missing fields (e.g. ["symbol", "indicator"])'),
      question: z.string().describe('A clear question to ask the user in Turkish (e.g. "Hangi hisseyi incelememi istersiniz?")'),
      options: z.array(z.string()).optional().describe('Optional quick-reply options as buttons (e.g. ["AAPL", "TSLA", "MSFT"])'),
    }),
    execute: async ({ missingFields, question, options }) => {
      // Returns immediately — no LLM generation, no delay.
      // The UI card (ClarificationForm) renders from this data.
      return {
        success: true,
        isClarification: true,
        missingFields,
        question,
        options: options || [],
      };
    },
  }),

  // --- 1. analyzeIndicators ---
  analyzeIndicators: tool({
    description: '[TA_TOOLS] Calculates current technical indicator values and BUY/SELL signals for a stock. STRICT BOUNDARY: ONLY use when user asks "what is the current RSI/MACD value?" or "what signal does X give now?". NEVER use when user asks about optimization, "best value", "win rate", "backtest", or "which parameter" — those belong to RESEARCH_TOOLS (runBacktest, optimizeParameter, findBestIndicator, rankIndicators). If unsure whether user wants current analysis or optimization, ASK the user to clarify.',
    inputSchema: z.object({
      symbol: requiredSymbol,
      interval: intervalSchema.describe('Time interval: 1d (daily) or 4h (4-hour)'),
      indicators: indicatorsListSchema.describe('List of indicators to calculate'),
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
    }),
    execute: async ({ symbol, interval, indicators, years }) => {
      try {
        const days = years * 365;
        const candles = await withTimeout(
          interval === '4h' ? get4HourCandles(symbol, days) : getDailyCandlesForAI(symbol, days),
          LIGHT_TIMEOUT_MS, `getCandles(${symbol})`
        );

        if (!candles || candles.length === 0) {
          return { success: false, error: `Insufficient candle data for ${symbol}. The symbol may be invalid or the data source is unavailable.` };
        }

        const mappedIndicators = indicators.map((s) => {
          const lower = s.trim().toLowerCase();
          if (lower === 'bollinger' || lower === 'bollinger bands') return 'bb';
          if (lower === 'stochastic') return 'stochrsi';
          return lower;
        });
        const activeSet = new Set(mappedIndicators);
        const computed = computeIndicators(candles, activeSet, DEFAULT_PARAMS);
        const { signals, overall } = generateAllSignals(computed, candles);

function getSignalDescription(indicator: string, signal: string): string {
  const isBuy = signal.includes('BUY');
  const isStrong = signal.includes('STRONG');
  const isNeutral = signal === 'NEUTRAL';
  if (isNeutral) return 'Nötr sinyal; belirgin bir trend gözlemlenmiyor.';
  
  switch(indicator.toLowerCase()) {
    case 'macd': return isBuy ? (isStrong ? 'Güçlü alım sinyali; MACD çizgisi sinyal çizgisini güçlü şekilde yukarı kesti.' : 'Hafif alım sinyali; kısa vadeli momentum toparlanıyor.') : (isStrong ? 'Güçlü satış sinyali; MACD çizgisi sinyal çizgisini sert şekilde aşağı kesti.' : 'Hafif satış sinyali; kısa vadeli momentum zayıflıyor.');
    case 'rsi': return isBuy ? (isStrong ? 'Aşırı satım bölgesinden dönüş; güçlü alım fırsatı.' : 'Hafif alım sinyali; momentum zayıf ancak yükseliş eğilimi sürüyor.') : (isStrong ? 'Aşırı alım bölgesinden dönüş; güçlü satış baskısı.' : 'Hafif satış sinyali; fiyat zirvelerden geriliyor.');
    case 'stochrsi': return isBuy ? (isStrong ? 'Güçlü alım sinyali; fiyatın aşırı satım bölgesinden çıkma ihtimali yüksek.' : 'Hafif alım sinyali; fiyatın aşırı satım bölgesine girme ihtimali düşük.') : (isStrong ? 'Güçlü satış sinyali; aşırı alım bölgesinden dönüş başladı.' : 'Hafif satış sinyali; kısa vadeli tepe oluşumu gözlemleniyor.');
    case 'bb': return isBuy ? 'Fiyat alt banda yaklaştı/değdi; tepki alımı gelebilir.' : 'Fiyat üst banda yaklaştı/değdi; dirençle karşılaşabilir.';
    default: return isBuy ? (isStrong ? 'Güçlü bir yükseliş trendi teyidi.' : 'Yükseliş yönünde ılımlı bir sinyal.') : (isStrong ? 'Güçlü bir düşüş trendi teyidi.' : 'Düşüş yönünde ılımlı bir sinyal.');
  }
}

function generateOverallEvaluation(signals: Array<{indicator: string, signal: string}>, overallSignal: string, overallScore: number): string {
  const buys = signals.filter(s => s.signal.includes('BUY')).map(s => s.indicator.toUpperCase());
  const sells = signals.filter(s => s.signal.includes('SELL')).map(s => s.indicator.toUpperCase());
  
  if (buys.length > sells.length) {
    if (overallSignal === 'STRONG BUY') {
      return `${buys.slice(0,2).join(' ve ')} güçlü bir yükseliş sinyali üretirken, diğer indikatörler bu hareketi destekliyor. Genel trend pozitif yönde.`;
    }
    return `${buys.slice(0,2).join(' ve ')} alım yönünde sinyaller üretiyor, ancak piyasada temkinli bir iyimserlik hakim. Trendin gücünü doğrulamak için hacim verilerine dikkat edilmeli.`;
  }
  
  if (sells.length > buys.length) {
    if (overallSignal === 'STRONG SELL') {
      return `${sells.slice(0,2).join(' ve ')} güçlü bir düşüş sinyali veriyor. Ayı piyasası baskısı belirginleşmiş durumda.`;
    }
    return `${sells.slice(0,2).join(' ve ')} satış yönünde sinyaller üretiyor. Trend zayıflığı gözlemleniyor, olası destek seviyeleri takip edilmeli.`;
  }
  
  return `İndikatörler arasında net bir uzlaşma bulunmuyor. Piyasa yatay veya kararsız bir seyir izliyor. İşlem yapmadan önce ek sinyallerin (hacim, formasyon) onaylanması önerilir.`;
}

        const summary = mappedIndicators.map((ind) => ({
          indicator: ind,
          signal: signals[ind] ?? 'NO DATA',
          description: signals[ind] ? getSignalDescription(ind, signals[ind]) : 'Yeterli hacim ve fiyat verisi bulunamadığı için hesaplanamadı.',
        }));

        const evaluationText = generateOverallEvaluation(summary, overall.label, overall.score);

        return {
          success: true, symbol, interval,
          indicators, // BUG FIX: Added missing indicators array
          candleCount: candles.length,
          overallSignal: overall.label,
          overallScore: Math.round(overall.score * 100) / 100,
          signals: summary,
          evaluationText,
        };
      } catch (e) {
        return toToolError(e, symbol);
      }
    },
  }),

  // --- 2. getCurrentPrice ---
  getCurrentPrice: tool({
    description: '[TA_TOOLS] Returns the current price and daily change percentage for a stock. Use for real-time price queries. NEVER use for historical data or analysis — use analyzeIndicators or runBacktest instead.',
    inputSchema: z.object({
      symbol: requiredSymbol,
    }),
    execute: async ({ symbol }) => {
      try {
        const { fetchJSON } = await import('@/lib/actions/finnhub.actions');
        const token = process.env.FINNHUB_API_KEY || '';
        if (!token) return { success: false, error: 'API key not configured' };
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const quote = await withTimeout(
          fetchJSON<{ c?: number; dp?: number }>(url, 120),
          LIGHT_TIMEOUT_MS, `getQuote(${symbol})`
        );
        if (!quote || typeof quote.c !== 'number') {
          return { success: false, error: `Could not retrieve price data for ${symbol}. The symbol may be invalid.` };
        }
        return { success: true, symbol, price: quote.c, changePercent: quote.dp ?? 0 };
      } catch (e) {
        return toToolError(e, symbol);
      }
    },
  }),

  // --- 3. searchStock ---
  searchStock: tool({
    description: 'Searches for a stock symbol or company name. Returns popular stocks if no query provided.',
    inputSchema: z.object({
      query: z.string().max(50).optional().describe('Symbol or company name to search'),
    }),
    execute: async ({ query }) => {
      try {
        const { searchStocks } = await import('@/lib/actions/finnhub.actions');
        const results = await withTimeout(
          searchStocks(query || undefined),
          LIGHT_TIMEOUT_MS, 'searchStocks'
        );
        return {
          success: true, count: results.length,
          results: results.slice(0, 10).map((s) => ({
            symbol: s.symbol, name: s.name ?? s.symbol, country: s.exchange ?? 'US', // BUG FIX: mapped exchange to country for UI card
          })),
        };
      } catch (e) {
        return toToolError(e);
      }
    },
  }),

  // --- 4. getWatchlist ---
  getWatchlist: tool({
    description: '[USER_TOOLS] Returns the user\'s watchlist stocks.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        if (!userId) return { success: false, error: 'Session not found. Please sign in.' };
        const items = await getCurrentUserWatchlist(userId);
        return {
          success: true, count: items.length,
          items: items.map((i) => ({
            symbol: i.symbol, company: i.company, addedAt: i.addedAt,
            price: i.priceFormatted ?? '?', change: i.changeFormatted ?? '?',
          })),
        };
      } catch (e) {
        return { success: false, error: `Watchlist fetch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 5. addToWatchlist ---
  addToWatchlist: tool({
    description: '[USER_TOOLS] Adds a stock to the watchlist. ONLY call if user EXPLICITLY said "add X to my watchlist" or "I want to track X".',
    inputSchema: z.object({
      symbol: requiredSymbol,
      company: z.string().min(1).max(200).describe('Company name'),
    }),
    execute: async ({ symbol, company }) => {
      try {
        await addToWatchlist(symbol, company, userId || undefined);
        return { success: true, symbol, message: `${symbol} added to watchlist` };
      } catch (e) {
        return { success: false, error: `Add to watchlist failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 6. removeFromWatchlist ---
  removeFromWatchlist: tool({
    description: '[USER_TOOLS] Removes a stock from the watchlist. ONLY if user explicitly asked to remove.',
    inputSchema: z.object({
      symbol: requiredSymbol,
    }),
    execute: async ({ symbol }) => {
      try {
        await removeFromWatchlist(symbol, userId || undefined);
        return { success: true, symbol, message: `${symbol} removed from watchlist` };
      } catch (e) {
        return { success: false, error: `Remove from watchlist failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 7. getMarketNews ---
  getMarketNews: tool({
    description: '[RESEARCH_TOOLS] Fetches stock-specific or general market news. Symbol is optional. Use when user asks about recent news, market updates, or company announcements.',
    inputSchema: z.object({
      symbol: stockSymbolSchema.optional().describe('Stock symbol (leave empty for general market news)'),
    }),
    execute: async ({ symbol }) => {
      try {
        const articles = await withTimeout(
          symbol ? getNews([symbol]) : getNews(),
          LIGHT_TIMEOUT_MS, `getNews(${symbol || 'general'})`
        );
        return {
          success: true, count: articles.length,
          articles: articles.slice(0, 5).map((a) => ({
            headline: a.headline, summary: a.summary?.slice(0, 200) ?? '',
            source: a.source, url: a.url, datetime: a.datetime, // BUG FIX: Added missing datetime
          })),
        };
      } catch (e) {
        return { success: false, error: `News fetch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 8. createPriceAlert ---
  createPriceAlert: tool({
    description: '[USER_TOOLS] Creates a price alert for a stock. ONLY call if user EXPLICITLY asked to set an alert ("alert me when...", "notify me if...").',
    inputSchema: z.object({
      symbol: requiredSymbol,
      company: z.string().min(1).max(200).describe('Company name'),
      alertName: z.string().min(1).max(100).describe('Alert name'),
      alertType: z.enum(['upper', 'lower']).describe('upper: notify when price goes above threshold, lower: notify when below'),
      threshold: z.number().positive('Threshold must be positive').describe('Target price'),
    }),
    execute: async ({ symbol, company, alertName, alertType, threshold }) => {
      const result = await createAlert({ symbol, company, alertName, alertType, threshold, overrideUserId: userId || undefined });
      if (!result.success) return result;
      return { success: true, symbol, alertType, threshold, message: `${symbol} ${alertType === 'upper' ? 'upper' : 'lower'} alert at $${threshold} created` };
    },
  }),

  // --- 9. deletePriceAlert ---
  deletePriceAlert: tool({
    description: '[USER_TOOLS] Deletes a price alert. ONLY if user explicitly asked to remove/delete an alert.',
    inputSchema: z.object({
      symbol: requiredSymbol,
    }),
    execute: async ({ symbol }) => {
      const result = await deleteAlert(symbol, userId || undefined);
      if (!result.success) return result;
      if (result.deletedCount === 0) {
        return { success: false, error: `No active alert found for ${symbol}` };
      }
      return { success: true, symbol, message: `${symbol} alert deleted` };
    },
  }),

  // --- 10. getUserAlerts ---
  getUserAlerts: tool({
    description: "Lists the user's active price alerts.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const alerts = await getUserAlerts(userId || undefined);
        return {
          success: true, count: alerts.length,
          alerts: alerts.map((a: any) => ({
            id: a.id, symbol: a.symbol, company: a.company,
            alertName: a.alertName, alertType: a.alertType, threshold: a.threshold,
            active: a.active ?? true, // BUG FIX: Added missing active status
          })),
        };
      } catch (e) {
        return { success: false, error: `Alert list failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 11. runBacktest ---
  runBacktest: tool({
    description: '[RESEARCH_TOOLS] Runs backtest for ONE indicator on a stock and returns win rate. STRICT BOUNDARY: Use when user asks "how accurate is RSI on AAPL?" or "test MACD performance". NEVER use for: (a) finding the BEST parameter value → use optimizeParameter, (b) comparing/ranking multiple indicators → use rankIndicators, (c) current signal → use analyzeIndicators [TA_TOOLS].',
    inputSchema: z.object({
      symbol: requiredSymbol,
      indicator: z.string().min(1).describe('Indicator name (e.g. RSI, MACD, MFI). If user did not specify, DO NOT call — ask first.'),
      interval: intervalSchema,
      lookForward: z.number().min(1).max(20).default(5).describe('How many bars to look forward for win/loss check'),
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
    }),
    execute: async ({ symbol, indicator, interval, lookForward, years }) => {
      try {
        const days = years * 365;
        const candles: Candle[] = await withTimeout(
          interval === '4h' ? get4HourCandles(symbol, days) : getDailyCandlesForAI(symbol, days),
          LIGHT_TIMEOUT_MS, `getCandles(${symbol})`
        );

        if (!candles || candles.length === 0) {
          return { success: false, error: `Insufficient candle data for ${symbol}` };
        }

        const key = indicator.toLowerCase();
        const activeSet = new Set([key]);
        const computed = computeIndicators(candles as any, activeSet, DEFAULT_PARAMS);
        const data = mapIndicatorData(computed, key);

        if (!data) return { success: false, error: `${indicator} is not supported for backtesting` };

        await yieldToMain();
        const result = withTimeout(
          Promise.resolve(calculateWinRate(indicator.toUpperCase(), candles, data, { lookForward })),
          HEAVY_TIMEOUT_MS, `backtest(${indicator}, ${symbol})`
        ).then(r => r).catch(e => { throw e; });
        const r = await result;

        return {
          success: true, symbol, indicator, interval, lookForward,
          winRate: Math.round(r.winRate * 100) / 100,
          totalSignals: r.totalSignals, wins: r.wins,
        };
      } catch (e) {
        return { success: false, error: `Backtest failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 12. optimizeParameter ---
  optimizeParameter: tool({
    description: '[RESEARCH_TOOLS] Brute-force optimizes a SINGLE indicator parameter to find the value with highest backtest win rate. Runs as background job with live progress. STRICT BOUNDARY: ONLY use when user asks about ONE specific indicator\'s best parameter ("best RSI period", "optimal MACD fast length"). NEVER use for: (a) current signal analysis → use analyzeIndicators [TA_TOOLS], (b) comparing multiple indicators → use rankIndicators [RESEARCH_TOOLS], (c) finding overall best indicator → use findBestIndicator [RESEARCH_TOOLS], (d) simple backtest without optimization → use runBacktest [RESEARCH_TOOLS].',
    inputSchema: z.object({
      symbol: requiredSymbol,
      indicator: z.string().min(1).describe('Indicator name (e.g. RSI, MACD). If user did not specify, DO NOT call — ask first.'),
      interval: intervalSchema,
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
    }),
    execute: async ({ symbol, indicator, interval, years }) => {
      try {
        const name = indicator.toUpperCase();
        if (!OPTIMIZABLE_INDICATORS[name]) {
          return { success: false, error: `${indicator} is not an optimizable indicator. Available: ${Object.keys(OPTIMIZABLE_INDICATORS).join(', ')}` };
        }

        const jobId = randomUUID();

        await inngest.send({
          name: 'ai/optimize-parameter',
          data: { jobId, symbol, indicator: name, interval, years, userId },
        });

        console.log("🛠️ [DEBUG - SUNUCU] Tool çalıştı. Inngest'e atılan jobId:", jobId);

        return {
          success: true,
          isBackgroundJob: true,
          jobId,
          symbol,
          indicator: name,
          interval,
          message: `${symbol} için ${name} optimizasyonunu arka planda başlattım. İşlem yaklaşık 30-45 saniye sürecek.`,
        };

        // ---- Ağır hesaplama (Inngest'e taşındı, şimdilik yorumda) ----
        // const candles: Candle[] = await withTimeout(
        //   interval === '4h' ? get4HourCandles(symbol, 3650) : getDailyCandles(symbol, 3650),
        //   LIGHT_TIMEOUT_MS, `getCandles(${symbol})`
        // );
        // if (!candles || candles.length === 0) { ... }
        // await yieldToMain();
        // const result = await withTimeout(
        //   Promise.resolve(findBestParameter(name, candles)),
        //   HEAVY_TIMEOUT_MS, `optimize(${indicator}, ${symbol})`
        // );
        // const paramName = OPTIMIZABLE_INDICATORS[name]?.param ?? '?';
        // return { success: true, symbol, indicator: name, bestValue: result.bestVal, ... };
      } catch (e) {
        return { success: false, error: `Optimization dispatch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 12.5. batchOptimizeParameter ---
  batchOptimizeParameter: tool({
    description: '[RESEARCH_TOOLS] Brute-force optimizes a SINGLE indicator parameter for MULTIPLE stocks in parallel. STRICT BOUNDARY: Use ONLY when user asks to optimize an indicator for multiple stocks at once (e.g., "AAPL, MSFT ve TSLA için RSI optimizasyonu yap" or "top 5 tech stocks").',
    inputSchema: z.object({
      symbols: z.array(requiredSymbol).min(1).max(10).describe('Array of stock symbols to analyze (max 10)'),
      indicator: z.string().min(1).describe('Indicator name (e.g. RSI, MACD).'),
      interval: intervalSchema,
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
    }),
    execute: async ({ symbols, indicator, interval, years }) => {
      try {
        const name = indicator.toUpperCase();
        if (!OPTIMIZABLE_INDICATORS[name]) {
          return { success: false, error: `${indicator} is not an optimizable indicator. Available: ${Object.keys(OPTIMIZABLE_INDICATORS).join(', ')}` };
        }

        if (!userId) return { success: false, error: 'Unauthorized: You must be logged in to run background tasks.' };

        const batchId = randomUUID();
        const jobIds: string[] = [];

        const events = symbols.map((symbol) => {
          const jobId = randomUUID();
          jobIds.push(jobId);
          return {
            name: 'ai/optimize-parameter' as const,
            data: { jobId, batchId, symbol: symbol.toUpperCase(), indicator: name, interval, years, userId },
          };
        });

        await inngest.send(events);

        return {
          success: true,
          isBackgroundJob: true,
          isBatchJob: true,
          jobIds,
          symbols,
          indicator: name,
          interval,
          message: `${symbols.length} adet hisse (${symbols.join(', ')}) için ${name} optimizasyonunu arka planda başlattım. Görev Yöneticisi'nden takip edebilirsiniz.`,
        };
      } catch (e) {
        return { success: false, error: `Batch optimization dispatch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 13. rankIndicators ---
  rankIndicators: tool({
    description: '[RESEARCH_TOOLS] Backtests MULTIPLE indicators on a stock and ranks them by win rate. STRICT BOUNDARY: Use when user asks "which indicators work best on AAPL?" or "rank all indicators for TSLA". NEVER use for: (a) single indicator optimization → use optimizeParameter, (b) single indicator backtest → use runBacktest, (c) current signals → use analyzeIndicators [TA_TOOLS].',
    inputSchema: z.object({
      symbol: requiredSymbol,
      interval: intervalSchema,
      indicators: indicatorsListSchema.optional().describe('Specific indicators to rank (leave empty for all)'),
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data to use'),
      topN: z.number().min(1).max(15).default(5).describe('Number of top results to return'),
    }),
    execute: async ({ symbol, interval, indicators, topN, years }) => {
      try {
        const jobId = randomUUID();

        await inngest.send({
          name: 'ai/rank-indicators',
          data: { jobId, symbol, interval, indicators, topN, years, isSingle: false, userId },
        });

        return {
          success: true,
          isBackgroundJob: true,
          jobId,
          symbol,
          interval,
          indicator: 'RANK',
          message: `${symbol} için indikatör sıralama işlemini ${years} yıllık veriyle arka planda başlattım.`,
        };
      } catch (e) {
        return { success: false, error: `Indicator ranking dispatch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 14. findBestIndicator ---
  findBestIndicator: tool({
    description: '[RESEARCH_TOOLS] Finds the TOP-N indicators with highest win rate for a stock. STRICT BOUNDARY: Use when user asks "what is the best indicator for AAPL?" or "top 3 indicators for TSLA". NEVER use for: (a) single indicator optimization → use optimizeParameter, (b) single indicator test → use runBacktest, (c) current signals → use analyzeIndicators [TA_TOOLS].',
    inputSchema: z.object({
      symbol: requiredSymbol,
      interval: intervalSchema,
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data to use'),
      topN: z.number().min(1).max(15).default(3).describe('Number of top results to return'),
    }),
    execute: async ({ symbol, interval, topN, years }) => {
      try {
        const jobId = randomUUID();

        await inngest.send({
          name: 'ai/rank-indicators',
          data: { jobId, symbol, interval, topN, years, isSingle: true, userId },
        });

        return {
          success: true,
          isBackgroundJob: true,
          jobId,
          symbol,
          interval,
          indicator: 'FIND_BEST',
          message: `${symbol} için en iyi indikatör taramasını ${years} yıllık veriyle arka planda başlattım.`,
        };
      } catch (e) {
        return { success: false, error: `Best indicator search dispatch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 15. createSmartAlert ---
  createSmartAlert: tool({
    description: 'Creates a smart strategy alert with indicator conditions. ONLY call if user specified symbol and conditions.',
    inputSchema: z.object({
      name: z.string().min(1).max(100).describe('Alert name'),
      symbol: requiredSymbol,
      interval: intervalSchema,
      frequency: z.enum(['daily', '4h', '1h']).default('daily').describe('Check frequency'),
      conditions: z.array(z.object({
        indicator: z.string().min(1).describe('Indicator name (rsi, macd, mfi, cci, wpr, ao, dmi, wavetrend, stochrsi)'),
        operator: z.enum(['<', '>', 'cross_above', 'cross_below']).describe('Condition operator'),
        value: z.number().describe('Threshold value'),
      })).min(1).max(5).describe('List of conditions (all must be met simultaneously)'),
    }),
    execute: async ({ name, symbol, interval, frequency, conditions }) => {
      const result = await createSmartAlertAction({ name, symbol, interval, frequency, conditions, overrideUserId: userId || undefined });
      if (!result.success) return result;
      return { success: true, symbol, name, message: `Smart alert "${name}" created for ${symbol}` };
    },
  }),

  // --- 16. getSmartAlerts ---
  getSmartAlerts: tool({
    description: "Lists the user's active smart strategy alerts.",
    inputSchema: z.object({
      symbol: stockSymbolSchema.optional().describe('Filter by symbol (optional)'),
    }),
    execute: async ({ symbol }) => {
      const result = await getSmartAlertsAction(symbol, userId || undefined);
      if (!result.success) return result;
      return { success: true, alerts: result.alerts, count: result.alerts?.length ?? 0 };
    },
  }),
});
