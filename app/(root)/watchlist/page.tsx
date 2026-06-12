import Link from 'next/link';
import { getCurrentUserWatchlist } from '@/lib/actions/watchlist.actions';
import { getUserAlerts } from '@/lib/actions/alerts.actions';
import { fetchJSON } from '@/lib/actions/finnhub.actions';
import { formatPrice, formatChangePercent, getChangeColorClass, getAlertText } from '@/lib/utils';
import WatchlistTable from '@/components/watchlist/WatchlistTable';
import AlertActions from '@/components/alerts/AlertActions';
export const dynamic = 'force-dynamic';

const WatchlistPage = async () => {
  const items = await getCurrentUserWatchlist();
  const alerts = await getUserAlerts();

  // Enrich alerts and watchlist items with current price and change (best-effort)
  const alertsWithQuotes: Alert[] = Array.isArray(alerts) ? [...alerts] : [];
  let logosMap: Record<string, string | undefined> = {};
  let quotesMap: Record<string, { c?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number }> = {};
  
  if (alertsWithQuotes.length > 0 || items.length > 0) {
    const allSymbols = Array.from(new Set([
      ...alertsWithQuotes.map((a) => a.symbol.toUpperCase()),
      ...items.map((i) => i.symbol.toUpperCase())
    ]));

    const token = process.env.FINNHUB_API_KEY || '';
    if (token) {
      await Promise.all(
        allSymbols.map(async (sym) => {
          try {
            const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${token}`;
            const q = await fetchJSON<{ c?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number }>(url, 120);
            quotesMap[sym] = q || {};
          } catch {
            quotesMap[sym] = {};
          }
          // Fetch company logo (best-effort)
          try {
            const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
            const p = await fetchJSON<{ logo?: string }>(profileUrl, 3600);
            logosMap[sym] = typeof p?.logo === 'string' && p.logo ? p.logo : undefined;
          } catch {
            logosMap[sym] = undefined;
          }
        })
      );
      alertsWithQuotes.forEach((a) => {
        const q = quotesMap[a.symbol.toUpperCase()] || {};
        const price = Number(q.c || 0);
        const dp = typeof q.dp === 'number' ? q.dp : undefined;
        a.currentPrice = price;
        if (typeof dp === 'number') a.changePercent = dp;
      });
    }
  }

  // Create an enriched watchlist array
  const enrichedWatchlist = items.map((i) => {
    const sym = i.symbol.toUpperCase();
    const q = quotesMap[sym] || {};
    return {
      ...i,
      currentPrice: Number(q.c || 0),
      changePercent: typeof q.dp === 'number' ? q.dp : undefined,
      highPrice: typeof q.h === 'number' ? q.h : undefined,
      lowPrice: typeof q.l === 'number' ? q.l : undefined,
      openPrice: typeof q.o === 'number' ? q.o : undefined,
      prevClose: typeof q.pc === 'number' ? q.pc : undefined,
      logoUrl: logosMap[sym],
    };
  });

  if (!items.length) {
    return (
      <div className="watchlist-empty-container">
        <div className="watchlist-empty">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="watchlist-star">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          <h2 className="empty-title">Your Watchlist is empty</h2>
          <p className="empty-description">Use the Search to find a stock and click “Add to Watchlist”. Your saved brands will appear here.</p>
          <Link className="search-btn" href="/search">Search Stocks</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="watchlist-container flex flex-col xl:flex-row gap-6 w-full">
      <section className="watchlist flex-1 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h1 className="watchlist-title">Watchlist</h1>
        </div>

        <WatchlistTable watchlist={enrichedWatchlist} />
      </section>

      {/* Right column placeholder for Alerts & News to mirror the design */}
      <aside className="watchlist-alerts w-full xl:w-[400px] shrink-0">
        <div className="w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="watchlist-title">Alerts</h2>
            {items.length > 0 && (
              <Link
                href={`/stocks/${encodeURIComponent(items[0].symbol)}/alert?company=${encodeURIComponent(items[0].company)}`}
                className="px-3 py-2 rounded-md bg-gradient-to-r from-yellow-300 to-yellow-500 text-black text-sm font-medium"
              >
                Create Alert
              </Link>
            )}
          </div>
          {alertsWithQuotes.length === 0 ? (
            <div className="text-gray-500 text-sm border border-dashed border-gray-600 rounded p-6">No alerts yet.</div>
          ) : (
            <div className="space-y-4">
              {alertsWithQuotes.map((a) => {
                const priceValid = Number.isFinite(a.currentPrice) && a.currentPrice > 0;
                const priceText = priceValid ? formatPrice(a.currentPrice) : '—';
                const changeText = typeof a.changePercent === 'number' ? formatChangePercent(a.changePercent) : '';
                const changeClass = typeof a.changePercent === 'number' ? getChangeColorClass(a.changePercent) : 'text-gray-400';
                const alertText = getAlertText(a);
                // Read logo from prepared logosMap; fallback to initial
                const logoUrl = logosMap[a.symbol.toUpperCase()];
                return (
                  <div key={a.id} className="rounded-xl border border-gray-700 bg-[#141414]">
                    {/* Header row: brand and price */}
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded bg-gray-700/60 flex items-center justify-center overflow-hidden">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoUrl} alt={`${a.company} logo`} className="h-full w-full object-contain p-1" />
                          ) : (
                            <span className="text-white font-semibold">
                              {a.symbol?.slice(0, 1)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-gray-100 font-medium truncate">{a.company || a.symbol}</div>
                          <div className="text-gray-400 text-sm font-mono truncate">{a.symbol}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-100 font-semibold">{priceText}</div>
                        {changeText && <div className={`text-sm ${changeClass}`}>{changeText}</div>}
                      </div>
                    </div>
                    <div className="border-t border-gray-700" />
                    {/* Condition row */}
                    <div className="flex items-center justify-between p-4">
                      <div>
                        <div className="text-gray-400 text-sm mb-1">Alert:</div>
                        <div className="text-white font-semibold">{alertText}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertActions alertId={a.id} threshold={a.threshold} />
                        <span className="px-3 py-1 rounded-md bg-yellow-900/30 text-yellow-300 text-xs border border-yellow-600/30">Once per day</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default WatchlistPage;
