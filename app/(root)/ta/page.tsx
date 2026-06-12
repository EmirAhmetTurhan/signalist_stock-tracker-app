import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";
import TASearch from "@/components/ta/controls/TASearch";
import TAIndicatorsButton from "@/components/ta/controls/TAIndicatorsButton";
import TATimeframes from "@/components/ta/panels/TATimeframes";
import TAIndicatorSettings from "@/components/ta/panels/TAIndicatorSettings";
import StockLogo from "@/components/ta/common/StockLogo";
import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import ForwardTestCreator from "@/components/portfolio/ForwardTestCreator";
import { triggerOptimization } from "@/lib/actions/optimize.actions";

// Chart component registry — single dynamic import map replaces 16 individual imports
const CHART_REGISTRY = {
  candle: dynamicImport(() => import("@/components/charts/LightweightCandleChart")),
  macd: dynamicImport(() => import("@/components/charts/LightweightMACDChart")),
  stochrsi: dynamicImport(() => import("@/components/charts/LightweightStochRSIChart")),
  wavetrend: dynamicImport(() => import("@/components/charts/LightweightWaveTrendChart")),
  dmi: dynamicImport(() => import("@/components/charts/LightweightDMIChart")),
  mfi: dynamicImport(() => import("@/components/charts/LightweightMFIChart")),
  smi: dynamicImport(() => import("@/components/charts/LightweightSMIChart")),
  ao: dynamicImport(() => import("@/components/charts/LightweightAOChart")),
  rsi: dynamicImport(() => import("@/components/charts/LightweightRSIChart")),
  cci: dynamicImport(() => import("@/components/charts/LightweightCCIChart")),
  wpr: dynamicImport(() => import("@/components/charts/LightweightWPRChart")),
  di: dynamicImport(() => import("@/components/charts/LightweightDIChart")),
  cmf: dynamicImport(() => import("@/components/charts/LightweightCMFChart")),
  ad: dynamicImport(() => import("@/components/charts/LightweightADChart")),
  netvol: dynamicImport(() => import("@/components/charts/LightweightNetVolumeChart")),
  madr: dynamicImport(() => import("@/components/charts/LightweightMADRChart")),
} as const;
import TradingViewWidget from "@/components/charts/TradingViewWidget";
import IndicatorSection from "@/components/ta/panels/IndicatorSection";
import TAStrategiesButton from "@/components/ta/controls/TAStrategiesButton";
import StrategyBacktestMonitor from "@/components/panels/StrategyBacktestMonitor";
import CustomStrategyPanel from "@/components/panels/CustomStrategyPanel";
import CandlePatternPanel from "@/components/panels/CandlePatternPanel";
import HistoricalFractalsPanel from "@/components/panels/HistoricalFractalsPanel";
import SRPanel from "@/components/panels/SRPanel";
import MarketTelemetryPanel from "@/components/ta/panels/MarketTelemetryPanel";
import CandleChartSection from "@/components/ta/panels/CandleChartSection";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { searchStocks, getCandlesForInterval } from "@/lib/actions/finnhub.actions";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { computeIndicators, parseActiveIndicators, generateAllSignals } from "@/lib/ta";
import type { ComputedIndicators, Timeframe, TimePoint } from "@/lib/ta/types";
import { runStrategyBacktest } from "@/lib/ta/strategy-optimizer/run-backtest";
import type { AllData } from "@/lib/ta/strategy-optimizer/types";
import { extractIndicatorParams } from "@/lib/constants/indicator-params";
// SPRINT 3: timeframe-limits.ts silindi. Sadece 4h ve 1d destekleniyor
// (10 yıl = 3650 gün cap). Inline clamp yeterli.

export const dynamic = 'force-dynamic';

type TAProps = {
    searchParams?: Promise<{ symbol?: string }>;
};

const TAPage = async (props: TAProps) => {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    const initialStocks = await searchStocks();
    const rawSearch = (await props.searchParams) || {};
    const search = rawSearch as { symbol?: string } & Record<string, string | undefined>;
    const symbol = (search.symbol || "").toUpperCase();
    const indParam = String(search.ind || "");
    const intervalParam = String(search.interval || "1d");
    const strategyParam = String(search.strategy || "");
    const isRsiCciStrategy = strategyParam === "rsi_cci_wt";
    const yearsParam = search.years ? Number(search.years) : undefined;
    const toParam = search.to ? Number(search.to) : undefined;

    // ── Apply & Optimize: run synchronous optimization and apply results ──────
    const optimizeParam = search.optimize;
    let optimizedParams: Record<string, string> | null = null;
    if (optimizeParam === '1' && symbol && indParam) {
        const indicators = indParam.split(',').filter(Boolean);

        // Run synchronous optimization (awaits candle fetch + brute-force loop)
        const results = await triggerOptimization(symbol, indicators, intervalParam, yearsParam, toParam);

        // Build URL params with optimized values applied
        optimizedParams = {};
        for (const [key, value] of Object.entries(search)) {
            if (value) {
                optimizedParams[key] = value;
            }
        }
        // Remove optimize flag from output params
        delete optimizedParams['optimize'];

        // Write each optimized parameter value
        for (const r of results) {
            optimizedParams[r.paramName] = r.bestVal.toString();
        }
    }

    // Extract indicator params from URL using shared registry
    const effectiveSearch = optimizedParams ?? search;
    const params = extractIndicatorParams(effectiveSearch);

    // Apply discovered strategy param overrides from URL (p= param)
    // Case-insensitive matching: toLowerCase() ensures RSI_LEN and rsi_len both match registry keys
    const pParam = search.p;
    if (pParam) {
        try {
            const overrides = JSON.parse(pParam) as Record<string, number>;
            for (const [key, value] of Object.entries(overrides)) {
                const lowerKey = key.toLowerCase();
                if (params[lowerKey] !== undefined && typeof value === 'number') {
                    params[lowerKey] = value;
                }
            }
        } catch {
            console.warn('[TAPage] Invalid p param:', pParam);
        }
    }

    // SPRINT 3: inline yıl->gün dönüşümü
    const requestedDays = yearsParam ? yearsParam * 365 : undefined;

    const candles: CandleDataPoint[] = symbol
        ? await (() => {
            // SPRINT 3: inline clamp — 4h/1d max 10 yıl (3650 gün)
            const days = Math.min(requestedDays ?? 3650, 3650);
            return getCandlesForInterval(symbol, intervalParam, days, toParam);
        })()
        : [];
    const scriptBase = "https://s3.tradingview.com/external-embedding/embed-widget-";

    const activeIndicators = parseActiveIndicators(indParam);
    if (isRsiCciStrategy) {
        activeIndicators.add('rsi');
        activeIndicators.add('cci');
        activeIndicators.add('wavetrend');
    }

    // Build IndicatorParams from the extracted params object
    const p = params as Record<string, number | string>;
    const ip = {
        macdFast: Number(p.macd_fast), macdSlow: Number(p.macd_slow), macdSig: Number(p.macd_sig),
        stochRsiLen: Number(p.stoch_rsi_len), stochLen: Number(p.stoch_len), stochK: Number(p.stoch_k), stochD: Number(p.stoch_d),
        wtAvgLen: Number(p.wt_avg_len), wtChannelLen: Number(p.wt_channel_len), wtMaLen: Number(p.wt_ma_len),
        dmiDiLen: Number(p.dmi_di_len), dmiAdxSmooth: Number(p.dmi_adx_smooth),
        mfiPeriod: Number(p.mfi_period),
        smiLongLen: Number(p.smi_long_len), smiShortLen: Number(p.smi_short_len), smiSigLen: Number(p.smi_sig_len),
        rsiLen: Number(p.rsi_len), rsiMaLen: Number(p.rsi_ma_len),
        cciLen: Number(p.cci_len), cciMaLen: Number(p.cci_ma_len),
        wprLen: Number(p.wpr_len),
        diLen: Number(p.di_len), diSmooth: Number(p.di_smooth), diK: Number(p.di_k),
        cmfLen: Number(p.cmf_len),
        adLen: Number(p.ad_len),
        madrLen: Number(p.madr_len),
        almaLen: Number(p.alma_len), almaOffset: Number(p.alma_offset), almaSigma: Number(p.alma_sigma),
        almaColor: String(p.alma_color), almaOpacity: Number(p.alma_opacity), almaWidth: Number(p.alma_width), almaStyle: Number(p.alma_style),
        bbLen: Number(p.bb_len), bbStdDev: Number(p.bb_stddev), bbOffset: Number(p.bb_offset),
        bbColor: String(p.bb_color), bbOpacity: Number(p.bb_opacity), bbWidth: Number(p.bb_width),
    };
    const computed: ComputedIndicators = computeIndicators(candles, activeIndicators, ip);

    const { signals: signalLabels, overall } = generateAllSignals(computed, candles);

    // ── Strategy Trade Markers: backtest geçmişini grafik üzerinde göstermek için ──
    const tradeMarkers: import("@/lib/ta/signals").TradeMarker[] = [];
    if (candles.length > 0 && strategyParam) {
      // ComputedIndicators → AllData (yapısal olarak uyumlu, sadece key isimleri farklı)
      const allData: AllData = {
        rsiData: computed.rsi,
        cciData: computed.cci,
        waveTrendData: computed.wavetrend,
        macdData: computed.macd,
        stochRsiData: computed.stochrsi,
        dmiData: computed.dmi,
        smiData: computed.smi,
        aoData: computed.ao,
        mfiData: computed.mfi,
        wprData: computed.wpr,
        diData: computed.di,
        cmfData: computed.cmf,
        adData: computed.ad,
        nvData: computed.netvol,
        madrData: computed.madr,
        almaData: computed.alma,
        bbData: computed.bb as AllData["bbData"],
      };

      const strategyName = isRsiCciStrategy ? "RSI_CCI_WT" : "CUSTOM";
      const backtestOpts = isRsiCciStrategy
        ? {}
        : { customIndicators: indParam.split(",").filter(Boolean), mode: (search.mode || "all") as import("@/lib/ta/types").StrategyMode };
      const evalMode = (search.evalMode || search.evaluationMode || "pathaware") as import("@/lib/ta/types").EvaluationMode;
      const profileParam = (search.profile || "TrendFollower") as import("@/lib/ta/types").SignalProfile;

      try {
        const timeToIndex = new Map<number, number>();
        for (let idx = 0; idx < candles.length; idx++) {
          const t = typeof candles[idx].time === "number" ? candles[idx].time : new Date(candles[idx].time).getTime() / 1000;
          timeToIndex.set(t, idx);
        }

        const btResult = runStrategyBacktest(
          candles,
          strategyName,
          allData,
          { 
            lookForward: parseInt(search.lookForward || "14", 10), 
            evaluationMode: evalMode,
            signalProfile: profileParam
          },
          backtestOpts,
        );

        for (const h of btResult.history) {
          const entryTime = typeof h.time === "number" ? h.time : new Date(h.time).getTime() / 1000;
          const entryIdx = timeToIndex.get(entryTime);
          if (entryIdx === undefined) continue;

          // 1. Entry marker
          tradeMarkers.push({
            time: entryTime,
            price: h.price,
            signal: h.signal,
            indicator: h.signal === "BUY" ? "ENTRY" : "SHORT",
          });

          // 2. Exit marker
          const exitIdx = entryIdx + (h.barsHeld ?? 0);
          if (exitIdx < candles.length) {
            const exitCandle = candles[exitIdx];
            const exitTime = typeof exitCandle.time === "number" ? exitCandle.time : new Date(exitCandle.time).getTime() / 1000;

            let reasonLabel = "EXIT";
            if (h.exitReason === "stop_loss") reasonLabel = "SL";
            else if (h.exitReason === "take_profit") reasonLabel = "TP";
            else if (h.exitReason === "trailing_stop") reasonLabel = "TS";
            else if (h.exitReason === "time_stop") reasonLabel = "TIME";
            else if (h.exitReason === "opposite_signal") reasonLabel = "OPP";

            const exitSignal = h.signal === "BUY" ? "SELL" : "BUY";

            tradeMarkers.push({
              time: exitTime,
              price: h.futurePrice,
              signal: exitSignal,
              indicator: reasonLabel,
            });
          }
        }
      } catch (e) {
        console.error('[TAPage] Backtest markers error:', e);
      }
    }

    // Overlay toggle'lar: aktif olan katmanları göster
    const overlayToggles: ("bb" | "alma" | "patterns" | "sr" | "markers" | "fractals")[] = [];
    if (activeIndicators.has("bb")) overlayToggles.push("bb");
    if (activeIndicators.has("alma")) overlayToggles.push("alma");
    if (activeIndicators.has("patterns")) overlayToggles.push("patterns");
    if (activeIndicators.has("sr") && computed.sr) overlayToggles.push("sr");
    if (activeIndicators.has("fractals") && computed.fractals) overlayToggles.push("fractals");
    if (tradeMarkers && tradeMarkers.length > 0) overlayToggles.push("markers");

    const macdData = computed.macd;
    const rsiData = computed.rsi;
    const stochRsiData = computed.stochrsi;
    const waveTrendData = computed.wavetrend;
    const dmiData = computed.dmi;
    const mfiData = computed.mfi;
    const smiData = computed.smi;
    const aoData = computed.ao;
    const cciData = computed.cci;
    const wprData = computed.wpr;
    const diData = computed.di;
    const cmfData = computed.cmf;
    const adData = computed.ad;
    const nvData = computed.netvol;
    const madrData = computed.madr;
    const almaData = computed.alma;
    const bbData = computed.bb;
    const candlePatternData = computed.candlePatterns || [];
    const fractalResult = computed.fractals ?? null;
    const srResult = computed.sr ?? null;

    // Chart items registry — single source of truth for indicator rendering.
    // Each entry maps an indicator key to its display name, data, chart component, and props.
    // Eliminates 17 nearly-identical ~11-line blocks (~187 lines → ~25 lines).
    interface ChartItem {
        key: string;
        data: unknown;
        name: string;
        btName: string;
        Chart: React.ComponentType<any>;
        chartProps: (data: any) => Record<string, any>;
    }
    const CHART_ITEMS: ChartItem[] = [
        { key: 'macd', data: macdData, name: `MACD (${ip.macdFast}, ${ip.macdSlow}, ${ip.macdSig})`, btName: 'MACD', Chart: CHART_REGISTRY.macd, chartProps: (d) => ({ macd: d.macd, signal: d.signal, histogram: d.histogram }) },
        { key: 'rsi', data: rsiData, name: `RSI (${ip.rsiLen}, ${ip.rsiMaLen})`, btName: 'RSI', Chart: CHART_REGISTRY.rsi, chartProps: (d) => ({ rsi: d.rsi, ma: d.ma }) },
        { key: 'stochrsi', data: stochRsiData, name: `Stoch RSI (${ip.stochRsiLen}, ${ip.stochLen}, ${ip.stochK}, ${ip.stochD})`, btName: 'STOCHRSI', Chart: CHART_REGISTRY.stochrsi, chartProps: (d) => ({ k: d.k, d: d.d }) },
        { key: 'wavetrend', data: waveTrendData, name: `WaveTrend (${ip.wtAvgLen}, ${ip.wtChannelLen}, ${ip.wtMaLen})`, btName: 'WAVETREND', Chart: CHART_REGISTRY.wavetrend, chartProps: (d) => ({ wt1: d.wt1, wt2: d.wt2, crosses: d.crosses }) },
        { key: 'dmi', data: dmiData, name: `DMI (${ip.dmiDiLen}, ${ip.dmiAdxSmooth})`, btName: 'DMI', Chart: CHART_REGISTRY.dmi, chartProps: (d) => ({ plusDI: d.plusDI, minusDI: d.minusDI, adx: d.adx }) },
        { key: 'mfi', data: mfiData, name: `MFI (${ip.mfiPeriod})`, btName: 'MFI', Chart: CHART_REGISTRY.mfi, chartProps: (d) => ({ mfi: d.mfi }) },
        { key: 'smi', data: smiData, name: `SMI (${ip.smiLongLen}, ${ip.smiShortLen}, ${ip.smiSigLen})`, btName: 'SMI', Chart: CHART_REGISTRY.smi, chartProps: (d) => ({ smi: d.smi, signal: d.signal, histogram: d.histogram }) },
        { key: 'ao', data: aoData, name: 'Awesome Oscillator', btName: 'AO', Chart: CHART_REGISTRY.ao, chartProps: (d) => ({ data: d }) },
        { key: 'cci', data: cciData, name: `CCI (${ip.cciLen}, ${ip.cciMaLen})`, btName: 'CCI', Chart: CHART_REGISTRY.cci, chartProps: (d) => ({ cci: d.cci, ma: d.ma }) },
        { key: 'wpr', data: wprData, name: `Williams %R (${ip.wprLen})`, btName: 'WPR', Chart: CHART_REGISTRY.wpr, chartProps: (d) => ({ data: d }) },
        { key: 'di', data: diData, name: `Demand Index (${ip.diLen}, ${ip.diK}, ${ip.diSmooth})`, btName: 'DI', Chart: CHART_REGISTRY.di, chartProps: (d) => ({ data: d }) },
        { key: 'cmf', data: cmfData, name: `CMF (${ip.cmfLen})`, btName: 'CMF', Chart: CHART_REGISTRY.cmf, chartProps: (d) => ({ data: d }) },
        { key: 'ad', data: adData, name: 'A/D', btName: 'AD', Chart: CHART_REGISTRY.ad, chartProps: (d) => ({ ad: d.ad, ma: d.ma }) },
        { key: 'netvol', data: nvData, name: 'Net Volume', btName: 'NETVOL', Chart: CHART_REGISTRY.netvol, chartProps: (d) => ({ data: d }) },
        { key: 'madr', data: madrData, name: `MADR (${ip.madrLen})`, btName: 'MADR', Chart: CHART_REGISTRY.madr, chartProps: (d) => ({ data: d }) },
    ];

    const overallLabel = overall.signalCount > 0 ? overall.label : null;
    const overallColor = !overallLabel ? "hidden"
        : overallLabel === "STRONG BUY" ? "bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.6)]"
            : overallLabel === "WEAK BUY" ? "bg-green-500"
                : overallLabel === "STRONG SELL" ? "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.6)]"
                    : overallLabel === "WEAK SELL" ? "bg-red-500"
                        : "bg-gray-500";

    return (
        <>
            <div className="container py-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold text-gray-100">T/A</h1>
                    <div className="flex items-center gap-2">
                        <TATimeframes />
                        <TAIndicatorsButton />
                        <TAStrategiesButton
                            userId={userId}
                            candles={candles}
                            allData={{
                                rsiData, cciData, waveTrendData, macdData, stochRsiData,
                                dmiData, smiData,
                                aoData: aoData ?? undefined,
                                mfiData: mfiData ? { mfi: mfiData.mfi } : undefined,
                                wprData: wprData ?? undefined,
                                diData: diData ?? undefined,
                                cmfData: cmfData ?? undefined,
                                adData: adData ?? undefined,
                                nvData: nvData ?? undefined,
                                madrData: madrData ?? undefined,
                                almaData: almaData ?? undefined,
                                bbData,
                            }}
                            interval={intervalParam}
                            symbol={symbol || ""}
                        />
                        <TAIndicatorSettings />
                        <TASearch initialStocks={initialStocks} />
                    </div>
                </div>

                {symbol ? (
                    <ErrorBoundary>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <StockLogo symbol={symbol} />
                                    <span className="text-white font-medium text-lg">{symbol}</span>
                                    <span>— Candlestick</span>
                                </div>
                                {overallLabel && (
                                    <div className={`px-4 py-1.5 rounded-md text-sm font-bold text-white tracking-wide transition-all ${overallColor}`}>
                                        {overallLabel}
                                    </div>
                                )}
                            </div>

                            {candles && candles.length > 0 ? (
                                <CandleChartSection
                                    data={candles}
                                    height={560}
                                    almaData={almaData}
                                    almaStyleConfig={{ color: ip.almaColor, opacity: ip.almaOpacity, width: ip.almaWidth, style: ip.almaStyle }}
                                    bbData={activeIndicators.has("bb") ? bbData : undefined}
                                    bbStyleConfig={{ color: ip.bbColor, opacity: ip.bbOpacity, width: ip.bbWidth }}
                                    candlePatterns={activeIndicators.has('patterns') ? candlePatternData : undefined}
                                    fractalProjection={activeIndicators.has('fractals') && fractalResult ? fractalResult.projectedLine : undefined}
                                    srLevels={activeIndicators.has('sr') && srResult ? srResult.levels : undefined}
                                    tradeMarkers={tradeMarkers}
                                    availableToggles={overlayToggles}
                                />
                            ) : (
                                <TradingViewWidget
                                    scriptUrl={`${scriptBase}advanced-chart.js`}
                                    config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                                    height={560}
                                    className="custom-chart"
                                />
                            )}

                            {activeIndicators.has('patterns') && candles && candles.length > 0 && (
                                <CandlePatternPanel patterns={candlePatternData} interval={intervalParam} />
                            )}

                            {activeIndicators.has('fractals') && candles && candles.length > 0 && (
                                fractalResult
                                    ? <HistoricalFractalsPanel result={fractalResult} interval={intervalParam} />
                                    : <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">
                                        <span className="text-lg font-medium text-gray-200">Historical Fractals</span>
                                        <p className="text-gray-500 text-sm mt-2">Not enough historical data to find similar patterns.</p>
                                    </div>
                            )}

                            {activeIndicators.has('sr') && candles && candles.length > 0 && (
                                srResult
                                    ? <SRPanel result={srResult} />
                                    : <div className="p-4 border border-gray-800 rounded-xl bg-gray-950/20 mt-4">
                                        <span className="text-lg font-medium text-gray-200">Support &amp; Resistance</span>
                                        <p className="text-gray-500 text-sm mt-2">Not enough data to detect levels.</p>
                                    </div>
                            )}

                            {isRsiCciStrategy && rsiData && cciData && (
                                <div className="p-4 border border-violet-800/50 rounded-xl bg-violet-950/10 shadow-[0_0_20px_rgba(139,92,246,0.08)]">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                                            <span className="text-base font-semibold text-violet-200">Strategy: RSI + CCI + WaveTrend</span>
                                            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">3 indicators agree → trade signal</span>
                                        </div>
                                        <StrategyBacktestMonitor strategyName="RSI_CCI_WT" symbol={symbol} interval={intervalParam as Timeframe} candles={candles} rsiData={rsiData} cciData={cciData} waveTrendData={waveTrendData} />
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-xs text-gray-400">
                                        <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">RSI Signal</div>
                                            {rsiData.rsi.length > 0 && rsiData.ma.length > 0 ? (
                                                <span className={`font-semibold text-sm ${rsiData.rsi[rsiData.rsi.length - 1].value! > rsiData.ma[rsiData.ma.length - 1].value! ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                            ) : <span className="text-gray-600">—</span>}
                                        </div>
                                        <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">CCI Signal</div>
                                            {cciData.cci.length > 0 && cciData.ma.length > 0 ? (
                                                <span className={`font-semibold text-sm ${cciData.cci[cciData.cci.length - 1].value! > cciData.ma[cciData.ma.length - 1].value! ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                            ) : <span className="text-gray-600">—</span>}
                                        </div>
                                        <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">WaveTrend Signal</div>
                                            {waveTrendData && waveTrendData.wt1.length > 0 && waveTrendData.wt2.length > 0 ? (
                                                <span className={`font-semibold text-sm ${waveTrendData.wt1[waveTrendData.wt1.length - 1].value! > waveTrendData.wt2[waveTrendData.wt2.length - 1].value! ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                            ) : <span className="text-gray-600">—</span>}
                                        </div>
                                        <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Strategy Decision</div>
                                            {rsiData.rsi.length > 0 && cciData.cci.length > 0 ? (() => {
                                                const rsiBuy = rsiData.rsi[rsiData.rsi.length - 1].value! > rsiData.ma[rsiData.ma.length - 1].value!;
                                                const cciBuy = cciData.cci[cciData.cci.length - 1].value! > cciData.ma[cciData.ma.length - 1].value!;
                                                const wtBuy = waveTrendData && waveTrendData.wt1.length > 0 ? waveTrendData.wt1[waveTrendData.wt1.length - 1].value! > waveTrendData.wt2[waveTrendData.wt2.length - 1].value! : null;
                                                const votes = [rsiBuy, cciBuy, wtBuy].filter(v => v !== null);
                                                const buyCount = votes.filter(v => v === true).length;
                                                const sellCount = votes.filter(v => v === false).length;
                                                if (buyCount === votes.length) return <span className="font-bold text-sm text-emerald-300">✓ BUY</span>;
                                                if (sellCount === votes.length) return <span className="font-bold text-sm text-red-300">✗ SELL</span>;
                                                return <span className="font-semibold text-sm text-yellow-400">⚡ CONFLICT</span>;
                                            })() : <span className="text-gray-600">—</span>}
                                        </div>
                                    </div>
                                    {symbol && (
                                        <ForwardTestCreator
                                            symbol={symbol}
                                            interval={intervalParam}
                                            strategyName="RSI_CCI_WT"
                                            indicators={['rsi', 'cci', 'wavetrend']}
                                            userId={userId}
                                        />
                                    )}
                                </div>
                            )}

                            {search.telemetry === "1" && symbol && (
                                <MarketTelemetryPanel symbol={symbol || ""} interval={intervalParam} years={yearsParam} />
                            )}

                            <CustomStrategyPanel
                                candles={candles}
                                allData={{ rsiData, cciData, waveTrendData, macdData, stochRsiData, dmiData, smiData, aoData: aoData ? (aoData as TimePoint[]) : undefined, mfiData: mfiData ? { mfi: mfiData.mfi } : undefined, wprData: wprData ? (wprData as TimePoint[]) : undefined, diData: diData ? (diData as TimePoint[]) : undefined, cmfData: cmfData ? (cmfData as TimePoint[]) : undefined, adData: adData ? { ad: adData.ad as TimePoint[], ma: adData.ma as TimePoint[] } : undefined, nvData: nvData ? (nvData as TimePoint[]) : undefined, madrData: madrData ? (madrData as TimePoint[]) : undefined, almaData: almaData ? (almaData as TimePoint[]) : undefined, bbData }}
                                symbol={symbol || ""}
                                interval={(intervalParam as "1d" | "4h") || "1d"}
                                userId={userId || ""}
                            />

                            {CHART_ITEMS.filter(item => item.data && activeIndicators.has(item.key)).map(item => (
                                <IndicatorSection key={item.key} displayName={item.name} signalLabel={signalLabels[item.key]} backtestName={item.btName} candles={candles} data={item.data}>
                                    <item.Chart {...item.chartProps(item.data)} />
                                </IndicatorSection>
                            ))}
                        </div>
                    </ErrorBoundary>
                ) : (
                    <div className="text-gray-400">Use the Search button to choose a brand and view its candlestick chart.</div>
                )}
            </div>
        </>
    );
};

export default TAPage;
