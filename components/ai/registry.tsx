// components/ai/registry.tsx — Global Component Registry
// Her toolName -> React Component eslemesi. Yeni tool eklemek 1 satir.

import type { ComponentType } from 'react';
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

// --- Wrapper for ClarificationForm ---
function ClarificationCard({ data, onFollowUp, isLast }: ToolCardProps) {
  const question = (data.question as string) || "Lütfen eksik bilgiyi belirtin:";
  const options = (data.options as string[]) || [];

  // If the conversation has progressed beyond this clarification, hide the form
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
  component: ComponentType<ToolCardProps>;
  dataKey?: string | null;
  emptyMessage?: string;
}

// Tek noktadan yonetim: toolName -> Kart Bileseni
export const TOOL_COMPONENT_MAP: Record<string, ToolCardConfig> = {
  askClarification:     { component: ClarificationCard,     dataKey: null },
  analyzeIndicators:    { component: IndicatorSignalsCard,  dataKey: 'signals' },
  getCurrentPrice:      { component: PriceSnapshotCard,     dataKey: null },
  searchStock:          { component: SearchResultsCard,     dataKey: 'results' },
  getWatchlist:         { component: WatchlistSummaryCard,  dataKey: 'items', emptyMessage: 'Your watchlist is empty.' },
  addToWatchlist:       { component: ActionConfirmCard,     dataKey: null },
  removeFromWatchlist:  { component: ActionConfirmCard,     dataKey: null },
  getMarketNews:        { component: NewsListCard,          dataKey: 'articles' },
  createPriceAlert:     { component: ActionConfirmCard,     dataKey: null },
  deletePriceAlert:     { component: ActionConfirmCard,     dataKey: null },
  getUserAlerts:        { component: AlertListCard,         dataKey: 'alerts', emptyMessage: 'No active alerts.' },
  runBacktest:          { component: BacktestResultCard,    dataKey: null },
  // optimizeParameter: OZEL AKIS — GenerativeUI icinde ayri islenir
  rankIndicators:       { component: IndicatorRankingCard,  dataKey: 'results' },
  findBestIndicator:    { component: IndicatorRankingCard,  dataKey: 'best' },
  createSmartAlert:     { component: ActionConfirmCard,     dataKey: null },
  getSmartAlerts:       { component: AlertListCard,         dataKey: 'alerts' },
};

// Registry'de olmayan bir tool icin fallback: null doner, GenerativeUI metin olarak birakir
export function getToolCard(toolName: string): ToolCardConfig | null {
  return TOOL_COMPONENT_MAP[toolName] || null;
}
