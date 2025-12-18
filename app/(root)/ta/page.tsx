import TASearch from "@/components/TASearch";
import TAIndicatorsButton from "@/components/TAIndicatorsButton";
import LightweightCandleChart from "@/components/LightweightCandleChart";
import LightweightMACDChart from "@/components/LightweightMACDChart";
import LightweightStochRSIChart from "@/components/LightweightStochRSIChart";
import LightweightWaveTrendChart from "@/components/LightweightWaveTrendChart";
import LightweightDMIChart from "@/components/LightweightDMIChart";
import LightweightMFIChart from "@/components/LightweightMFIChart";
import LightweightSMIChart from "@/components/LightweightSMIChart";
import LightweightAOChart from "@/components/LightweightAOChart";
import LightweightRSIChart from "@/components/LightweightRSIChart";
import LightweightCCIChart from "@/components/LightweightCCIChart";
import LightweightWPRChart from "@/components/LightweightWPRChart";
import LightweightDIChart from "@/components/LightweightDIChart";
import LightweightCMFChart from "@/components/LightweightCMFChart";
import LightweightADChart from "@/components/LightweightADChart";
import LightweightNetVolumeChart from "@/components/LightweightNetVolumeChart";
import LightweightMADRChart from "@/components/LightweightMADRChart";
import TAIndicatorSettings from "@/components/TAIndicatorSettings";
import TradingViewWidget from "@/components/TradingViewWidget";
import BacktestMonitor from "@/components/BacktestMonitor";
import { searchStocks, getDailyCandles, fetchJSON } from "@/lib/actions/finnhub.actions";
import { CANDLE_CHART_WIDGET_CONFIG } from "@/lib/constants";
import { computeMACD } from "@/lib/indicators/macd";
import { computeStochRSI } from "@/lib/indicators/stochrsi";
import { computeWaveTrend } from "@/lib/indicators/wavetrend";
import { computeDMI } from "@/lib/indicators/dmi";
import { computeMFI } from "@/lib/indicators/mfi";
import { computeSMI } from "@/lib/indicators/smi";
import { computeAO } from "@/lib/indicators/ao";
import { computeRSI } from "@/lib/indicators/rsi";
import { computeCCI } from "@/lib/indicators/cci";
import { computeWPR } from "@/lib/indicators/wpr";
import { computeDemandIndex } from "@/lib/indicators/demand_index";
import { computeCMF } from "@/lib/indicators/cmf";
import { computeAD } from "@/lib/indicators/ad";
import { computeNetVolume } from "@/lib/indicators/net_volume";
import { computeMADR } from "@/lib/indicators/madr";

export const dynamic = 'force-dynamic';

type TAProps = {
    searchParams?: Promise<{ symbol?: string }>;
};

type SignalLabel = "STRONG BUY" | "WEAK BUY" | "STRONG SELL" | "WEAK SELL" | "NEUTRAL";

const SIGNAL_STYLES = {
    "STRONG BUY": "bg-green-900/40 text-green-300 border border-green-700",
    "WEAK BUY": "bg-green-900/20 text-green-300/80 border border-green-700/60",
    "STRONG SELL": "bg-red-900/40 text-red-300 border border-red-700",
    "WEAK SELL": "bg-red-900/20 text-red-300/80 border border-red-700/60",
    "NEUTRAL": "bg-gray-800 text-gray-400 border border-gray-700"
};

const calculateSMA = (data: number[], window: number) => {
    if (data.length < window) return null;
    let sum = 0;
    for(let i=0; i<window; i++) sum += data[data.length - 1 - i];
    return sum / window;
};

const TAPage = async (props: TAProps) => {
    const initialStocks = await searchStocks();
    const search = (await props.searchParams) || {};
    const symbol = (search.symbol || "").toUpperCase();
    const indParam = String((search as any).ind || "");

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

    const candles: CandleDataPoint[] = symbol ? await getDailyCandles(symbol, 730) : [];
    const scriptBase = "https://s3.tradingview.com/external-embedding/embed-widget-";

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

    const activeIndicators = new Set(
        indParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    );


    let macdData, stochRsiData, waveTrendData, dmiData, mfiData, smiData, aoData, rsiData, cciData, wprData, diData, cmfData, adData, nvData, madrData;

    const signalLabels: Record<string, SignalLabel> = {};

    let totalScore = 0;
    let signalCount = 0;

    const addSignal = (key: string, label: SignalLabel) => {
        let score = 0;
        if (label === "STRONG BUY") score = 2;
        else if (label === "WEAK BUY") score = 1;
        else if (label === "WEAK SELL") score = -1;
        else if (label === "STRONG SELL") score = -2;

        totalScore += score;
        signalCount++;
        signalLabels[key] = label;
    };

    if (candles.length > 0) {
        // --- MACD ---
        try {
            const macdSeries = computeMACD(candles.map((c) => ({ time: c.time, close: c.close })), macdFast, macdSlow, macdSig);
            macdData = {
                macd: macdSeries.filter((p) => typeof p.macd === 'number').map((p) => ({ time: p.time, value: p.macd as number })),
                signal: macdSeries.filter((p) => typeof p.signal === 'number').map((p) => ({ time: p.time, value: p.signal as number })),
                histogram: macdSeries.filter((p) => typeof p.histogram === 'number').map((p) => ({ time: p.time, value: p.histogram as number, color: (p.histogram as number) >= 0 ? '#0db27a' : '#ef4444' }))
            };

            const hist = macdData.histogram; const mac = macdData.macd; const sig = macdData.signal;
            if (hist.length >= 2) {
                const lastHist = hist[hist.length - 1].value; const prevHist = hist[hist.length - 2].value;
                const lastMacd = mac[mac.length - 1].value; const lastSignal = sig[sig.length - 1].value;

                if (lastMacd > lastSignal) addSignal("macd", lastHist > prevHist ? "STRONG BUY" : "WEAK BUY");
                else if (lastMacd < lastSignal) addSignal("macd", lastHist < prevHist ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- RSI ---
        try {
            const rsiRes = computeRSI(candles.map((c) => ({ time: c.time, close: c.close })), rsiLen, rsiMaLen);
            rsiData = {
                rsi: rsiRes.filter((p) => typeof p.rsi === 'number').map((p) => ({ time: p.time, value: p.rsi as number })),
                ma: rsiRes.filter((p) => typeof p.ma === 'number').map((p) => ({ time: p.time, value: p.ma as number }))
            };
            const rArr = rsiData.rsi; const mArr = rsiData.ma;
            if (rArr.length > 0 && mArr.length > 0) {
                const lastRSI = rArr[rArr.length - 1].value; const lastMA = mArr[mArr.length - 1].value;
                if (lastRSI > lastMA) addSignal("rsi", lastRSI < 30 ? "STRONG BUY" : "WEAK BUY");
                else addSignal("rsi", lastRSI > 70 ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- Stochastic RSI ---
        try {
            const srsi = computeStochRSI(candles.map((c) => ({ time: c.time, close: c.close })), stochRsiLen, stochLen, stochK, stochD);
            stochRsiData = {
                k: srsi.filter((p) => typeof p.k === 'number').map((p) => ({ time: p.time, value: p.k as number })),
                d: srsi.filter((p) => typeof p.d === 'number').map((p) => ({ time: p.time, value: p.d as number }))
            };
            const kArr = stochRsiData.k; const dArr = stochRsiData.d;
            if (kArr.length > 0 && dArr.length > 0) {
                const lastK = kArr[kArr.length - 1].value; const lastD = dArr[dArr.length - 1].value;
                if (lastK > lastD) addSignal("stochrsi", lastK < 20 ? "STRONG BUY" : "WEAK BUY");
                else if (lastK < lastD) addSignal("stochrsi", lastK > 80 ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- WaveTrend ---
        try {
            const wt = computeWaveTrend(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })), wtAvgLen, wtChannelLen, wtMaLen);
            waveTrendData = {
                wt1: wt.filter((p) => typeof p.wt1 === 'number').map((p) => ({ time: p.time, value: p.wt1 as number })),
                wt2: wt.filter((p) => typeof p.wt2 === 'number').map((p) => ({ time: p.time, value: p.wt2 as number })),
                crosses: wt.filter((p) => p.cross === 1 || p.cross === -1).map((p) => ({ time: p.time, cross: p.cross as 1 | -1 }))
            };
            const w1 = waveTrendData.wt1; const w2 = waveTrendData.wt2;
            if (w1.length > 0 && w2.length > 0) {
                const lastW1 = w1[w1.length - 1].value; const lastW2 = w2[w2.length - 1].value;
                if (lastW1 > lastW2) addSignal("wavetrend", lastW1 < -60 ? "STRONG BUY" : "WEAK BUY");
                else if (lastW1 < lastW2) addSignal("wavetrend", lastW1 > 60 ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- DMI ---
        try {
            const dmi = computeDMI(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })), dmiDiLen, dmiAdxSmooth);
            dmiData = {
                plusDI: dmi.filter((p) => typeof p.plusDI === 'number').map((p) => ({ time: p.time, value: p.plusDI as number })),
                minusDI: dmi.filter((p) => typeof p.minusDI === 'number').map((p) => ({ time: p.time, value: p.minusDI as number })),
                adx: dmi.filter((p) => typeof p.adx === 'number').map((p) => ({ time: p.time, value: p.adx as number }))
            };
            const plus = dmiData.plusDI; const minus = dmiData.minusDI; const adx = dmiData.adx;
            if (plus.length > 0 && minus.length > 0 && adx.length > 0) {
                const lPlus = plus[plus.length - 1].value; const lMinus = minus[minus.length - 1].value; const lAdx = adx[adx.length - 1].value;
                if (lPlus > lMinus) addSignal("dmi", lAdx > 20 ? "STRONG BUY" : "WEAK BUY");
                else if (lMinus > lPlus) addSignal("dmi", lAdx > 20 ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- MFI ---
        try {
            const mfiSeries = computeMFI(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })), mfiPeriod);
            mfiData = { mfi: mfiSeries.filter((p) => typeof p.mfi === 'number').map((p) => ({ time: p.time, value: p.mfi as number })) };
            const arr = mfiData.mfi;
            if (arr.length >= 2) {
                const last = arr[arr.length - 1].value; const prev = arr[arr.length - 2].value;
                if (last < 20) addSignal("mfi", "STRONG BUY");
                else if (last > 80) addSignal("mfi", "STRONG SELL");
                else if (last > prev) addSignal("mfi", "WEAK BUY");
                else if (last < prev) addSignal("mfi", "WEAK SELL");
            }
        } catch {}

        // --- SMI ---
        try {
            const smiSeries = computeSMI(candles.map((c) => ({ time: c.time, close: c.close })), smiLongLen, smiShortLen, smiSigLen);
            smiData = {
                smi: smiSeries.filter((p) => typeof p.smi === 'number').map((p) => ({ time: p.time, value: p.smi as number })),
                signal: smiSeries.filter((p) => typeof p.signal === 'number').map((p) => ({ time: p.time, value: p.signal as number })),
                histogram: smiSeries.filter((p) => typeof p.histogram === 'number').map((p) => ({ time: p.time, value: p.histogram as number, color: (p.histogram as number) >= 0 ? '#0db27a' : '#ef4444' }))
            };
            const hist = smiData.histogram; const sLine = smiData.smi; const sigLine = smiData.signal;
            if (hist.length >= 2) {
                const lastHist = hist[hist.length-1].value; const prevHist = hist[hist.length-2].value;
                const lastSmi = sLine[sLine.length-1].value; const lastSig = sigLine[sigLine.length-1].value;
                if(lastSmi > lastSig) addSignal("smi", lastHist > prevHist ? "STRONG BUY" : "WEAK BUY");
                else if(lastSmi < lastSig) addSignal("smi", lastHist < prevHist ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- AO ---
        try {
            aoData = computeAO(candles.map((c) => ({ time: c.time, high: c.high, low: c.low })));
            if(aoData.length >= 2) {
                const curr = aoData[aoData.length-1].value; const prev = aoData[aoData.length-2].value;
                const rising = curr > prev;
                if(curr > 0) addSignal("ao", rising ? "STRONG BUY" : "WEAK SELL");
                else addSignal("ao", !rising ? "STRONG SELL" : "WEAK BUY");
            }
        } catch {}

        // --- CCI ---
        try {
            const cciRes = computeCCI(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })), cciLen, cciMaLen);
            cciData = {
                cci: cciRes.filter((p) => typeof p.cci === 'number').map((p) => ({ time: p.time, value: p.cci as number })),
                ma: cciRes.filter((p) => typeof p.ma === 'number').map((p) => ({ time: p.time, value: p.ma as number }))
            };
            const cArr = cciData.cci; const mArr = cciData.ma;
            if (cArr.length > 0 && mArr.length > 0) {
                const lCCI = cArr[cArr.length - 1].value; const lMA = mArr[mArr.length - 1].value;
                if (lCCI > lMA) addSignal("cci", lCCI < -100 ? "STRONG BUY" : "WEAK BUY");
                else addSignal("cci", lCCI > 100 ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- WPR ---
        try {
            wprData = computeWPR(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })), wprLen);
            if(wprData.length >= 2) {
                const cur = wprData[wprData.length-1].value; const prev = wprData[wprData.length-2].value;
                if(cur < -80) addSignal("wpr", "STRONG BUY");
                else if(cur > -20) addSignal("wpr", "STRONG SELL");
                else addSignal("wpr", cur > prev ? "WEAK BUY" : "WEAK SELL");
            }
        } catch {}

        // --- DI ---
        try {
            diData = computeDemandIndex(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume || 0 })), diLen, diSmooth, diK);
            if(diData.length >= 2) {
                const cur = diData[diData.length-1].value; const prev = diData[diData.length-2].value;
                if(cur > 0) addSignal("di", cur > prev ? "STRONG BUY" : "WEAK BUY");
                else addSignal("di", cur < prev ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- CMF ---
        try {
            cmfData = computeCMF(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })), cmfLen);
            if(cmfData.length > 0) {
                const val = cmfData[cmfData.length-1].value;
                if(val > 0.05) addSignal("cmf", "STRONG BUY");
                else if(val < -0.05) addSignal("cmf", "STRONG SELL");
                else addSignal("cmf", val > 0 ? "WEAK BUY" : "WEAK SELL");
            }
        } catch {}

        // --- AD ---
        try {
            adData = computeAD(candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })));
            if(adData.length > 21) {
                const values = adData.map(d => d.value);
                const cur = values[values.length-1]; const prev = values[values.length-2];
                const curSMA = calculateSMA(values, 21); const prevSMA = calculateSMA(values.slice(0, -1), 21);
                if(curSMA !== null && prevSMA !== null) {
                    if(prev <= prevSMA && cur > curSMA) addSignal("ad", "STRONG BUY");
                    else if(prev >= prevSMA && cur < curSMA) addSignal("ad", "STRONG SELL");
                    else addSignal("ad", cur > curSMA ? "WEAK BUY" : "WEAK SELL");
                }
            }
        } catch {}

        // --- Net Volume ---
        try {
            nvData = computeNetVolume(candles.map((c) => ({ time: c.time, open: c.open, close: c.close, volume: c.volume || 0 })));
            if(nvData.length >= 2) {
                const cur = nvData[nvData.length-1].value; const prev = nvData[nvData.length-2].value;
                if(cur > 0) addSignal("netvol", cur > prev ? "STRONG BUY" : "WEAK BUY");
                else if(cur < 0) addSignal("netvol", cur < prev ? "STRONG SELL" : "WEAK SELL");
            }
        } catch {}

        // --- MADR ---
        try {
            madrData = computeMADR(candles.map((c) => ({ time: c.time, close: c.close })), madrLen);
            if(madrData.length >= 2) {
                const cur = madrData[madrData.length-1].value; const prev = madrData[madrData.length-2].value;
                if(prev < 0 && cur > 0) addSignal("madr", "STRONG BUY");
                else if(prev > 0 && cur < 0) addSignal("madr", "STRONG SELL");
                else addSignal("madr", cur > 0 ? "WEAK BUY" : "WEAK SELL");
            }
        } catch {}
    }


    let overallLabel: SignalLabel | null = null;
    let overallColor = "hidden";

    if (signalCount > 0) {
        const avg = totalScore / signalCount;
        if (avg >= 1.5) { overallLabel = "STRONG BUY"; overallColor = "bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.6)]"; }
        else if (avg >= 0.5) { overallLabel = "WEAK BUY"; overallColor = "bg-green-500"; }
        else if (avg <= -1.5) { overallLabel = "STRONG SELL"; overallColor = "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.6)]"; }
        else if (avg <= -0.5) { overallLabel = "WEAK SELL"; overallColor = "bg-red-500"; }
        else { overallLabel = "NEUTRAL"; overallColor = "bg-gray-500"; }
    }

    return (
        <div className="container py-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold text-gray-100">T/A</h1>
                <div className="flex items-center gap-2">
                    <TAIndicatorsButton />
                    <TAIndicatorSettings />
                    <TASearch initialStocks={initialStocks} />
                </div>
            </div>

            {symbol ? (
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
                        <LightweightCandleChart data={candles} height={560} />
                    ) : (
                        <TradingViewWidget
                            scriptUrl={`${scriptBase}advanced-chart.js`}
                            config={CANDLE_CHART_WIDGET_CONFIG(symbol)}
                            height={560}
                            className="custom-chart"
                        />
                    )}


                    {activeIndicators.has('macd') && macdData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`MACD (${macdFast}, ${macdSlow}, ${macdSig})`}</span>
                                    {signalLabels["macd"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["macd"]]}`}>
                      {signalLabels["macd"]}
                    </span>
                                    )}
                                </div>

                                {/* BURAYA EKLİYORUZ */}
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
                                    {signalLabels["rsi"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["rsi"]]}`}>
                      {signalLabels["rsi"]}
                    </span>
                                    )}
                                </div>

                                {/* BURAYA EKLİYORUZ */}
                                <BacktestMonitor indicatorName="RSI" candles={candles} data={rsiData} />

                            </div>
                            <LightweightRSIChart rsi={rsiData.rsi} ma={rsiData.ma} />
                        </div>
                    )}

                    {activeIndicators.has('stochrsi') && stochRsiData && (
                        <div className="mt-4 p-4 border border-gray-800 rounded-xl bg-gray-950/20">
                            <div className="flex items-center justify-between mb-4">
                                <div className="text-gray-400 mb-1 flex items-center gap-2">
                                    <span className="text-lg font-medium text-gray-200">{`Stoch RSI (${stochRsiLen}, ${stochLen}, ${stochK}, ${stochD})`}</span>
                                    {signalLabels["stochrsi"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["stochrsi"]]}`}>
                        {signalLabels["stochrsi"]}
                    </span>
                                    )}
                                </div>

                                {/* BURAYA EKLİYORUZ */}
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
                                    {signalLabels["wavetrend"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["wavetrend"]]}`}>
                        {signalLabels["wavetrend"]}
                    </span>
                                    )}
                                </div>

                                {/* BURAYA EKLİYORUZ */}
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
                                    {signalLabels["dmi"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["dmi"]]}`}>
                        {signalLabels["dmi"]}
                    </span>
                                    )}
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
                                    {signalLabels["mfi"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["mfi"]]}`}>
                        {signalLabels["mfi"]}
                    </span>
                                    )}
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
                                    {signalLabels["smi"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["smi"]]}`}>
                        {signalLabels["smi"]}
                    </span>
                                    )}
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
                                    {signalLabels["ao"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["ao"]]}`}>
                        {signalLabels["ao"]}
                    </span>
                                    )}
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
                                    {signalLabels["cci"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["cci"]]}`}>
                        {signalLabels["cci"]}
                    </span>
                                    )}
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
                                    {signalLabels["wpr"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["wpr"]]}`}>
                        {signalLabels["wpr"]}
                    </span>
                                    )}
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
                                    {signalLabels["di"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["di"]]}`}>
                        {signalLabels["di"]}
                    </span>
                                    )}
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
                                    {signalLabels["cmf"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["cmf"]]}`}>
                        {signalLabels["cmf"]}
                    </span>
                                    )}
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
                                    {signalLabels["ad"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["ad"]]}`}>
                        {signalLabels["ad"]}
                    </span>
                                    )}
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
                                    {signalLabels["netvol"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["netvol"]]}`}>
                        {signalLabels["netvol"]}
                    </span>
                                    )}
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
                                    {signalLabels["madr"] && (
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SIGNAL_STYLES[signalLabels["madr"]]}`}>
                        {signalLabels["madr"]}
                    </span>
                                    )}
                                </div>
                                <BacktestMonitor indicatorName="MADR" candles={candles} data={madrData} />
                            </div>
                            <LightweightMADRChart data={madrData} />
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