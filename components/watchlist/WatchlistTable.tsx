'use client';
import TradingViewWidget from '@/components/charts/TradingViewWidget';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

const WatchlistTable = ({ watchlist }: WatchlistTableProps) => {
  const [rows, setRows] = useState<StockWithData[]>(watchlist);
  const optimisticItems = useAppStore((s) => s.watchlist);

  // Optimistic UI: AI watchlist'e ekleme yaptığında anında göster
  useEffect(() => {
    if (optimisticItems.length === 0) return;
    const existingSymbols = new Set(watchlist.map((w) => w.symbol));
    const newItems = optimisticItems.filter((oi) => !existingSymbols.has(oi.symbol));
    if (newItems.length === 0) return;

    setRows((prev) => {
      const updated = [...prev];
      for (const item of newItems) {
        if (!updated.find((r) => r.symbol === item.symbol)) {
          updated.push({
            symbol: item.symbol,
            name: item.company,
            price: null,
            changePercent: null,
            marketCap: null,
            pe: null,
            isInWatchlist: true,
          } as any);
        }
      }
      return updated;
    });
  }, [optimisticItems, watchlist]);

  const scriptBase = 'https://s3.tradingview.com/external-embedding/embed-widget-';
  // Use fixed header and row heights to keep overlay perfectly aligned with TradingView rows
  const headerHeight = 44; // px – TradingView table header height (approx.)
  const rowHeight = 44; // px – TradingView table row height (approx.)
  const widgetHeight = headerHeight + rows.length * rowHeight;
  const controlsColWidth = 52; // px – fixed width for the right-side controls column

  const quotesConfig = useMemo(() => {
    const symbolsGroup = {
      name: 'My Watchlist',
      symbols: rows.map((i) => ({ name: i.symbol, displayName: i.company || i.symbol })),
    };
    return {
      title: 'Watchlist',
      width: '100%',
      height: widgetHeight,
      locale: 'en',
      showSymbolLogo: true,
      colorTheme: 'dark',
      isTransparent: false,
      backgroundColor: '#0F0F0F',
      symbolsGroups: [symbolsGroup],
    } as Record<string, unknown>;
  }, [rows, widgetHeight]);

  const handleWatchlistChange = (symbol: string, isAdded: boolean) => {
    if (!isAdded) {
      // Remove row optimistically
      setRows((r) => r.filter((x) => x.symbol !== symbol));
    }
  };

  if (rows.length === 0) return null;

  // Render TradingView table with a separate right-side column for controls (not overlayed)
  // This keeps buttons off the graphic while staying perfectly aligned with rows.
  return (
    <div className="flex items-stretch gap-2">
      {/* Left: TradingView Market Quotes widget */}
      <div className="flex-1 min-w-0">
        <TradingViewWidget
          scriptUrl={`${scriptBase}market-quotes.js`}
          config={quotesConfig}
          height={widgetHeight}
          className="watchlist-table"
        />
      </div>

      {/* Right: independent column of delete buttons, aligned by fixed row height */}
      <div
        className="flex flex-col items-center select-none"
        style={{ width: `${controlsColWidth}px`, height: `${widgetHeight}px` }}
      >
        {/* Spacer for the header */}
        <div style={{ height: `${headerHeight}px` }} />
        {rows.map((i) => (
          <div key={i.symbol} className="flex items-center justify-center" style={{ height: `${rowHeight}px` }}>
            <WatchlistButton
              symbol={i.symbol}
              company={i.company}
              isInWatchlist={true}
              type="icon"
              showTrashIcon
              onWatchlistChange={handleWatchlistChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WatchlistTable;
