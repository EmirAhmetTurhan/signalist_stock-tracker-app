import TASearch from "@/components/TASearch";
import TAIndicatorsButton from "@/components/TAIndicatorsButton";
import LightweightCandleChart from "@/components/LightweightCandleChart";
import LightweightMACDChart from "@/components/LightweightMACDChart";
import LightweightStochRSIChart from "@/components/LightweightStochRSIChart";
import LightweightWaveTrendChart from "@/components/LightweightWaveTrendChart";
import LightweightDMIChart from "@/components/LightweightDMIChart";
import LightweightMFIChart from "@/components/LightweightMFIChart";
import TradingViewWidget from "@/components/TradingViewWidget";
import { searchStocks, getDailyCandles, fetchJSON } from "@/lib/actions/finnhub.actions";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { computeMACD } from "@/lib/indicators/macd";
import { computeStochRSI } from "@/lib/indicators/stochrsi";
import { computeWaveTrend } from "@/lib/indicators/wavetrend";
import { computeDMI } from "@/lib/indicators/dmi";
import { computeMFI } from "@/lib/indicators/mfi";

type TAProps = {
  searchParams?: Promise<{ symbol?: string }>;
};

const TAPage = async (props: TAProps) => {
  const initialStocks = await searchStocks();
  const search = (await props.searchParams) || {};
  const symbol = (search.symbol || "").toUpperCase();
  const indParam = String((search as any).ind || "");

  const candles: CandleDataPoint[] = symbol ? await getDailyCandles(symbol, 240) : [];
  const scriptBase = "https://s3.tradingview.com/external-embedding/embed-widget-";

  // Best-effort fetch of company logo for the selected symbol
  let logoUrl: string | undefined = undefined;
  if (symbol) {
    const token = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
    if (token) {
      try {
        const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const prof = await fetchJSON<{ logo?: string }>(profileUrl, 3600);
        logoUrl = typeof prof?.logo === 'string' && prof.logo ? prof.logo : undefined;
      } catch {}
    }
  }

  const indicators = new Set(
    indParam
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );

  let macdData:
    | { macd: { time: UTCTimestamp; value: number }[]; signal: { time: UTCTimestamp; value: number }[]; histogram: { time: UTCTimestamp; value: number; color: string }[] }
    | undefined;
  if (candles.length > 0 && indicators.has('macd')) {
    const macdSeries = computeMACD(candles.map((c) => ({ time: c.time, close: c.close })));
    const macd = macdSeries
      .filter((p) => typeof p.macd === 'number')
      .map((p) => ({ time: p.time, value: p.macd as number }));
    const signal = macdSeries
      .filter((p) => typeof p.signal === 'number')
      .map((p) => ({ time: p.time, value: p.signal as number }));
    const histogram = macdSeries
      .filter((p) => typeof p.histogram === 'number')
      .map((p) => ({
        time: p.time,
        value: p.histogram as number,
        color: (p.histogram as number) >= 0 ? '#0db27a' : '#ef4444',
      }));
    macdData = { macd, signal, histogram };
  }

  let stochRsiData:
    | { k: { time: UTCTimestamp; value: number }[]; d: { time: UTCTimestamp; value: number }[] }
    | undefined;
  if (candles.length > 0 && indicators.has('stochrsi')) {
    const srsi = computeStochRSI(candles.map((c) => ({ time: c.time, close: c.close })));
    const k = srsi
      .filter((p) => typeof p.k === 'number')
      .map((p) => ({ time: p.time, value: p.k as number }));
    const d = srsi
      .filter((p) => typeof p.d === 'number')
      .map((p) => ({ time: p.time, value: p.d as number }));
    stochRsiData = { k, d };
  }

  let waveTrendData:
    | {
        wt1: { time: UTCTimestamp; value: number }[];
        wt2: { time: UTCTimestamp; value: number }[];
        crosses: { time: UTCTimestamp; cross: 1 | -1 }[];
      }
    | undefined;
  if (candles.length > 0 && indicators.has('wavetrend')) {
    const wt = computeWaveTrend(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })));
    const wt1 = wt
      .filter((p) => typeof p.wt1 === 'number')
      .map((p) => ({ time: p.time, value: p.wt1 as number }));
    const wt2 = wt
      .filter((p) => typeof p.wt2 === 'number')
      .map((p) => ({ time: p.time, value: p.wt2 as number }));
    const crosses = wt
      .filter((p) => p.cross === 1 || p.cross === -1)
      .map((p) => ({ time: p.time, cross: p.cross as 1 | -1 }));
    waveTrendData = { wt1, wt2, crosses };
  }

  let dmiData:
    | {
        plusDI: { time: UTCTimestamp; value: number }[];
        minusDI: { time: UTCTimestamp; value: number }[];
        adx: { time: UTCTimestamp; value: number }[];
      }
    | undefined;
  if (candles.length > 0 && indicators.has('dmi')) {
    const dmi = computeDMI(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })));
    const plusDI = dmi
      .filter((p) => typeof p.plusDI === 'number')
      .map((p) => ({ time: p.time, value: p.plusDI as number }));
    const minusDI = dmi
      .filter((p) => typeof p.minusDI === 'number')
      .map((p) => ({ time: p.time, value: p.minusDI as number }));
    const adx = dmi
      .filter((p) => typeof p.adx === 'number')
      .map((p) => ({ time: p.time, value: p.adx as number }));
    dmiData = { plusDI, minusDI, adx };
  }

  let mfiData: { mfi: { time: UTCTimestamp; value: number }[] } | undefined;
  if (candles.length > 0 && indicators.has('mfi')) {
    const mfiSeries = computeMFI(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })));
    const mfi = mfiSeries
      .filter((p) => typeof p.mfi === 'number')
      .map((p) => ({ time: p.time, value: p.mfi as number }));
    mfiData = { mfi };
  }

  return (
    <div className="container py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">T/A</h1>
        <div className="flex items-center gap-2">
          <TAIndicatorsButton />
          <TASearch initialStocks={initialStocks} />
        </div>
      </div>

      {symbol ? (
        <div className="flex flex-col gap-3">
          <div className="text-gray-400 flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gray-700/60 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={`${symbol} logo`} className="h-full w-full object-contain p-0.5" />
              ) : (
                <span className="text-white text-xs font-semibold">{symbol.slice(0, 1)}</span>
              )}
            </div>
            <span>{symbol} — Candlestick</span>
          </div>
          {candles && candles.length > 0 ? (
            <LightweightCandleChart data={candles} height={560} />
          ) : (
            <TradingViewWidget
              scriptUrl={`${scriptBase}advanced-chart.js`}
              config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
              height={560}
              className="custom-chart"
            />
          )}
          {/* Indicators */}
          {macdData && (
            <div className="mt-2">
              {(() => {
                // Derive MACD signal label based on latest values
                let macdSignal: { label: string; className: string } | undefined;
                try {
                  const hist = macdData.histogram || [];
                  const mac = macdData.macd || [];
                  const sig = macdData.signal || [];
                  if (hist.length >= 2 && mac.length > 0 && sig.length > 0) {
                    const lastHist = hist[hist.length - 1]?.value;
                    const prevHist = hist[hist.length - 2]?.value;
                    const lastMacd = mac[mac.length - 1]?.value;
                    const lastSignal = sig[sig.length - 1]?.value;
                    if (
                      typeof lastHist === 'number' &&
                      typeof prevHist === 'number' &&
                      typeof lastMacd === 'number' &&
                      typeof lastSignal === 'number'
                    ) {
                      if (lastMacd > lastSignal) {
                        if (lastHist > prevHist) {
                          macdSignal = { label: 'STRONG BUY', className: 'bg-green-900/40 text-green-300 border border-green-700' };
                        } else if (lastHist < prevHist) {
                          macdSignal = { label: 'WEAK BUY', className: 'bg-green-900/20 text-green-300/80 border border-green-700/60' };
                        }
                      } else if (lastMacd < lastSignal) {
                        if (lastHist < prevHist) {
                          macdSignal = { label: 'STRONG SELL', className: 'bg-red-900/40 text-red-300 border border-red-700' };
                        } else if (lastHist > prevHist) {
                          macdSignal = { label: 'WEAK SELL', className: 'bg-red-900/20 text-red-300/80 border border-red-700/60' };
                        }
                      }
                    }
                  }
                } catch {}

                return (
                  <div className="text-gray-400 mb-1 flex items-center gap-2">
                    <span>MACD (12, 26, 9)</span>
                    {macdSignal && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${macdSignal.className}`}>
                        {macdSignal.label}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LightweightMACDChart macd={macdData.macd} signal={macdData.signal} histogram={macdData.histogram} />
            </div>
          )}
          {stochRsiData && (
            <div className="mt-4">
              {(() => {
                // Derive Stoch RSI signal label based on latest %K (green) and %D (orange)
                let stochSignal: { label: string; className: string } | undefined;
                try {
                  const kArr = stochRsiData.k || [];
                  const dArr = stochRsiData.d || [];
                  const lastK = kArr.length > 0 ? kArr[kArr.length - 1]?.value : undefined;
                  const lastD = dArr.length > 0 ? dArr[dArr.length - 1]?.value : undefined;
                  if (typeof lastK === 'number' && typeof lastD === 'number' && Number.isFinite(lastK) && Number.isFinite(lastD)) {
                    if (lastK > lastD) {
                      if (lastK < 20) {
                        stochSignal = { label: 'STRONG BUY', className: 'bg-green-900/40 text-green-300 border border-green-700' };
                      } else {
                        stochSignal = { label: 'WEAK BUY', className: 'bg-green-900/20 text-green-300/80 border border-green-700/60' };
                      }
                    } else if (lastK < lastD) {
                      if (lastK > 80) {
                        stochSignal = { label: 'STRONG SELL', className: 'bg-red-900/40 text-red-300 border border-red-700' };
                      } else {
                        stochSignal = { label: 'WEAK SELL', className: 'bg-red-900/20 text-red-300/80 border border-red-700/60' };
                      }
                    }
                    // If equal, omit
                  }
                } catch {}

                return (
                  <div className="text-gray-400 mb-1 flex items-center gap-2">
                    <span>Stochastic RSI (14, 14, 3, 3)</span>
                    {stochSignal && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stochSignal.className}`}>
                        {stochSignal.label}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LightweightStochRSIChart k={stochRsiData.k} d={stochRsiData.d} />
            </div>
          )}
          {waveTrendData && (
            <div className="mt-4">
              {(() => {
                // Derive WaveTrend signal based on latest wt1 (green) and wt2 (orange)
                let wtSignal: { label: string; className: string } | undefined;
                try {
                  const w1 = waveTrendData.wt1 || [];
                  const w2 = waveTrendData.wt2 || [];
                  const lastW1 = w1.length > 0 ? w1[w1.length - 1]?.value : undefined;
                  const lastW2 = w2.length > 0 ? w2[w2.length - 1]?.value : undefined;
                  if (typeof lastW1 === 'number' && typeof lastW2 === 'number' && Number.isFinite(lastW1) && Number.isFinite(lastW2)) {
                    if (lastW1 > lastW2) {
                      // BUY side
                      if (lastW1 < -60) {
                        wtSignal = { label: 'STRONG BUY', className: 'bg-green-900/40 text-green-300 border border-green-700' };
                      } else {
                        wtSignal = { label: 'WEAK BUY', className: 'bg-green-900/20 text-green-300/80 border border-green-700/60' };
                      }
                    } else if (lastW1 < lastW2) {
                      // SELL side
                      if (lastW1 > 60) {
                        wtSignal = { label: 'STRONG SELL', className: 'bg-red-900/40 text-red-300 border border-red-700' };
                      } else {
                        wtSignal = { label: 'WEAK SELL', className: 'bg-red-900/20 text-red-300/80 border border-red-700/60' };
                      }
                    }
                    // If equal, omit
                  }
                } catch {}

                return (
                  <div className="text-gray-400 mb-1 flex items-center gap-2">
                    <span>WaveTrend [LazyBear] (10, 21, 4)</span>
                    {wtSignal && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${wtSignal.className}`}>
                        {wtSignal.label}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LightweightWaveTrendChart wt1={waveTrendData.wt1} wt2={waveTrendData.wt2} crosses={waveTrendData.crosses} />
            </div>
          )}
          {dmiData && (
            <div className="mt-4">
              {(() => {
                // Derive DMI signal based on latest DI+ (green), DI- (red), and ADX
                let dmiSignal: { label: string; className: string } | undefined;
                try {
                  const plus = dmiData.plusDI || [];
                  const minus = dmiData.minusDI || [];
                  const adxArr = dmiData.adx || [];
                  const lastPlus = plus.length > 0 ? plus[plus.length - 1]?.value : undefined;
                  const lastMinus = minus.length > 0 ? minus[minus.length - 1]?.value : undefined;
                  const lastAdx = adxArr.length > 0 ? adxArr[adxArr.length - 1]?.value : undefined;
                  if (
                    typeof lastPlus === 'number' && Number.isFinite(lastPlus) &&
                    typeof lastMinus === 'number' && Number.isFinite(lastMinus) &&
                    typeof lastAdx === 'number' && Number.isFinite(lastAdx)
                  ) {
                    if (lastPlus > lastMinus) {
                      if (lastAdx > 20) {
                        dmiSignal = { label: 'STRONG BUY', className: 'bg-green-900/40 text-green-300 border border-green-700' };
                      } else {
                        dmiSignal = { label: 'WEAK BUY', className: 'bg-green-900/20 text-green-300/80 border border-green-700/60' };
                      }
                    } else if (lastMinus > lastPlus) {
                      if (lastAdx > 20) {
                        dmiSignal = { label: 'STRONG SELL', className: 'bg-red-900/40 text-red-300 border border-red-700' };
                      } else {
                        dmiSignal = { label: 'WEAK SELL', className: 'bg-red-900/20 text-red-300/80 border border-red-700/60' };
                      }
                    }
                    // If equal or missing, omit
                  }
                } catch {}

                return (
                  <div className="text-gray-400 mb-1 flex items-center gap-2">
                    <span>Directional Movement Index (14)</span>
                    {dmiSignal && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${dmiSignal.className}`}>
                        {dmiSignal.label}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LightweightDMIChart plusDI={dmiData.plusDI} minusDI={dmiData.minusDI} adx={dmiData.adx} />
            </div>
          )}
          {mfiData && (
            <div className="mt-4">
              {(() => {
                // Derive MFI signal based on latest and previous MFI values
                let mfiSignal: { label: string; className: string } | undefined;
                try {
                  const arr = mfiData.mfi || [];
                  if (arr.length >= 2) {
                    const last = arr[arr.length - 1]?.value;
                    const prev = arr[arr.length - 2]?.value;
                    if (
                      typeof last === 'number' && Number.isFinite(last) &&
                      typeof prev === 'number' && Number.isFinite(prev)
                    ) {
                      // Priority strong zones first
                      if (last < 20) {
                        mfiSignal = { label: 'STRONG BUY', className: 'bg-green-900/40 text-green-300 border border-green-700' };
                      } else if (last > 80) {
                        mfiSignal = { label: 'STRONG SELL', className: 'bg-red-900/40 text-red-300 border border-red-700' };
                      } else if (last > prev && last < 80) {
                        mfiSignal = { label: 'WEAK BUY', className: 'bg-green-900/20 text-green-300/80 border border-green-700/60' };
                      } else if (last < prev && last > 20) {
                        mfiSignal = { label: 'WEAK SELL', className: 'bg-red-900/20 text-red-300/80 border border-red-700/60' };
                      }
                      // if equal or ambiguous, omit
                    }
                  }
                } catch {}

                return (
                  <div className="text-gray-400 mb-1 flex items-center gap-2">
                    <span>Money Flow Index (14)</span>
                    {mfiSignal && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mfiSignal.className}`}>
                        {mfiSignal.label}
                      </span>
                    )}
                  </div>
                );
              })()}
              <LightweightMFIChart mfi={mfiData.mfi} />
            </div>
          )}
        </div>
      ) : (
        <div className="text-gray-400">Use the Search button to choose a brand and view its candlestick chart.</div>
      )}
    </div>
  );
};

export default TAPage;
