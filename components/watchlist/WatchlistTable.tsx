'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import WatchlistButton from '@/components/watchlist/WatchlistButton';
import { formatPrice, formatChangePercent, getChangeColorClass } from '@/lib/utils';
import Link from 'next/link';

const WatchlistTable = ({ watchlist: serverWatchlist }: WatchlistTableProps) => {
  const storeWatchlist = useAppStore((s) => s.watchlist);
  const setWatchlist = useAppStore((s) => s.setWatchlist);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (serverWatchlist.length > 0 && storeWatchlist.length === 0) {
      setWatchlist(
        serverWatchlist.map((w) => ({
          symbol: w.symbol,
          company: w.company,
          addedAt: w.addedAt instanceof Date ? w.addedAt.toISOString() : new Date(w.addedAt).toISOString(),
        })),
      );
      initialized.current = true;
    }
  }, [serverWatchlist, storeWatchlist.length, setWatchlist]);

  // Combine server quotes with the optimistic store state
  const visibleRows = serverWatchlist.filter((serverItem) => 
    storeWatchlist.some((storeItem) => storeItem.symbol === serverItem.symbol)
  );

  if (visibleRows.length === 0) return null;

  return (
    <div className="w-full rounded-xl border border-gray-700/50 bg-[#141414]/80 backdrop-blur-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-[#0f0f0f]/80 text-xs uppercase text-gray-500 border-b border-gray-800">
            <tr>
              <th scope="col" className="px-6 py-4 font-medium">Symbol</th>
              <th scope="col" className="px-6 py-4 font-medium text-right">Price</th>
              <th scope="col" className="px-6 py-4 font-medium text-right hidden md:table-cell">Open</th>
              <th scope="col" className="px-6 py-4 font-medium text-right hidden md:table-cell">High</th>
              <th scope="col" className="px-6 py-4 font-medium text-right hidden md:table-cell">Low</th>
              <th scope="col" className="px-6 py-4 font-medium text-right hidden sm:table-cell">Prev Close</th>
              <th scope="col" className="px-6 py-4 font-medium text-right w-24 shrink-0">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {visibleRows.map((row) => {
              const priceValid = Number.isFinite(row.currentPrice) && row.currentPrice! > 0;
              const priceText = priceValid ? formatPrice(row.currentPrice!) : '—';
              const changeText = typeof row.changePercent === 'number' ? formatChangePercent(row.changePercent) : '';
              const changeClass = typeof row.changePercent === 'number' ? getChangeColorClass(row.changePercent) : 'text-gray-400';
              const logoUrl = (row as any).logoUrl;

              return (
                <tr key={row.symbol} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link href={`/stocks/${row.symbol}`} className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-700/60 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoUrl} alt={`${row.company} logo`} className="h-full w-full object-contain p-1" />
                        ) : (
                          <span className="text-white font-semibold">{row.symbol.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-gray-100 font-medium hover:text-blue-400 transition-colors truncate">{row.company || row.symbol}</div>
                        <div className="text-gray-500 text-xs font-mono">{row.symbol}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-gray-100 font-medium">{priceText}</div>
                    {changeText && <div className={`text-xs ${changeClass}`}>{changeText}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right hidden md:table-cell">
                    <div className="text-gray-300">{typeof row.openPrice === 'number' ? formatPrice(row.openPrice) : '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right hidden md:table-cell">
                    <div className="text-gray-300">{typeof row.highPrice === 'number' ? formatPrice(row.highPrice) : '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right hidden md:table-cell">
                    <div className="text-gray-300">{typeof row.lowPrice === 'number' ? formatPrice(row.lowPrice) : '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right hidden sm:table-cell">
                    <div className="text-gray-300">{typeof row.prevClose === 'number' ? formatPrice(row.prevClose) : '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right shrink-0">
                    <div className="flex justify-end opacity-50 group-hover:opacity-100 transition-opacity">
                      <WatchlistButton
                        symbol={row.symbol}
                        company={row.company}
                        isInWatchlist={true}
                        type="icon"
                        showTrashIcon
                        className="!text-red-500/80 hover:!text-red-500 hover:!bg-red-500/10 p-2 rounded-md transition-all duration-200"
                        strokeWidth={1.5}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WatchlistTable;