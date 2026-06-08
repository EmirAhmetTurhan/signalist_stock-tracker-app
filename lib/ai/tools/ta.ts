// lib/ai/tools/ta.ts — TA category tools: analyze, price, search
import { tool } from 'ai';
import { z } from 'zod';
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';
import { stockSymbolSchema } from '@/lib/validations/schemas';
import { computeIndicators } from '@/lib/ta/compute';
import { generateAllSignals } from '@/lib/ta/signals';
import { DEFAULT_PARAMS } from '@/lib/constants/indicators';
import {
  LIGHT_TIMEOUT_MS, withTimeout,
  toToolError, getSignalDescription, generateOverallEvaluation,
} from './helpers';

const intervalSchema = z.enum(['1d', '4h']).default('1d').describe('1d=daily, 4h=4-hour');
const requiredSymbol = stockSymbolSchema.describe(
  'REQUIRED: Stock symbol (e.g. AAPL, TSLA). If user did not provide a symbol, DO NOT call this tool — first ask the user which stock they want to analyze.'
);

export function createTATools(_userId?: string | null) {
  return {
    analyzeIndicators: tool({
      description: '[TA_TOOLS] Calculates current technical indicator values and BUY/SELL signals for a stock. STRICT BOUNDARY: ONLY use when user asks "what is the current RSI/MACD value?" or "what signal does X give now?". NEVER use when user asks about optimization, "best value", "win rate", "backtest", or "which parameter" — those belong to RESEARCH_TOOLS (runBacktest, optimizeParameter, findBestIndicator, rankIndicators). If unsure whether user wants current analysis or optimization, ASK the user to clarify.',
      inputSchema: z.object({
        symbol: requiredSymbol,
        interval: intervalSchema,
        indicators: z.array(z.string()).min(1).max(17).describe('List of indicators to calculate'),
        years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
      }),
      execute: async ({ symbol, interval, indicators, years }) => {
        try {
          const days = Math.min(years * 365, 3650);
          const candles = await withTimeout(
            getCandlesForInterval(symbol, interval, days),
            LIGHT_TIMEOUT_MS, `getCandles(${symbol})`
          );
          if (!candles || candles.length === 0) {
            return { success: false, error: `Insufficient candle data for ${symbol}.` };
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
          const summary = mappedIndicators.map((ind) => ({
            indicator: ind,
            signal: signals[ind] ?? 'NO DATA',
            description: signals[ind] ? getSignalDescription(ind, signals[ind]) : 'Yeterli hacim ve fiyat verisi bulunamadığı için hesaplanamadı.',
          }));
          const evaluationText = generateOverallEvaluation(summary, overall.label, overall.score);
          return {
            success: true, symbol, interval, indicators: mappedIndicators,
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

    getCurrentPrice: tool({
      description: '[TA_TOOLS] Returns the current price and daily change percentage for a stock. Use for real-time price queries.',
      inputSchema: z.object({ symbol: requiredSymbol }),
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
            return { success: false, error: `Could not retrieve price data for ${symbol}.` };
          }
          return { success: true, symbol, price: quote.c, changePercent: quote.dp ?? 0 };
        } catch (e) {
          return toToolError(e, symbol);
        }
      },
    }),

    searchStock: tool({
      description: 'Searches for a stock symbol or company name. Returns popular stocks if no query provided.',
      inputSchema: z.object({ query: z.string().max(50).optional().describe('Symbol or company name to search') }),
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
              symbol: s.symbol, name: s.name ?? s.symbol, country: s.exchange ?? 'US',
            })),
          };
        } catch (e) {
          return toToolError(e);
        }
      },
    }),
  };
}
