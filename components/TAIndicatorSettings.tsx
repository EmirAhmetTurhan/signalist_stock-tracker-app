"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";

export default function TAIndicatorSettings() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);

    const [macdFast, setMacdFast] = useState(searchParams.get("macd_fast") || "12");
    const [macdSlow, setMacdSlow] = useState(searchParams.get("macd_slow") || "26");
    const [macdSignal, setMacdSignal] = useState(searchParams.get("macd_sig") || "9");

    const [stochRsiLen, setStochRsiLen] = useState(searchParams.get("stoch_rsi_len") || "14");
    const [stochLen, setStochLen] = useState(searchParams.get("stoch_len") || "14");
    const [stochK, setStochK] = useState(searchParams.get("stoch_k") || "3");
    const [stochD, setStochD] = useState(searchParams.get("stoch_d") || "3");

    const [wtAvgLen, setWtAvgLen] = useState(Number(searchParams.get("wt_avg_len")) || 10);
    const [wtChannelLen, setWtChannelLen] = useState(Number(searchParams.get("wt_channel_len")) || 21);
    const [wtMaLen, setWtMaLen] = useState(Number(searchParams.get("wt_ma_len")) || 4);

    const [dmiDiLen, setDmiDiLen] = useState(searchParams.get("dmi_di_len") || "14");
    const [dmiAdxSmooth, setDmiAdxSmooth] = useState(searchParams.get("dmi_adx_smooth") || "14");

    const [mfiPeriod, setMfiPeriod] = useState(searchParams.get("mfi_period") || "14");

    const [smiLongLen, setSmiLongLen] = useState(searchParams.get("smi_long_len") || "20");
    const [smiShortLen, setSmiShortLen] = useState(searchParams.get("smi_short_len") || "5");
    const [smiSigLen, setSmiSigLen] = useState(searchParams.get("smi_sig_len") || "5");

    const [rsiLen, setRsiLen] = useState(searchParams.get("rsi_len") || "14");
    const [rsiMaLen, setRsiMaLen] = useState(searchParams.get("rsi_ma_len") || "14");

    const [cciLen, setCciLen] = useState(searchParams.get("cci_len") || "20");
    const [cciMaLen, setCciMaLen] = useState(searchParams.get("cci_ma_len") || "14");

    const [wprLen, setWprLen] = useState(searchParams.get("wpr_len") || "14");

    const [diLen, setDiLen] = useState(searchParams.get("di_len") || "10");
    const [diSmooth, setDiSmooth] = useState(searchParams.get("di_smooth") || "10");
    const [diK, setDiK] = useState(searchParams.get("di_k") || "2");

    const [cmfLen, setCmfLen] = useState(searchParams.get("cmf_len") || "20");

    const [madrLen, setMadrLen] = useState(searchParams.get("madr_len") || "21");

    const [almaLen, setAlmaLen] = useState(searchParams.get("alma_len") || "9");
    const [almaOffset, setAlmaOffset] = useState(searchParams.get("alma_offset") || "0.85");
    const [almaSigma, setAlmaSigma] = useState(searchParams.get("alma_sigma") || "6");
    const [almaColor, setAlmaColor] = useState(searchParams.get("alma_color") || "#fbbf24");
    const [almaOpacity, setAlmaOpacity] = useState(searchParams.get("alma_opacity") || "100");
    const [almaWidth, setAlmaWidth] = useState(searchParams.get("alma_width") || "2");
    const [almaLineStyle, setAlmaLineStyle] = useState(searchParams.get("alma_style") || "0"); // 0: Solid, 1: Dotted, 2: Dashed

    const [almaTab, setAlmaTab] = useState("inputs"); // "inputs" | "style"

    const [bbLen, setBbLen] = useState(searchParams.get("bb_len") || "20");
    const [bbStdDev, setBbStdDev] = useState(searchParams.get("bb_stddev") || "2");
    const [bbOffset, setBbOffset] = useState(searchParams.get("bb_offset") || "0");
    const [bbColor, setBbColor] = useState(searchParams.get("bb_color") || "#3b82f6");
    const [bbOpacity, setBbOpacity] = useState(searchParams.get("bb_opacity") || "100");
    const [bbWidth, setBbWidth] = useState(searchParams.get("bb_width") || "1");
    const [bbTab, setBbTab] = useState("inputs");

    const indParam = searchParams.get("ind") || "";
    const indicators = new Set(indParam.split(",").filter(Boolean));

    const showMacd = indicators.has("macd");
    const showStoch = indicators.has("stochrsi");
    const showWaveTrend = indicators.has("wavetrend");
    const showDmi = indicators.has("dmi");
    const showMfi = indicators.has("mfi");
    const showSmi = indicators.has("smi");
    const showRsi = indicators.has("rsi");
    const showCci = indicators.has("cci");
    const showWpr = indicators.has("wpr");
    const showDI = indicators.has("di");
    const showCmf = indicators.has("cmf");
    const showMadr = indicators.has("madr");
    const showAlma = indicators.has("alma");
    const showBb = indicators.has("bb");

    if (!showMacd && !showStoch && !showWaveTrend && !showDmi && !showMfi && !showSmi && !showRsi && !showCci && !showWpr && !showDI && !showCmf && !showMadr && !showAlma && !showBb) return null;

    const handleSave = async () => {
        const params = new URLSearchParams(searchParams.toString());

        if (showMacd) {
            params.set("macd_fast", macdFast);
            params.set("macd_slow", macdSlow);
            params.set("macd_sig", macdSignal);
        } else {
            params.delete("macd_fast");
            params.delete("macd_slow");
            params.delete("macd_sig");
        }

        if (showStoch) {
            params.set("stoch_rsi_len", stochRsiLen);
            params.set("stoch_len", stochLen);
            params.set("stoch_k", stochK);
            params.set("stoch_d", stochD);
        } else {
            params.delete("stoch_rsi_len");
            params.delete("stoch_len");
            params.delete("stoch_k");
            params.delete("stoch_d");
        }

        if (showWaveTrend) {
            if (wtAvgLen !== 10) params.set("wt_avg_len", wtAvgLen.toString()); else params.delete("wt_avg_len");
            if (wtChannelLen !== 21) params.set("wt_channel_len", wtChannelLen.toString()); else params.delete("wt_channel_len");
            if (wtMaLen !== 4) params.set("wt_ma_len", wtMaLen.toString()); else params.delete("wt_ma_len");
        } else {
            params.delete("wt_avg_len");
            params.delete("wt_channel_len");
            params.delete("wt_ma_len");
        }

        if (showDmi) {
            if (dmiDiLen !== "14") params.set("dmi_di_len", dmiDiLen); else params.delete("dmi_di_len");
            if (dmiAdxSmooth !== "14") params.set("dmi_adx_smooth", dmiAdxSmooth); else params.delete("dmi_adx_smooth");
        } else {
            params.delete("dmi_di_len");
            params.delete("dmi_adx_smooth");
        }

        if (showMfi) {
            if (mfiPeriod !== "14") params.set("mfi_period", mfiPeriod); else params.delete("mfi_period");
        } else {
            params.delete("mfi_period");
        }

        if (showSmi) {
            if (smiLongLen !== "20") params.set("smi_long_len", smiLongLen); else params.delete("smi_long_len");
            if (smiShortLen !== "5") params.set("smi_short_len", smiShortLen); else params.delete("smi_short_len");
            if (smiSigLen !== "5") params.set("smi_sig_len", smiSigLen); else params.delete("smi_sig_len");
        } else {
            params.delete("smi_long_len");
            params.delete("smi_short_len");
            params.delete("smi_sig_len");
        }

        if (showRsi) {
            if (rsiLen !== "14") params.set("rsi_len", rsiLen); else params.delete("rsi_len");
            if (rsiMaLen !== "14") params.set("rsi_ma_len", rsiMaLen); else params.delete("rsi_ma_len");
        } else {
            params.delete("rsi_len");
            params.delete("rsi_ma_len");
        }

        if (showCci) {
            if (cciLen !== "20") params.set("cci_len", cciLen); else params.delete("cci_len");
            if (cciMaLen !== "14") params.set("cci_ma_len", cciMaLen); else params.delete("cci_ma_len");
        } else {
            params.delete("cci_len");
            params.delete("cci_ma_len");
        }

        if (showWpr) {
            if (wprLen !== "14") params.set("wpr_len", wprLen); else params.delete("wpr_len");
        } else {
            params.delete("wpr_len");
        }

        if (showDI) {
            if (diLen !== "10") params.set("di_len", diLen); else params.delete("di_len");
            if (diSmooth !== "10") params.set("di_smooth", diSmooth); else params.delete("di_smooth");
            if (diK !== "2") params.set("di_k", diK); else params.delete("di_k");
        } else {
            params.delete("di_len");
            params.delete("di_smooth");
            params.delete("di_k");
        }

        if (showCmf) {
            if (cmfLen !== "20") params.set("cmf_len", cmfLen); else params.delete("cmf_len");
        } else {
            params.delete("cmf_len");
        }

        if (showMadr) {
            if (madrLen !== "21") params.set("madr_len", madrLen); else params.delete("madr_len");
        } else {
            params.delete("madr_len");
        }

        if (showAlma) {
            if (almaLen !== "9") params.set("alma_len", almaLen); else params.delete("alma_len");
            if (almaOffset !== "0.85") params.set("alma_offset", almaOffset); else params.delete("alma_offset");
            if (almaSigma !== "6") params.set("alma_sigma", almaSigma); else params.delete("alma_sigma");
            if (almaColor !== "#fbbf24") params.set("alma_color", almaColor); else params.delete("alma_color");
            if (almaOpacity !== "100") params.set("alma_opacity", almaOpacity); else params.delete("alma_opacity");
            if (almaWidth !== "2") params.set("alma_width", almaWidth); else params.delete("alma_width");
            if (almaLineStyle !== "0") params.set("alma_style", almaLineStyle); else params.delete("alma_style");
        } else {
            params.delete("alma_len");
            params.delete("alma_offset");
            params.delete("alma_sigma");
            params.delete("alma_color");
            params.delete("alma_opacity");
            params.delete("alma_width");
            params.delete("alma_style");
        }

        if (showBb) {
            if (bbLen !== "20") params.set("bb_len", bbLen); else params.delete("bb_len");
            if (bbStdDev !== "2") params.set("bb_stddev", bbStdDev); else params.delete("bb_stddev");
            if (bbOffset !== "0") params.set("bb_offset", bbOffset); else params.delete("bb_offset");
            if (bbColor !== "#3b82f6") params.set("bb_color", bbColor); else params.delete("bb_color");
            if (bbOpacity !== "100") params.set("bb_opacity", bbOpacity); else params.delete("bb_opacity");
            if (bbWidth !== "1") params.set("bb_width", bbWidth); else params.delete("bb_width");
        } else {
            params.delete("bb_len");
            params.delete("bb_stddev");
            params.delete("bb_offset");
            params.delete("bb_color");
            params.delete("bb_opacity");
            params.delete("bb_width");
        }

        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl);
        router.refresh();
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0" title="Indicator Settings">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-[#141414] border-gray-700 text-gray-100">
                <DialogHeader>
                    <DialogTitle>Indicator Settings</DialogTitle>
                </DialogHeader>

                <div className="grid gap-6 py-4">

                    {showMacd && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">MACD</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Fast Length</Label>
                                    <Input
                                        type="number"
                                        value={macdFast}
                                        onChange={(e) => setMacdFast(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">Slow Length</Label>
                                    <Input
                                        type="number"
                                        value={macdSlow}
                                        onChange={(e) => setMacdSlow(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">Signal</Label>
                                    <Input
                                        type="number"
                                        value={macdSignal}
                                        onChange={(e) => setMacdSignal(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showStoch && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Stochastic RSI</h4>
                            <div className="grid grid-cols-4 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">RSI Len</Label>
                                    <Input
                                        type="number"
                                        value={stochRsiLen}
                                        onChange={(e) => setStochRsiLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">Stoch Len</Label>
                                    <Input
                                        type="number"
                                        value={stochLen}
                                        onChange={(e) => setStochLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">K</Label>
                                    <Input
                                        type="number"
                                        value={stochK}
                                        onChange={(e) => setStochK(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">D</Label>
                                    <Input
                                        type="number"
                                        value={stochD}
                                        onChange={(e) => setStochD(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showWaveTrend && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">WaveTrend</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Avg Len (10)</Label>
                                    <Input
                                        type="number"
                                        value={wtAvgLen}
                                        onChange={(e) => setWtAvgLen(Number(e.target.value))}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">Channel Len (21)</Label>
                                    <Input
                                        type="number"
                                        value={wtChannelLen}
                                        onChange={(e) => setWtChannelLen(Number(e.target.value))}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-400">MA Len (4)</Label>
                                    <Input
                                        type="number"
                                        value={wtMaLen}
                                        onChange={(e) => setWtMaLen(Number(e.target.value))}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showDmi && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Directional Movement Index</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">DI Length</Label>
                                    <Input
                                        type="number"
                                        value={dmiDiLen}
                                        onChange={(e) => setDmiDiLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">ADX Smoothing</Label>
                                    <Input
                                        type="number"
                                        value={dmiAdxSmooth}
                                        onChange={(e) => setDmiAdxSmooth(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showMfi && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Money Flow Index</h4>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Period (14)</Label>
                                    <Input
                                        type="number"
                                        value={mfiPeriod}
                                        onChange={(e) => setMfiPeriod(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showSmi && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">SMI Ergodic Indicator</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Long Len (20)</Label>
                                    <Input
                                        type="number"
                                        value={smiLongLen}
                                        onChange={(e) => setSmiLongLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Short Len (5)</Label>
                                    <Input
                                        type="number"
                                        value={smiShortLen}
                                        onChange={(e) => setSmiShortLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Sig Len (5)</Label>
                                    <Input
                                        type="number"
                                        value={smiSigLen}
                                        onChange={(e) => setSmiSigLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showRsi && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Relative Strength Index</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Length (14)</Label>
                                    <Input
                                        type="number"
                                        value={rsiLen}
                                        onChange={(e) => setRsiLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">MA Length (14)</Label>
                                    <Input
                                        type="number"
                                        value={rsiMaLen}
                                        onChange={(e) => setRsiMaLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showCci && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Commodity Channel Index</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Length (20)</Label>
                                    <Input
                                        type="number"
                                        value={cciLen}
                                        onChange={(e) => setCciLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">MA Length (14)</Label>
                                    <Input
                                        type="number"
                                        value={cciMaLen}
                                        onChange={(e) => setCciMaLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showWpr && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Williams %R</h4>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Period (14)</Label>
                                    <Input
                                        type="number"
                                        value={wprLen}
                                        onChange={(e) => setWprLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showDI && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Demand Index</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Period (10)</Label>
                                    <Input
                                        type="number"
                                        value={diLen}
                                        onChange={(e) => setDiLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Price Range (2)</Label>
                                    <Input
                                        type="number"
                                        value={diK}
                                        onChange={(e) => setDiK(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={0.1}
                                        step={0.1}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Smooth (10)</Label>
                                    <Input
                                        type="number"
                                        value={diSmooth}
                                        onChange={(e) => setDiSmooth(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={0}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showCmf && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">Chaikin Money Flow</h4>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Length (20)</Label>
                                    <Input
                                        type="number"
                                        value={cmfLen}
                                        onChange={(e) => setCmfLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showMadr && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">MADR</h4>
                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-400">Length (21)</Label>
                                    <Input
                                        type="number"
                                        value={madrLen}
                                        onChange={(e) => setMadrLen(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                        min={1}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showAlma && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-yellow-500">Arnaud Legoux Moving Average (ALMA)</h4>
                                <div className="flex items-center gap-3 text-xs bg-gray-900 px-2 py-1 rounded-lg border border-gray-800">
                                    <button
                                        className={almaTab === "inputs" ? "text-white font-medium" : "text-gray-500 hover:text-gray-300"}
                                        onClick={() => setAlmaTab("inputs")}
                                    >
                                        Girdiler
                                    </button>
                                    <button
                                        className={almaTab === "style" ? "text-white font-medium" : "text-gray-500 hover:text-gray-300"}
                                        onClick={() => setAlmaTab("style")}
                                    >
                                        Stil
                                    </button>
                                </div>
                            </div>

                            {almaTab === "inputs" && (
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                    <div>
                                        <Label className="text-xs text-gray-400">Uzunluk (9)</Label>
                                        <Input
                                            type="number"
                                            value={almaLen}
                                            onChange={(e) => setAlmaLen(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                            min={1}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-400">Uzantı (0.85)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={almaOffset}
                                            onChange={(e) => setAlmaOffset(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-400">Sigma (6)</Label>
                                        <Input
                                            type="number"
                                            value={almaSigma}
                                            onChange={(e) => setAlmaSigma(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                            min={1}
                                        />
                                    </div>
                                </div>
                            )}

                            {almaTab === "style" && (
                                <div className="space-y-5 mt-2 bg-[#0f0f0f] p-4 rounded-xl border border-gray-800">
                                    {/* Renk Paleti */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs text-gray-400">Renk</Label>
                                            <div
                                                className="w-6 h-6 rounded-md border border-gray-600"
                                                style={{ backgroundColor: almaColor }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-10 gap-1.5 pt-1">
                                            {[
                                                "#ffffff", "#e5e7eb", "#9ca3af", "#4b5563", "#1f2937", "#000000", "#ef4444", "#f97316", "#f59e0b", "#84cc16",
                                                "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#fca5a5", "#fdba74", "#fcd34d", "#bef264",
                                                "#6ee7b7", "#67e8f9", "#93c5fd", "#a5b4fc", "#d8b4fe", "#f9a8d4", "#b91c1c", "#c2410c", "#b45309", "#4d7c0f",
                                                "#047857", "#0e7490", "#1d4ed8", "#4338ca", "#7e22ce", "#be185d", "#7f1d1d", "#7c2d12", "#78350f", "#3f6212",
                                                "#064e3b", "#164e63", "#1e3a8a", "#312e81", "#581c87", "#831843"
                                            ].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setAlmaColor(color)}
                                                    className={`w-full aspect-square rounded-sm transition-transform ${almaColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Şeffaflık */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs text-gray-400">Şeffaflık</Label>
                                            <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">{almaOpacity}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={almaOpacity}
                                            onChange={(e) => setAlmaOpacity(e.target.value)}
                                            className="w-full accent-blue-500"
                                        />
                                    </div>

                                    {/* Kalınlık */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-gray-400">Kalınlık</Label>
                                        <div className="grid grid-cols-4 gap-0 border border-gray-700 rounded-lg overflow-hidden">
                                            {[1, 2, 3, 4].map((width) => (
                                                <button
                                                    key={width}
                                                    onClick={() => setAlmaWidth(width.toString())}
                                                    className={`h-9 flex items-center justify-center border-r border-gray-700 last:border-r-0 transition-colors
                                                        ${almaWidth === width.toString() ? 'bg-gray-200' : 'bg-gray-900 hover:bg-gray-800'}`}
                                                >
                                                    <div
                                                        className="w-6 bg-current rounded-full"
                                                        style={{
                                                            height: width + 'px',
                                                            color: almaWidth === width.toString() ? '#000' : '#fff'
                                                        }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Çizgi stili */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-gray-400">Çizgi Stili</Label>
                                        <div className="grid grid-cols-3 gap-0 border border-gray-700 rounded-lg overflow-hidden">
                                            {/* 0: Solid, 2: Dashed, 1: Dotted (LW Charts mapping: 0=Solid, 1=Dotted, 2=Dashed) */}
                                            {[
                                                { val: "0", label: "Solid", dashed: false, dotted: false },
                                                { val: "2", label: "Dashed", dashed: true, dotted: false },
                                                { val: "1", label: "Dotted", dashed: false, dotted: true }
                                            ].map((style) => (
                                                <button
                                                    key={style.val}
                                                    onClick={() => setAlmaLineStyle(style.val)}
                                                    className={`h-9 flex items-center justify-center border-r border-gray-700 last:border-r-0 transition-colors
                                                        ${almaLineStyle === style.val ? 'bg-gray-200' : 'bg-gray-900 hover:bg-gray-800'}`}
                                                >
                                                    <div
                                                        className="w-8 border-t-2"
                                                        style={{
                                                            borderColor: almaLineStyle === style.val ? '#000' : '#fff',
                                                            borderStyle: style.dashed ? 'dashed' : style.dotted ? 'dotted' : 'solid',
                                                        }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {showBb && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-yellow-500">Bollinger Bantları</h4>
                                <div className="flex items-center gap-3 text-xs bg-gray-900 px-2 py-1 rounded-lg border border-gray-800">
                                    <button
                                        className={bbTab === "inputs" ? "text-white font-medium" : "text-gray-500 hover:text-gray-300"}
                                        onClick={() => setBbTab("inputs")}
                                    >
                                        Girdiler
                                    </button>
                                    <button
                                        className={bbTab === "style" ? "text-white font-medium" : "text-gray-500 hover:text-gray-300"}
                                        onClick={() => setBbTab("style")}
                                    >
                                        Stil
                                    </button>
                                </div>
                            </div>

                            {bbTab === "inputs" && (
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-400">Uzunluk (20)</Label>
                                        <Input
                                            type="number"
                                            value={bbLen}
                                            onChange={(e) => setBbLen(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                            min={1}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-400">StdSapma (2)</Label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            value={bbStdDev}
                                            onChange={(e) => setBbStdDev(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-400">Uzantı (0)</Label>
                                        <Input
                                            type="number"
                                            value={bbOffset}
                                            onChange={(e) => setBbOffset(e.target.value)}
                                            className="bg-[#0f0f0f] border-gray-600 h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-400">Temel HO Türü</Label>
                                        <select disabled className="w-full bg-[#0f0f0f] border border-gray-600 h-8 rounded-md text-sm px-2 text-gray-400">
                                            <option>SMA</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {bbTab === "style" && (
                                <div className="space-y-5 mt-2 bg-[#0f0f0f] p-4 rounded-xl border border-gray-800">
                                    {/* Renk Paleti */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs text-gray-400">Renk</Label>
                                            <div
                                                className="w-6 h-6 rounded-md border border-gray-600"
                                                style={{ backgroundColor: bbColor }}
                                            />
                                        </div>
                                        <div className="grid grid-cols-10 gap-1.5 pt-1">
                                            {[
                                                "#ffffff", "#e5e7eb", "#9ca3af", "#4b5563", "#1f2937", "#000000", "#ef4444", "#f97316", "#f59e0b", "#84cc16",
                                                "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#fca5a5", "#fdba74", "#fcd34d", "#bef264",
                                                "#6ee7b7", "#67e8f9", "#93c5fd", "#a5b4fc", "#d8b4fe", "#f9a8d4", "#b91c1c", "#c2410c", "#b45309", "#4d7c0f",
                                                "#047857", "#0e7490", "#1d4ed8", "#4338ca", "#7e22ce", "#be185d", "#7f1d1d", "#7c2d12", "#78350f", "#3f6212",
                                                "#064e3b", "#164e63", "#1e3a8a", "#312e81", "#581c87", "#831843"
                                            ].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setBbColor(color)}
                                                    className={`w-full aspect-square rounded-sm transition-transform ${bbColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Şeffaflık */}
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs text-gray-400">Arkaplan Şeffaflık</Label>
                                            <span className="text-xs bg-gray-800 px-2 py-1 rounded border border-gray-700">{bbOpacity}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={bbOpacity}
                                            onChange={(e) => setBbOpacity(e.target.value)}
                                            className="w-full accent-blue-500"
                                        />
                                    </div>

                                    {/* Kalınlık */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-gray-400">Çizgi Kalınlığı</Label>
                                        <div className="grid grid-cols-4 gap-0 border border-gray-700 rounded-lg overflow-hidden">
                                            {[1, 2, 3, 4].map((width) => (
                                                <button
                                                    key={width}
                                                    onClick={() => setBbWidth(width.toString())}
                                                    className={`h-9 flex items-center justify-center border-r border-gray-700 last:border-r-0 transition-colors
                                                        ${bbWidth === width.toString() ? 'bg-gray-200' : 'bg-gray-900 hover:bg-gray-800'}`}
                                                >
                                                    <div
                                                        className="w-6 bg-current rounded-full"
                                                        style={{
                                                            height: width + 'px',
                                                            color: bbWidth === width.toString() ? '#000' : '#fff'
                                                        }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={handleSave} className="bg-yellow-500 text-black hover:bg-yellow-400 w-full">
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}