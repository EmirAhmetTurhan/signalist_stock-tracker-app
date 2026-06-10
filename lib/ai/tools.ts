// lib/ai/tools.ts — AI Agent tools (20 tools)
// Shared helpers imported from ./tools/helpers.ts

import { tool } from 'ai';
import { z } from 'zod';
import {
  yieldToMain, HEAVY_TIMEOUT_MS, LIGHT_TIMEOUT_MS,
  withTimeout, formatError, toToolError, safeResult,
  mapIndicatorData, getSignalDescription, generateOverallEvaluation,
} from './tools/helpers';
import type { ToolResult } from './tools/helpers';
// Re-export for backward compat (used by lib/inngest/functions.ts)
export { mapIndicatorData } from './tools/helpers';
import { getDailyCandlesForAI, getDailyCandles, get4HourCandles, getNews } from '@/lib/actions/finnhub.actions';
import { getCurrentUserWatchlist, addToWatchlist, removeFromWatchlist } from '@/lib/actions/watchlist.actions';
import { createAlert, deleteAlert, getUserAlerts } from '@/lib/actions/alerts.actions';
import { createSmartAlert as createSmartAlertAction, getSmartAlerts as getSmartAlertsAction } from '@/lib/actions/smart-alerts.actions';
import { createForwardTest, changeForwardTestStatus } from '@/lib/actions/forward-test.actions';
import { getPortfolioData, getOpenPositions } from '@/lib/actions/trade.actions';
import { generateTradeToken } from '@/lib/ai/token-security';
import { computeIndicators } from '@/lib/ta/compute';
import { generateAllSignals } from '@/lib/ta/signals';
import { calculateWinRate } from '@/lib/ta/simulation/backtest';
import { findBestParameter, OPTIMIZABLE_INDICATORS } from '@/lib/ta/optimizer';
import { optimizeStrategyParams, discoverStrategy, mapComputedToAllData, DISCOVERY_POOL } from '@/lib/ta/strategy-optimizer';
import { randomUUID } from 'crypto';
import { inngest } from '@/lib/inngest/client';
import { stockSymbolSchema } from '@/lib/validations/schemas';
import type { Candle } from '@/lib/ta/simulation/backtest';

import { INDICATOR_KEYS, DEFAULT_PARAMS } from '@/lib/constants/indicators';
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';

const intervalSchema = z.enum(['1d', '4h']).default('1d').describe('1d=daily, 4h=4-hour');
const indicatorsListSchema = z.array(z.string()).min(1).max(17);

const requiredSymbol = stockSymbolSchema.describe(
  'REQUIRED: Stock symbol (e.g. AAPL, TSLA). If user did not provide a symbol, DO NOT call this tool — first ask the user which stock they want to analyze.'
);

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
      interval: intervalSchema,
      indicators: indicatorsListSchema.describe('List of indicators to calculate'),
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data (default 1)'),
    }),
    execute: async ({ symbol, interval, indicators, years }) => {
      try {
        // SPRINT 3: inline clamp (timeframe-limits.ts silindi, sadece 4h/1d — 10 yıl cap)
        const days = Math.min(years * 365, 3650);
        const candles = await withTimeout(
          getCandlesForInterval(symbol, interval, days),
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
        // SPRINT 3: inline clamp
        const days = Math.min(years * 365, 3650);
        const candles: Candle[] = await withTimeout(
          getCandlesForInterval(symbol, interval, days),
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

        return {
          success: true,
          isBackgroundJob: true,
          jobId,
          symbol,
          indicator: name,
          interval,
          message: `${symbol} için ${name} optimizasyonunu arka planda başlattım. İşlem yaklaşık 30-45 saniye sürecek.`,
        };

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
      frequency: z.enum(['daily', '4h']).default('daily').describe('Check frequency'),
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

  // --- 17. startForwardTest ---
  startForwardTest: tool({
    description: '[RESEARCH_TOOLS] Starts a Forward Test (Shadow Mode or Auto Execution) for a specific strategy on a symbol. Use when user asks to "forward test this", "paper trade this strategy automatically", or "start a shadow test".',
    inputSchema: z.object({
      name: z.string().min(1).describe('Name of the strategy/test'),
      symbol: requiredSymbol,
      interval: intervalSchema,
      indicators: indicatorsListSchema.describe('List of indicators required for this strategy'),
      entryRule: z.any().describe('JSON object representing the entry rule composite (logic AND/OR)'),
      exitRule: z.any().describe('JSON object representing the exit rule composite (logic AND/OR)'),
      positionSizingMode: z.enum(['fixed_cash', 'percent_portfolio', 'fixed_shares']).default('fixed_cash'),
      positionSizingValue: z.number().default(1000).describe('Amount or percentage'),
      executionMode: z.enum(['shadow', 'auto', 'propose_only']).default('shadow'),
      capitalAllocated: z.number().default(10000).describe('Theoretical capital for shadow mode'),
    }),
    execute: async ({ name, symbol, interval, indicators, entryRule, exitRule, positionSizingMode, positionSizingValue, executionMode, capitalAllocated }) => {
      try {
        if (!userId) return { success: false, error: 'Oturum bulunamadı.' };

        const result = await createForwardTest({
          userId,
          name,
          symbol,
          interval,
          indicatorConfig: { activeIndicators: indicators, params: DEFAULT_PARAMS },
          entryRule,
          exitRule,
          positionSizing: { mode: positionSizingMode, value: positionSizingValue },
          executionMode,
          capitalAllocated,
        });

        if (!result.success) return result;
        return { success: true, symbol, name, executionMode, message: `Forward Test "${name}" started for ${symbol} in ${executionMode} mode.` };
      } catch (e) {
        return { success: false, error: `Failed to start forward test: ${formatError(e)}` };
      }
    },
  }),

  // --- 18. getPortfolioStatus ---
  getPortfolioStatus: tool({
    description: '[PORTFOLIO_TOOLS] Returns the user\'s current portfolio balance, equity, and a list of all open positions. STRICT BOUNDARY: ONLY use when the user asks "what stocks do I own?", "show my portfolio", or "what is my balance?". NEVER hallucinate holdings.',
    inputSchema: z.object({}),
    execute: async () => {
      try {
        if (!userId) return { success: false, error: 'Unauthorized: You must be logged in to view your portfolio.' };

        const summaryRes = await getPortfolioData(userId);
        const positionsRes = await getOpenPositions(userId);

        if (!summaryRes.success || !positionsRes.success) {
          return { success: false, error: 'Failed to fetch portfolio data.' };
        }

        return {
          success: true,
          summary: summaryRes.data,
          positions: positionsRes.positions,
        };
      } catch (e) {
        return { success: false, error: `Portfolio fetch failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 19. proposeTrade ---
  proposeTrade: tool({
    description: '[PORTFOLIO_TOOLS] Generates a secure trade proposal for the user to confirm. STRICT BOUNDARY: Use ONLY when the user explicitly asks you to buy or sell a stock (e.g. "Buy 10 shares of AAPL"). You CANNOT execute trades directly. This tool will present a confirmation card to the user.',
    inputSchema: z.object({
      symbol: requiredSymbol,
      side: z.enum(['BUY', 'SELL']).describe('Trade direction'),
      quantity: z.number().int().positive().describe('Number of shares to trade'),
    }),
    execute: async ({ symbol, side, quantity }) => {
      try {
        if (!userId) return { success: false, error: 'Unauthorized: You must be logged in to trade.' };

        // Get current price for UI display and slippage estimation
        const { fetchJSON } = await import('@/lib/actions/finnhub.actions');
        const token = process.env.FINNHUB_API_KEY || '';
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;

        let currentPrice = 0;
        if (token) {
          const quote = await fetchJSON<{ c?: number }>(url, 120);
          if (quote && quote.c) currentPrice = quote.c;
        }

        const messageId = randomUUID(); // Link token to this specific AI response
        const nonce = randomUUID();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiration

        const tradeToken = generateTradeToken({
          userId,
          symbol,
          side,
          quantity,
          expiresAt,
          nonce,
          messageId,
        });

        return {
          success: true,
          symbol,
          side,
          quantity,
          currentPrice,
          tradeToken, // Used by the frontend to confirm
          messageId,
        };
      } catch (e) {
        return { success: false, error: `Failed to generate trade proposal: ${formatError(e)}` };
      }
    },
  }),

  // --- 20. stopForwardTest ---
  stopForwardTest: tool({
    description: '[PORTFOLIO_TOOLS] Pauses or stops an active strategy forward test. Use when user says "Stop trading AAPL" or "Pause my MACD strategy".',
    inputSchema: z.object({
      strategyId: z.string().describe('The ID of the strategy to stop. If you do not know the ID, you must ask the user or check active strategies.'),
    }),
    execute: async ({ strategyId }) => {
      try {
        if (!userId) return { success: false, error: 'Unauthorized.' };
        const result = await changeForwardTestStatus(userId, strategyId, 'paused');
        if (!result.success) return result;
        return { success: true, strategyId, message: 'Strategy has been successfully paused.' };
      } catch (e) {
        return { success: false, error: `Failed to stop strategy: ${formatError(e)}` };
      }
    },
  }),

  // --- 21. optimizeStrategyParams ---
  optimizeStrategyParams: tool({
    description: '[RESEARCH_TOOLS] Optimizes MULTIPLE indicator parameters in a strategy to find the combination with highest backtest win rate. Tests lookForward (5-30) and each indicator\'s primary parameter sequentially. Use when user asks "what are the best params for my RSI+CCI+MACD strategy?" or "optimize my strategy parameters". Requires specific indicator names.',
    inputSchema: z.object({
      symbol: requiredSymbol,
      interval: intervalSchema,
      indicators: z.array(z.string().min(1)).min(1).max(12).describe('List of indicator keys to optimize in the strategy (e.g. ["rsi", "macd", "cci"])'),
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data to use'),
    }),
    execute: async ({ symbol, interval, indicators, years }) => {
      try {
        // SPRINT 3: inline clamp
        const days = Math.min(years * 365, 3650);
        const { getCandlesForInterval } = await import('@/lib/actions/finnhub.actions');
        const candles: Candle[] = await withTimeout(
          getCandlesForInterval(symbol, interval, days),
          LIGHT_TIMEOUT_MS, `getCandles(${symbol})`
        );

        if (!candles || candles.length === 0) {
          return { success: false, error: `Insufficient candle data for ${symbol}` };
        }

        // Compute ALL indicators (needed by strategy optimizer)
        const activeSet = new Set([
          'rsi', 'cci', 'wavetrend', 'macd', 'stochrsi', 'dmi', 'mfi', 'smi',
          'ao', 'wpr', 'di', 'cmf', 'ad', 'netvol', 'madr', 'alma', 'bb'
        ]);
        const computed = computeIndicators(candles as any, activeSet, DEFAULT_PARAMS);
        const allData = mapComputedToAllData(computed);

        await yieldToMain();

        const result = withTimeout(
          Promise.resolve(optimizeStrategyParams(candles, allData, {
            indicators,
            lookForwardRange: [5, 30],
            convergenceRounds: 1,
            interval,
            mode: 'all',
          })),
          HEAVY_TIMEOUT_MS, `optimizeStrategyParams(${symbol})`
        );

        const r = await result;

        return {
          success: true,
          symbol,
          interval,
          bestParams: r.bestParams,
          bestWinRate: Math.round(r.bestWinRate * 100) / 100,
          iterations: r.iterations,
          roundResults: r.roundResults,
        };
      } catch (e) {
        return { success: false, error: `Strategy parameter optimization failed: ${formatError(e)}` };
      }
    },
  }),

  // --- 22. discoverBestStrategy ---
  discoverBestStrategy: tool({
    description: '[RESEARCH_TOOLS] Runs the Deep Discovery Engine (5-phase pipeline: Exhaustive Search → Surrogate Optimization → Diversity Ranking → Cross-Validation) to find the best performing indicator combinations for a stock. Tests ALL combinations of 17 indicators using parallel worker threads, surrogate-optimizes parameters, diversity-ranks, and cross-validates. Results auto-save to Archive. Use when user asks "find the best strategy for AAPL", "discover optimal indicators for TSLA", or "what combination of indicators works best?".',
    inputSchema: z.object({
      symbol: requiredSymbol,
      interval: intervalSchema,
      years: z.number().min(1).max(10).default(1).describe('Number of years of historical data to use (1-10, based on available data for interval)'),
    }),
    execute: async ({ symbol, interval, years }) => {
      try {
        if (!userId) return { success: false, error: 'Unauthorized: You must be logged in to run discovery.' };

        const jobId = randomUUID();

        await inngest.send({
          name: 'discovery/deep-search.started',
          data: {
            jobId,
            symbol,
            interval,
            years,
            userId,
          },
        });

        return {
          success: true,
          isBackgroundJob: true,
          jobId,
          symbol,
          interval,
          message: `Deep Discovery Engine started for ${symbol} (${years} years, 5-phase pipeline). Results will auto-save to the Archive.`,
        };
      } catch (e) {
        return { success: false, error: `Strategy discovery dispatch failed: ${formatError(e)}` };
      }
    },
  }),
});
