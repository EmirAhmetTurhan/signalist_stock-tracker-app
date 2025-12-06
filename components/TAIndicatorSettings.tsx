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

    const indParam = searchParams.get("ind") || "";
    const indicators = new Set(indParam.split(",").filter(Boolean));

    const showMacd = indicators.has("macd");
    const showStoch = indicators.has("stochrsi");

    if (!showMacd && !showStoch) return null;

    const handleSave = () => {
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