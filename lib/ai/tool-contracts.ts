// lib/ai/tool-contracts.ts — Strict Zod schemas defining exactly what tools output
// The UI components depend on these schemas to render correctly.

import { z } from 'zod';

export const AnalyzeIndicatorsOutput = z.object({
  success: z.boolean(),
  symbol: z.string(),
  interval: z.string(),
  indicators: z.array(z.string()),
  candleCount: z.number(),
  overallSignal: z.string(),
  overallScore: z.number(),
  signals: z.array(z.object({
    indicator: z.string(),
    signal: z.string(),
  })),
});

export const SearchStockOutput = z.object({
  success: z.boolean(),
  count: z.number(),
  results: z.array(z.object({
    symbol: z.string(),
    name: z.string(),
    country: z.string(),
  })),
});

export const MarketNewsOutput = z.object({
  success: z.boolean(),
  count: z.number(),
  articles: z.array(z.object({
    headline: z.string(),
    summary: z.string(),
    source: z.string(),
    url: z.string(),
    datetime: z.number().optional(),
  })),
});

export const AlertListOutput = z.object({
  success: z.boolean(),
  count: z.number(),
  alerts: z.array(z.object({
    id: z.string(),
    symbol: z.string(),
    company: z.string().optional(),
    alertName: z.string(),
    alertType: z.string(),
    threshold: z.number().optional(),
    active: z.boolean(),
  })),
});

export const BackgroundJobOutput = z.object({
  success: z.boolean(),
  isBackgroundJob: z.boolean().optional(),
  jobId: z.string().optional(),
  jobIds: z.array(z.string()).optional(),
  isBatchJob: z.boolean().optional(),
  symbol: z.string().optional(),
  symbols: z.array(z.string()).optional(),
  indicator: z.string().optional(),
  message: z.string(),
});
