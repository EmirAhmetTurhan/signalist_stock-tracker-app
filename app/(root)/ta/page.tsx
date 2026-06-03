import dynamicImport from "next/dynamic";
import { redirect } from "next/navigation";
import TASearch from "@/components/ta/TASearch";
import TAIndicatorsButton from "@/components/ta/TAIndicatorsButton";
import TATimeframes from "@/components/ta/TATimeframes";
import TAIndicatorSettings from "@/components/ta/TAIndicatorSettings";
import StockLogo from "@/components/ta/StockLogo";
import { auth } from "@/lib/better-auth/auth";
import { headers } from "next/headers";
import ForwardTestCreator from "@/components/portfolio/ForwardTestCreator";
import { triggerOptimization } from "@/lib/actions/optimize.actions";

// Canvas tabanlı chart bileşenleri SSR'da çalışamaz — next/dynamic ile lazy-load
const LightweightCandleChart = dynamicImport(() => import("@/components/charts/LightweightCandleChart"));
const LightweightMACDChart = dynamicImport(() => import("@/components/charts/LightweightMACDChart"));
const LightweightStochRSIChart = dynamicImport(() => import("@/components/charts/LightweightStochRSIChart"));
const LightweightWaveTrendChart = dynamicImport(() => import("@/components/charts/LightweightWaveTrendChart"));
const LightweightDMIChart = dynamicImport(() => import("@/components/charts/LightweightDMIChart"));
const LightweightMFIChart = dynamicImport(() => import("@/components/charts/LightweightMFIChart"));
const LightweightSMIChart = dynamicImport(() => import("@/components/charts/LightweightSMIChart"));
const LightweightAOChart = dynamicImport(() => import("@/components/charts/LightweightAOChart"));
const LightweightRSIChart = dynamicImport(() => import("@/components/charts/LightweightRSIChart"));
const LightweightCCIChart = dynamicImport(() => import("@/components/charts/LightweightCCIChart"));
const LightweightWPRChart = dynamicImport(() => import("@/components/charts/LightweightWPRChart"));
const LightweightDIChart = dynamicImport(() => import("@/components/charts/LightweightDIChart"));
const LightweightCMFChart = dynamicImport(() => import("@/components/charts/LightweightCMFChart"));
const LightweightADChart = dynamicImport(() => import("@/components/charts/LightweightADChart"));
const LightweightNetVolumeChart = dynamicImport(() => import("@/components/charts/LightweightNetVolumeChart"));
const LightweightMADRChart = dynamicImport(() => import("@/components/charts/LightweightMADRChart"));
import TradingViewWidget from "@/components/charts/TradingViewWidget";
import IndicatorSection from "@/components/ta/IndicatorSection";
import TAStrategiesButton from "@/components/ta/TAStrategiesButton";
import StrategyBacktestMonitor from "@/components/panels/StrategyBacktestMonitor";
import CustomStrategyPanel from "@/components/panels/CustomStrategyPanel";
import CandlePatternPanel from "@/components/panels/CandlePatternPanel";
import HistoricalFractalsPanel from "@/components/panels/HistoricalFractalsPanel";
import SRPanel from "@/components/panels/SRPanel";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { searchStocks, getCandlesForInterval } from "@/lib/actions/finnhub.actions";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { computeIndicators, parseActiveIndicators, generateAllSignals } from "@/lib/ta";
import type { ComputedIndicators } from "@/lib/ta";
import { INDICATOR_PARAMS } from "@/lib/constants/indicator-params";
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

    // ── Apply & Optimize: run synchronous optimization and apply results ──────
    const optimizeParam = search.optimize;
    if (optimizeParam === '1' && symbol && indParam) {
        const indicators = indParam.split(',').filter(Boolean);

        // Run synchronous optimization (awaits candle fetch + brute-force loop)
        const results = await triggerOptimization(symbol, indicators, intervalParam, yearsParam);

        // Build URL params with optimized values applied
        const cleanParams = new URLSearchParams();
        for (const [key, value] of Object.entries(search)) {
            if (key !== 'optimize' && value) {
                cleanParams.set(key, value);
            }
        }

        // Write each optimized parameter value to the URL
        for (const r of results) {
            cleanParams.set(r.paramName, r.bestVal.toString());
        }

        const qs = cleanParams.toString();
        redirect(`/ta${qs ? `?${qs}` : ''}`);
    }

    // Extract params from shared registry — single source of truth
    const params: Record<string, number | string> = {};
    for (const paramDef of INDICATOR_PARAMS) {
        const raw = search[paramDef.key];
        // Numeric params: use defaultNum, string params: use raw value or defaultStr
        if (paramDef.defaultStr.includes('.')) {
            // Float param (e.g. alma_offset, bb_stddev)
            params[paramDef.key] = raw !== undefined ? Number(raw) || paramDef.defaultNum : paramDef.defaultNum;
        } else if (paramDef.key.endsWith('_color') || paramDef.key.endsWith('_style')) {
            // String/display params
            params[paramDef.key] = raw || paramDef.defaultStr;
        } else {
            // Integer param
            params[paramDef.key] = raw !== undefined ? Number(raw) || paramDef.defaultNum : paramDef.defaultNum;
        }
    }

    // ── Apply discovered params from URL (p) ─────────────────────────────────
    // The "p" param is a JSON string of indicator param overrides, e.g.
    // {"rsi_len":7,"cci_len":14} — set by TAStrategiesButton when a discovered
    // strategy with optimized params is applied.
    const pParam = search.p;
    if (pParam) {
        try {
            const discoveredOverrides = JSON.parse(pParam) as Record<string, number>;
            for (const [key, value] of Object.entries(discoveredOverrides)) {
                if (params[key] !== undefined && typeof value === 'number') {
                    params[key] = value;
                }
            }
        } catch {
            // Invalid JSON in p param — silently ignore
            console.warn('[TAPage] Invalid p param:', pParam);
        }
    }

    const macdFast = params.macd_fast as number;
    const macdSlow = params.macd_slow as number;
    const macdSig = params.macd_sig as number;
    const stochRsiLen = params.stoch_rsi_len as number;
    const stochLen = params.stoch_len as number;
    const stochK = params.stoch_k as number;
    const stochD = params.stoch_d as number;
    const wtAvgLen = params.wt_avg_len as number;
    const wtChannelLen = params.wt_channel_len as number;
    const wtMaLen = params.wt_ma_len as number;
    const dmiDiLen = params.dmi_di_len as number;
    const dmiAdxSmooth = params.dmi_adx_smooth as number;
    const mfiPeriod = params.mfi_period as number;
    const smiLongLen = params.smi_long_len as number;
    const smiShortLen = params.smi_short_len as number;
    const smiSigLen = params.smi_sig_len as number;
    const rsiLen = params.rsi_len as number;
    const rsiMaLen = params.rsi_ma_len as number;
    const cciLen = params.cci_len as number;
    const cciMaLen = params.cci_ma_len as number;
    const wprLen = params.wpr_len as number;
    const diLen = params.di_len as number;
    const diSmooth = params.di_smooth as number;
    const diK = params.di_k as number;
    const cmfLen = params.cmf_len as number;
    const madrLen = params.madr_len as number;
    const almaLen = params.alma_len as number;
    const almaOffset = params.alma_offset as number;
    const almaSigma = params.alma_sigma as number;
    const almaColor = params.alma_color as string;
    const almaOpacity = params.alma_opacity as number;
    const almaWidth = params.alma_width as number;
    const almaStyle = params.alma_style as number;
    const bbLen = params.bb_len as number;
    const bbStdDev = params.bb_stddev as number;
    const bbOffset = params.bb_offset as number;
    const bbColor = params.bb_color as string;
    const bbOpacity = params.bb_opacity as number;
    const bbWidth = params.bb_width as number;

    // SPRINT 3: inline yıl->gün dönüşümü
    const requestedDays = yearsParam ? yearsParam * 365 : undefined;

    const candles: CandleDataPoint[] = symbol
        ? await (() => {
            // SPRINT 3: inline clamp — 4h/1d max 10 yıl (3650 gün)
            const days = Math.min(requestedDays ?? 3650, 3650);
            return getCandlesForInterval(symbol, intervalParam, days);
        })()
        : [];
    const scriptBase = "https://s3.tradingview.com/external-embedding/embed-widget-";

    const activeIndicators = parseActiveIndicators(indParam);
    if (isRsiCciStrategy) {
        activeIndicators.add('rsi');
        activeIndicators.add('cci');
        activeIndicators.add('wavetrend');
    }

    // All indicator computation delegated to lib/ta/ service layer
    const computed: ComputedIndicators = computeIndicators(candles, activeIndicators, {
        macdFast, macdSlow, macdSig,
        stochRsiLen, stochLen, stochK, stochD,
        wtAvgLen, wtChannelLen, wtMaLen,
        dmiDiLen, dmiAdxSmooth,
        mfiPeriod,
        smiLongLen, smiShortLen, smiSigLen,
        rsiLen, rsiMaLen,
        cciLen, cciMaLen,
        wprLen,
        diLen, diSmooth, diK,
        cmfLen,
        madrLen,
        almaLen, almaOffset, almaSigma,
        almaColor, almaOpacity, almaWidth, almaStyle,
        bbLen, bbStdDev, bbOffset,
        bbColor, bbOpacity, bbWidth,
    });

    const { signals: signalLabels, overall } = generateAllSignals(computed, candles);

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
        { key: 'macd', data: macdData, name: `MACD (${macdFast}, ${macdSlow}, ${macdSig})`, btName: 'MACD', Chart: LightweightMACDChart, chartProps: (d) => ({ macd: d.macd, signal: d.signal, histogram: d.histogram }) },
        { key: 'rsi', data: rsiData, name: `RSI (${rsiLen}, ${rsiMaLen})`, btName: 'RSI', Chart: LightweightRSIChart, chartProps: (d) => ({ rsi: d.rsi, ma: d.ma }) },
        { key: 'stochrsi', data: stochRsiData, name: `Stoch RSI (${stochRsiLen}, ${stochLen}, ${stochK}, ${stochD})`, btName: 'STOCHRSI', Chart: LightweightStochRSIChart, chartProps: (d) => ({ k: d.k, d: d.d }) },
        { key: 'wavetrend', data: waveTrendData, name: `WaveTrend (${wtAvgLen}, ${wtChannelLen}, ${wtMaLen})`, btName: 'WAVETREND', Chart: LightweightWaveTrendChart, chartProps: (d) => ({ wt1: d.wt1, wt2: d.wt2, crosses: d.crosses }) },
        { key: 'dmi', data: dmiData, name: `DMI (${dmiDiLen}, ${dmiAdxSmooth})`, btName: 'DMI', Chart: LightweightDMIChart, chartProps: (d) => ({ plusDI: d.plusDI, minusDI: d.minusDI, adx: d.adx }) },
        { key: 'mfi', data: mfiData, name: `MFI (${mfiPeriod})`, btName: 'MFI', Chart: LightweightMFIChart, chartProps: (d) => ({ mfi: d.mfi }) },
        { key: 'smi', data: smiData, name: `SMI (${smiLongLen}, ${smiShortLen}, ${smiSigLen})`, btName: 'SMI', Chart: LightweightSMIChart, chartProps: (d) => ({ smi: d.smi, signal: d.signal, histogram: d.histogram }) },
        { key: 'ao', data: aoData, name: 'Awesome Oscillator', btName: 'AO', Chart: LightweightAOChart, chartProps: (d) => ({ data: d }) },
        { key: 'cci', data: cciData, name: `CCI (${cciLen}, ${cciMaLen})`, btName: 'CCI', Chart: LightweightCCIChart, chartProps: (d) => ({ cci: d.cci, ma: d.ma }) },
        { key: 'wpr', data: wprData, name: `Williams %R (${wprLen})`, btName: 'WPR', Chart: LightweightWPRChart, chartProps: (d) => ({ data: d }) },
        { key: 'di', data: diData, name: `Demand Index (${diLen}, ${diK}, ${diSmooth})`, btName: 'DI', Chart: LightweightDIChart, chartProps: (d) => ({ data: d }) },
        { key: 'cmf', data: cmfData, name: `CMF (${cmfLen})`, btName: 'CMF', Chart: LightweightCMFChart, chartProps: (d) => ({ data: d }) },
        { key: 'ad', data: adData, name: 'A/D', btName: 'AD', Chart: LightweightADChart, chartProps: (d) => ({ data: d }) },
        { key: 'netvol', data: nvData, name: 'Net Volume', btName: 'NETVOL', Chart: LightweightNetVolumeChart, chartProps: (d) => ({ data: d }) },
        { key: 'madr', data: madrData, name: `MADR (${madrLen})`, btName: 'MADR', Chart: LightweightMADRChart, chartProps: (d) => ({ data: d }) },
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
                                aoData: aoData ? (aoData as any) : undefined,
                                mfiData: mfiData ? { mfi: mfiData.mfi } : undefined,
                                wprData: wprData ? (wprData as any) : undefined,
                                diData: diData ? (diData as any) : undefined,
                                cmfData: cmfData ? (cmfData as any) : undefined,
                                adData: adData ? (adData as any) : undefined,
                                nvData: nvData ? (nvData as any) : undefined,
                                madrData: madrData ? (madrData as any) : undefined,
                                almaData: almaData ? (almaData as any) : undefined,
                                bbData,
                            } as any}
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
                                <LightweightCandleChart
                                    data={candles}
                                    height={560}
                                    almaData={almaData}
                                    almaStyleConfig={{ color: almaColor, opacity: almaOpacity, width: almaWidth, style: almaStyle }}
                                    bbData={activeIndicators.has("bb") ? bbData : undefined}
                                    bbStyleConfig={{ color: bbColor, opacity: bbOpacity, width: bbWidth }}
                                    candlePatterns={activeIndicators.has('patterns') ? candlePatternData : undefined}
                                    fractalProjection={activeIndicators.has('fractals') && fractalResult ? fractalResult.projectedLine : undefined}
                                    srLevels={activeIndicators.has('sr') && srResult ? srResult.levels : undefined}
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
                                        <StrategyBacktestMonitor strategyName="RSI_CCI_WT" candles={candles} rsiData={rsiData} cciData={cciData} waveTrendData={waveTrendData} />
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

                            <CustomStrategyPanel
                                candles={candles}
                                allData={{ rsiData, cciData, waveTrendData, macdData, stochRsiData, dmiData, smiData, aoData: aoData ? (aoData as { time: string | number; value: number }[]) : undefined, mfiData: mfiData ? { mfi: mfiData.mfi } : undefined, wprData: wprData ? (wprData as { time: string | number; value: number }[]) : undefined, diData: diData ? (diData as { time: string | number; value: number }[]) : undefined, cmfData: cmfData ? (cmfData as { time: string | number; value: number }[]) : undefined, adData: adData ? (adData as { time: string | number; value: number }[]) : undefined, nvData: nvData ? (nvData as { time: string | number; value: number }[]) : undefined, madrData: madrData ? (madrData as { time: string | number; value: number }[]) : undefined, almaData: almaData ? (almaData as { time: string | number; value: number }[]) : undefined, bbData }}
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
