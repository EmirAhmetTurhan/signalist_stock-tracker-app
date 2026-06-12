import TradingViewWidget from "@/components/charts/TradingViewWidget";
import {
    HEATMAP_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    MARKET_OVERVIEW_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG
} from "@/lib/constants";

const Home = () => {
    const scriptUrl = 'https://s3.tradingview.com/external-embedding/embed-widget-'

    return (
        <div className="flex flex-col xl:flex-row min-h-screen w-full gap-8 pb-12">
            
            {/* Left Column (Desktop) / Bottom Row (Mobile) */}
            <div className="order-3 xl:order-none flex flex-col sm:flex-row xl:flex-col w-full xl:w-1/3 gap-8">
                <div className="w-full">
                    <TradingViewWidget
                        title="Market Overview"
                        scriptUrl={`${scriptUrl}market-overview.js`}
                        config={MARKET_OVERVIEW_WIDGET_CONFIG}
                        className="custom-chart"
                        height={600}
                    />
                </div>
                <div className="w-full">
                    <TradingViewWidget
                        scriptUrl={`${scriptUrl}timeline.js`}
                        config={TOP_STORIES_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </div>

            {/* Right Column (Desktop) / Top Rows (Mobile) */}
            <div className="order-1 xl:order-none flex flex-col w-full xl:w-2/3 gap-8">
                <div className="w-full order-1 xl:order-none">
                    <TradingViewWidget
                        title="Stock Heatmap"
                        scriptUrl={`${scriptUrl}stock-heatmap.js`}
                        config={HEATMAP_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
                <div className="w-full order-2 xl:order-none">
                    <TradingViewWidget
                        title="Sector Performance"
                        scriptUrl={`${scriptUrl}market-quotes.js`}
                        config={MARKET_DATA_WIDGET_CONFIG}
                        height={600}
                    />
                </div>
            </div>

        </div>
    )
}
export default Home
