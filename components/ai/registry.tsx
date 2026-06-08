// components/ai/registry.tsx — Global Component Registry
// Her toolName -> React Component eslemesi. Yeni tool eklemek 1 satir.

import type { ComponentType } from 'react';
import type { z } from 'zod';
import ActionConfirmCard from './ActionConfirmCard';
import PriceSnapshotCard from './PriceSnapshotCard';
import IndicatorSignalsCard from './IndicatorSignalsCard';
import SearchResultsCard from './SearchResultsCard';
import BacktestResultCard from './BacktestResultCard';
import NewsListCard from './NewsListCard';
import WatchlistSummaryCard from './WatchlistSummaryCard';
import AlertListCard from './AlertListCard';
import IndicatorRankingCard from './IndicatorRankingCard';
import ClarificationForm from './ClarificationForm';
import PortfolioStatusCard from './PortfolioStatusCard';
import TradeConfirmationCard from './TradeConfirmationCard';

import {
  AnalyzeIndicatorsOutput,
  SearchStockOutput,
  MarketNewsOutput,
  AlertListOutput,
  BackgroundJobOutput
} from '@/lib/ai/tool-contracts';

// --- Wrapper for ClarificationForm ---
function ClarificationCard({ data, onFollowUp, isLast }: ToolCardProps) {
  const question = (data.question as string) || "Please specify the missing information:";
  const options = (data.options as string[]) || [];

  if (!isLast) {
    return null;
  }

  return (
    <ClarificationForm
      question={question}
      options={options}
      onFollowUp={onFollowUp}
    />
  );
}

export interface ToolCardProps {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
  messageParts?: any[];
  isLast?: boolean;
  onRunBacktest?: (symbol: string, indicator: string) => void;
  onFollowUp?: (text: string) => void;
}

interface ToolCardConfig {
  component: ComponentType<ToolCardProps> | null;
  outputSchema?: z.ZodTypeAny;
  dataKey?: string | null;
  emptyMessage?: string;
}

// Tek noktadan yonetim: toolName -> Kart Bileseni + Output Schema (Type Contract)
export const TOOL_COMPONENT_MAP: Record<string, ToolCardConfig> = {
  askClarification:     { component: ClarificationCard,     dataKey: null },
  analyzeIndicators:    { component: IndicatorSignalsCard,  outputSchema: AnalyzeIndicatorsOutput, dataKey: 'signals' },
  getCurrentPrice:      { component: PriceSnapshotCard,     dataKey: null },
  searchStock:          { component: SearchResultsCard,     outputSchema: SearchStockOutput, dataKey: 'results' },
  getWatchlist:         { component: WatchlistSummaryCard,  dataKey: 'items', emptyMessage: 'Your watchlist is empty.' },
  addToWatchlist:       { component: ActionConfirmCard,     dataKey: null },
  removeFromWatchlist:  { component: ActionConfirmCard,     dataKey: null },
  getMarketNews:        { component: NewsListCard,          outputSchema: MarketNewsOutput, dataKey: 'articles' },
  createPriceAlert:     { component: ActionConfirmCard,     dataKey: null },
  deletePriceAlert:     { component: ActionConfirmCard,     dataKey: null },
  getUserAlerts:        { component: AlertListCard,         outputSchema: AlertListOutput, dataKey: 'alerts', emptyMessage: 'No active alerts.' },
  runBacktest:          { component: BacktestResultCard,    dataKey: null },
  // optimizeParameter ve türevleri özel arka plan isleridir
  optimizeParameter:      { component: null, outputSchema: BackgroundJobOutput },
  batchOptimizeParameter: { component: null, outputSchema: BackgroundJobOutput },
  rankIndicators:         { component: IndicatorRankingCard, dataKey: 'ranked' },
  findBestIndicator:      { component: IndicatorRankingCard, dataKey: 'best' },
  createSmartAlert:     { component: ActionConfirmCard,     dataKey: null },
  getSmartAlerts:       { component: AlertListCard,         outputSchema: AlertListOutput, dataKey: 'alerts' },
  getPortfolioStatus:   { component: PortfolioStatusCard,   dataKey: null },
  proposeTrade:         { component: TradeConfirmationCard, dataKey: null },
  stopForwardTest:      { component: ActionConfirmCard,     dataKey: null },
};

// Registry'de olmayan bir tool icin fallback: null doner
export function getToolCard(toolName: string): ToolCardConfig | null {
  return TOOL_COMPONENT_MAP[toolName] || null;
}
