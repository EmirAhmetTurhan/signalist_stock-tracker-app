import dynamicImport from "next/dynamic";
import TASearch from "@/components/ta/TASearch";
import TAIndicatorsButton from "@/components/ta/TAIndicatorsButton";
import TAIntervalButton from "@/components/ta/TAIntervalButton";
import TAIndicatorSettings from "@/components/ta/TAIndicatorSettings";

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
import BacktestMonitor from "@/components/panels/BacktestMonitor";
import TAStrategiesButton from "@/components/ta/TAStrategiesButton";
import StrategyBacktestMonitor from "@/components/panels/StrategyBacktestMonitor";
import CustomStrategyPanel from "@/components/panels/CustomStrategyPanel";
import CandlePatternPanel from "@/components/panels/CandlePatternPanel";
import HistoricalFractalsPanel from "@/components/panels/HistoricalFractalsPanel";
import SRPanel from "@/components/panels/SRPanel";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { searchStocks, getDailyCandles, get4HourCandles, fetchJSON } from "@/lib/actions/finnhub.actions";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { computeIndicators, parseActiveIndicators, generateAllSignals } from "@/lib/ta";
import type { ComputedIndicators } from "@/lib/ta";
import { SIGNAL_STYLES } from "@/lib/ta";

export const dynamic = 'force-dynamic';

type TAProps = {
    searchParams?: Promise<{ symbol?: string }>;
};

const TAPage = async (props: TAProps) => {
    const initialStocks = await searchStocks();
    const search = (await props.searchParams) || {};
    const symbol = (search.symbol || "").toUpperCase();
    const indParam = String((search as any).ind || "");
    const intervalParam = String((search as any).interval || "1d");
    const strategyParam = String((search as any).strategy || "");
    const isRsiCciStrategy = strategyParam === "rsi_cci_wt";

    const macdFast = Number((search as any).macd_fast) || 12;
    const macdSlow = Number((search as any).macd_slow) || 26;
    const macdSig = Number((search as any).macd_sig) || 9;
    const stochRsiLen = Number((search as any).stoch_rsi_len) || 14;
    const stochLen = Number((search as any).stoch_len) || 14;
    const stochK = Number((search as any).stoch_k) || 3;
    const stochD = Number((search as any).stoch_d) || 3;
    const wtAvgLen = Number((search as any).wt_avg_len) || 10;
    const wtChannelLen = Number((search as any).wt_channel_len) || 21;
    const wtMaLen = Number((search as any).wt_ma_len) || 4;
    const dmiDiLen = Number((search as any).dmi_di_len) || 14;
    const dmiAdxSmooth = Number((search as any).dmi_adx_smooth) || 14;
    const mfiPeriod = Number((search as any).mfi_period) || 14;
    const smiLongLen = Number((search as any).smi_long_len) || 20;
    const smiShortLen = Number((search as any).smi_short_len) || 5;
    const smiSigLen = Number((search as any).smi_sig_len) || 5;
    const rsiLen = Number((search as any).rsi_len) || 14;
    const rsiMaLen = Number((search as any).rsi_ma_len) || 14;
    const cciLen = Number((search as any).cci_len) || 20;
    const cciMaLen = Number((search as any).cci_ma_len) || 14;
    const wprLen = Number((search as any).wpr_len) || 14;
    const diLen = Number((search as any).di_len) || 10;
    const diSmooth = Number((search as any).di_smooth) || 10;
    const diK = Number((search as any).di_k) || 2;
    const cmfLen = Number((search as any).cmf_len) || 20;
    const madrLen = Number((search as any).madr_len) || 21;

    const almaLen = Number((search as any).alma_len) || 9;
    const almaOffset = Number((search as any).alma_offset) || 0.85;
    const almaSigma = Number((search as any).alma_sigma) || 6;
    const almaColor = (search as any).alma_color || "#fbbf24";
    const almaOpacity = Number((search as any).alma_opacity ?? 100);
    const almaWidth = Number((search as any).alma_width || 2);
    const almaStyle = Number((search as any).alma_style || 0);

    const bbLen = Number((search as any).bb_len) || 20;
    const bbStdDev = Number((search as any).bb_stddev) || 2;
    const bbOffset = Number((search as any).bb_offset) || 0;
    const bbColor = (search as any).bb_color || "#3b82f6";
    const bbOpacity = Number((search as any).bb_opacity ?? 100);
    const bbWidth = Number((search as any).bb_width || 1);

    const candles: CandleDataPoint[] = symbol
        ? (intervalParam === "4h" ? await get4HourCandles(symbol, 3650) : await getDailyCandles(symbol, 3650))
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

    const overallLabel = overall.signalCount > 0 ? overall.label : null;
    const overallColor = !overallLabel ? "hidden"
        : overallLabel === "STRONG BUY" ? "bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.6)]"
        : overallLabel === "WEAK BUY" ? "bg-green-500"
        : overallLabel === "STRONG SELL" ? "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.6)]"
        : overallLabel === "WEAK SELL" ? "bg-red-500"
        : "bg-gray-500";

    let logoUrl: string | undefined = undefined;
    if (symbol) {
        const token = process.env.FINNHUB_API_KEY || '';
        if (token) {
            try {
                const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
                const prof = await fetchJSON<{ logo?: string }>(profileUrl, 3600);
                logoUrl = typeof prof?.logo === 'string' && prof.logo ? prof.logo : undefined;
            } catch { }
        }
    }

    return (
        <>
        <div className="container py-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-100">T/A</h1>
                <div className="flex items-center gap-2">
                    <TAIndicatorsButton />
                    <TAStrategiesButton />
                    <TAIntervalButton />
                    <TAIndicatorSettings />
                    <TASearch initialStocks={initialStocks} />
                </div>
            </div>

            {symbol ? (
                <ErrorBoundary>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="text-gray-400 flex items-center gap-2">
                            <div className="h-6 w-6 rounded bg-gray-700/60 flex items-center justify-center overflow-hidden">
                                {logoUrl ? (
                                    <img src={logoUrl} alt={`${symbol} logo`} className="h-full w-full object-contain p-0.5" />
                                ) : (
                                    <span className="text-white text-xs font-semibold">{symbol.slice(0, 1)}</span>
                                )}
                            </div>
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
                                        <span className={`font-semibold text-sm ${rsiData.rsi[rsiData.rsi.length - 1].value > rsiData.ma[rsiData.ma.length - 1].value ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                    ) : <span className="text-gray-600">—</span>}
                                </div>
                                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">CCI Signal</div>
                                    {cciData.cci.length > 0 && cciData.ma.length > 0 ? (
                                        <span className={`font-semibold text-sm ${cciData.cci[cciData.cci.length - 1].value > cciData.ma[cciData.ma.length - 1].value ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                    ) : <span className="text-gray-600">—</span>}
                                </div>
                                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">WaveTrend Signal</div>
                                    {waveTrendData && waveTrendData.wt1.length > 0 && waveTrendData.wt2.length > 0 ? (
                                        <span className={`font-semibold text-sm ${waveTrendData.wt1[waveTrendData.wt1.length - 1].value > waveTrendData.wt2[waveTrendData.wt2.length - 1].value ? 'text-emerald-400' : 'text-red-400'}`}>▲ BUY</span>
                                    ) : <span className="text-gray-600">—</span>}
                                </div>
                                <div className="bg-gray-900/60 rounded-lg p-2.5 border border-gray-800">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Strategy Decision</div>
                                    {rsiData.rsi.length > 0 && cciData.cci.length > 0 ? (() => {
                                        const rsiBuy = rsiData.rsi[rsiData.rsi.length - 1].value > rsiData.ma[rsiData.ma.length - 1].value;
                                        const cciBuy = cciData.cci[cciData.cci.length - 1].value > cciData.ma[cciData.ma.length - 1].value;
                                        const wtBuy = waveTrendData && waveTrendData.wt1.length > 0 ? waveTrendData.wt1[waveTrendData.wt1.length - 1].value > waveTrendData.wt2[waveTrendData.wt2.length - 1].value : null;
                                        const votes = [rsiBuy, cciBuy, wtBuy].filter(v => v !== null);
                                        const buyCount = votes.filter(v => v === true).length;
                                        const sellCount = votes.filter(v => v === false).length;
                                        if (buyCount === votes.length) return <span className="font-bold text-sm text-emerald-300">✓ BUY</span>;
                                        if (sellCount === votes.length) return <span className="font-bold text-sm text-red-300">✗ SELL</span>;
                                        return <span className="font-semibold text-sm text-yellow-400">⚡ CONFLICT</span>;
                                    })() : <span className="text-gray-600">—</span>}
                                </div>
                            </div>
                        </div>
                    )}

                    <CustomStrategyPanel candles={candles} allData={{ rsiData, cciData, waveTrendData, macdData, stochRsiData, dmiData, smiData, aoData: aoData ? (aoData as { time: string | number; value: number }[]) : undefined, mfiData: mfiData ? { mfi: mfiData.mfi } : undefined, wprData: wprData ? (wprData as { time: string | number; value: number }[]) : undefined, diData: diData ? (diData as { time: string | number; value: number }[]) : undefined, cmfData: cmfData ? (cmfData as { time: string | number; value: number }[]) : undefined, adData: adData ? (adData as { time: string | number; value: number }[]) : undefined, nvData: nvData ? (nvData as { time: string | number; value: number }[]) : undefined, madrData: madrData ? (madrData as { time: string | number; value: number }[]) : undefined, almaData: almaData ? (almaData as { time: string | number; value: number }[]) : undefined, bbData }} />

                    {activeIndicators.has('macd') && macdData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`MACD (${macdFast}, ${macdSlow}, ${macdSig})`}</span>
                                    {signalLabels["macd"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["macd"]]}`}>{signalLabels["macd"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="MACD" candles={candles} data={macdData} />
                            </div>
                            <LightweightMACDChart macd={macdData.macd} signal={macdData.signal} histogram={macdData.histogram} />
                        </div>
                    )}
                    {activeIndicators.has('rsi') && rsiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`RSI (${rsiLen}, ${rsiMaLen})`}</span>
                                    {signalLabels["rsi"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["rsi"]]}`}>{signalLabels["rsi"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="RSI" candles={candles} data={rsiData} />
                            </div>
                            <LightweightRSIChart rsi={rsiData.rsi} ma={rsiData.ma} />
                        </div>
                    )}
                    {activeIndicators.has('stochrsi') && stochRsiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`Stoch RSI (${stochRsiLen}, ${stochLen}, ${stochK}, ${stochD})`}</span>
                                    {signalLabels["stochrsi"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["stochrsi"]]}`}>{signalLabels["stochrsi"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="STOCHRSI" candles={candles} data={stochRsiData} />
                            </div>
                            <LightweightStochRSIChart k={stochRsiData.k} d={stochRsiData.d} />
                        </div>
                    )}
                    {activeIndicators.has('wavetrend') && waveTrendData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`WaveTrend (${wtAvgLen}, ${wtChannelLen}, ${wtMaLen})`}</span>
                                    {signalLabels["wavetrend"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["wavetrend"]]}`}>{signalLabels["wavetrend"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="WAVETREND" candles={candles} data={waveTrendData} />
                            </div>
                            <LightweightWaveTrendChart wt1={waveTrendData.wt1} wt2={waveTrendData.wt2} crosses={waveTrendData.crosses} />
                        </div>
                    )}
                    {activeIndicators.has('dmi') && dmiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`DMI (${dmiDiLen}, ${dmiAdxSmooth})`}</span>
                                    {signalLabels["dmi"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["dmi"]]}`}>{signalLabels["dmi"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="DMI" candles={candles} data={dmiData} />
                            </div>
                            <LightweightDMIChart plusDI={dmiData.plusDI} minusDI={dmiData.minusDI} adx={dmiData.adx} />
                        </div>
                    )}
                    {activeIndicators.has('mfi') && mfiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`MFI (${mfiPeriod})`}</span>
                                    {signalLabels["mfi"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["mfi"]]}`}>{signalLabels["mfi"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="MFI" candles={candles} data={mfiData} />
                            </div>
                            <LightweightMFIChart mfi={mfiData.mfi} />
                        </div>
                    )}
                    {activeIndicators.has('smi') && smiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`SMI (${smiLongLen}, ${smiShortLen}, ${smiSigLen})`}</span>
                                    {signalLabels["smi"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["smi"]]}`}>{signalLabels["smi"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="SMI" candles={candles} data={smiData} />
                            </div>
                            <LightweightSMIChart smi={smiData.smi} signal={smiData.signal} histogram={smiData.histogram} />
                        </div>
                    )}
                    {activeIndicators.has('ao') && aoData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">Awesome Oscillator</span>
                                    {signalLabels["ao"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["ao"]]}`}>{signalLabels["ao"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="AO" candles={candles} data={aoData} />
                            </div>
                            <LightweightAOChart data={aoData} />
                        </div>
                    )}
                    {activeIndicators.has('cci') && cciData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`CCI (${cciLen}, ${cciMaLen})`}</span>
                                    {signalLabels["cci"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["cci"]]}`}>{signalLabels["cci"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="CCI" candles={candles} data={cciData} />
                            </div>
                            <LightweightCCIChart cci={cciData.cci} ma={cciData.ma} />
                        </div>
                    )}
                    {activeIndicators.has('wpr') && wprData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`Williams %R (${wprLen})`}</span>
                                    {signalLabels["wpr"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["wpr"]]}`}>{signalLabels["wpr"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="WPR" candles={candles} data={wprData} />
                            </div>
                            <LightweightWPRChart data={wprData} />
                        </div>
                    )}
                    {activeIndicators.has('di') && diData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`Demand Index (${diLen}, ${diK}, ${diSmooth})`}</span>
                                    {signalLabels["di"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["di"]]}`}>{signalLabels["di"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="DI" candles={candles} data={diData} />
                            </div>
                            <LightweightDIChart data={diData} />
                        </div>
                    )}
                    {activeIndicators.has('cmf') && cmfData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`CMF (${cmfLen})`}</span>
                                    {signalLabels["cmf"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["cmf"]]}`}>{signalLabels["cmf"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="CMF" candles={candles} data={cmfData} />
                            </div>
                            <LightweightCMFChart data={cmfData} />
                        </div>
                    )}
                    {activeIndicators.has('ad') && adData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">A/D</span>
                                    {signalLabels["ad"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["ad"]]}`}>{signalLabels["ad"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="AD" candles={candles} data={adData} />
                            </div>
                            <LightweightADChart data={adData} />
                        </div>
                    )}
                    {activeIndicators.has('netvol') && nvData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">Net Volume</span>
                                    {signalLabels["netvol"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["netvol"]]}`}>{signalLabels["netvol"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="NETVOL" candles={candles} data={nvData} />
                            </div>
                            <LightweightNetVolumeChart data={nvData} />
                        </div>
                    )}
                    {activeIndicators.has('madr') && madrData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`MADR (${madrLen})`}</span>
                                    {signalLabels["madr"] && (<span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["madr"]]}`}>{signalLabels["madr"]}</span>)}
                                </div>
                                <BacktestMonitor indicatorName="MADR" candles={candles} data={madrData} />
                            </div>
                            <LightweightMADRChart data={madrData} />
                        </div>
                    )}
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
