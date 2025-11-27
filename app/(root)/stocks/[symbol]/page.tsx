import TradingViewWidget from "@/components/TradingViewWidget";
import {
  SYMBOL_INFO_WIDGET_CONFIG,
  CANDLE_CHART_WIDGET_CONFIG,
  BASELINE_WIDGET_CONFIG,
  TECHNICAL_ANALYSIS_WIDGET_CONFIG,
  COMPANY_PROFILE_WIDGET_CONFIG,
  COMPANY_FINANCIALS_WIDGET_CONFIG,
} from "@/lib/constants";
import WatchlistButton from "@/components/WatchlistButton";

const StockDetails = async ({ params }: StockDetailsPageProps) => {
  const { symbol } = await params;

  const scriptUrl = "https://s3.tradingview.com/external-embedding/embed-widget-";
  const upper = symbol?.toUpperCase?.() || symbol;

  return (
    <div className="flex min-h-screen w-full">
      <section className="grid w-full gap-8 grid-cols-1 xl:grid-cols-2">
        {/* Left Column */}
        <div className="flex flex-col gap-8">
          <TradingViewWidget
            title="Symbol Info"
            scriptUrl={`${scriptUrl}symbol-info.js`}
            config={SYMBOL_INFO_WIDGET_CONFIG(upper)}
          />

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

        {/* Right Column */}
        <div className="flex flex-col gap-8">
          <WatchlistButton symbol={upper} company={upper} isInWatchlist={false} />

          <TradingViewWidget
            title="Technical Analysis"
            scriptUrl={`${scriptUrl}technical-analysis.js`}
            config={TECHNICAL_ANALYSIS_WIDGET_CONFIG(upper)}
          />

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
