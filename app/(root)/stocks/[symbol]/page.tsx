import TradingViewWidget from "@/components/charts/TradingViewWidget";
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import WatchlistButton from "@/components/watchlist/WatchlistButton";
import { getCurrentUserWatchlist } from "@/lib/actions/watchlist.actions";

const StockDetails = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;

  const scriptUrl = "https://s3.tradingview.com/external-embedding/embed-widget-";
  const upper = symbol?.toUpperCase?.() || symbol;
  const watchlist = await getCurrentUserWatchlist();
  const isInWatchlist = Array.isArray(watchlist) && watchlist.some((i) => i.symbol === upper);

  return (
    <div className="flex flex-col min-h-screen w-full gap-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-white/5">
        <h1 className="text-3xl font-bold text-white tracking-tight">{upper}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-0">
          <WatchlistButton symbol={upper} company={upper} isInWatchlist={isInWatchlist} className="w-fit" />
        </div>
      </div>

      <section className="grid w-full gap-8 grid-cols-1 xl:grid-cols-3">
        {/* Full width Symbol Info */}
        <div className="col-span-1 xl:col-span-3">
          <TradingViewWidget
            scriptUrl={`${scriptUrl}symbol-info.js`}
            config={SYMBOL_INFO_WIDGET_CONFIG(upper)}
          />
        </div>

        {/* Left Column (Charts) */}
        <div className="flex flex-col gap-8 col-span-1 xl:col-span-2">
          <TradingViewWidget
            title="Candle Chart"
            scriptUrl={`${scriptUrl}advanced-chart.js`}
            config={CANDLE_CHART_WIDGET_CONFIG(upper)}
            className="custom-chart"
          />

          <TradingViewWidget
            title="Baseline Chart"
            scriptUrl={`${scriptUrl}advanced-chart.js`}
            config={BASELINE_WIDGET_CONFIG(upper)}
            className="custom-chart"
          />
        </div>

        {/* Right Column (Company Info & Financials) */}
        <div className="flex flex-col gap-8 col-span-1 xl:col-span-1">
          <TradingViewWidget
            title="Company Profile"
            scriptUrl={`${scriptUrl}symbol-profile.js`}
            config={COMPANY_PROFILE_WIDGET_CONFIG(upper)}
          />

          <TradingViewWidget
            title="Company Financials"
            scriptUrl={`${scriptUrl}financials.js`}
            config={COMPANY_FINANCIALS_WIDGET_CONFIG(upper)}
          />
        </div>
      </section>
    </div>
  );
};

export default StockDetails;
