'use client';
import TradingViewWidget from '@/components/charts/TradingViewWidget';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';

const WatchlistTable = ({ watchlist: serverWatchlist }: WatchlistTableProps) => {
  const storeWatchlist = useAppStore((s) => s.watchlist);
  const setWatchlist = useAppStore((s) => s.setWatchlist);
  const initialized = useRef(false);

  // Init: server'dan gelen veriyi store'a yaz (sadece bir kez)
  useEffect(() => {
    if (initialized.current) return;
    if (serverWatchlist.length > 0 && storeWatchlist.length === 0) {
      setWatchlist(
        serverWatchlist.map((w) => ({
          symbol: w.symbol,
          company: w.company,
          addedAt: w.addedAt.toISOString(),
        })),
      );
      initialized.current = true;
    }
  }, [serverWatchlist, storeWatchlist.length, setWatchlist]);

  const rows = storeWatchlist;

  const scriptBase = 'https://s3.tradingview.com/external-embedding/embed-widget-';
  const headerHeight = 44;
  const rowHeight = 44;
  const widgetHeight = rows.length > 0 ? headerHeight + rows.length * rowHeight : 0;
  const controlsColWidth = 52;

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

  if (rows.length === 0) return null;

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 min-w-0">
        <TradingViewWidget
          scriptUrl={`${scriptBase}market-quotes.js`}
          config={quotesConfig}
          height={widgetHeight}
          className="watchlist-table"
        />
      </div>

      <div
        className="flex flex-col items-center select-none"
        style={{ width: `${controlsColWidth}px`, height: `${widgetHeight}px` }}
      >
        <div style={{ height: `${headerHeight}px` }} />
        {rows.map((i) => (
          <div
            key={i.symbol}
            className="flex items-center justify-center"
            style={{ height: `${rowHeight}px` }}
          >
            <WatchlistButton
              symbol={i.symbol}
              company={i.company}
              isInWatchlist={true}
              type="icon"
              showTrashIcon
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WatchlistTable;