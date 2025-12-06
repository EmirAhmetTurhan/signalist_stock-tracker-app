"use client";

import { useState, useEffect } from "react";
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

    const [rsiLength, setRsiLength] = useState(searchParams.get("rsi_len") || "14");

    const indParam = searchParams.get("ind") || "";
    const indicators = new Set(indParam.split(",").filter(Boolean));
    const showMacd = indicators.has("macd");
    const showRsi = indicators.has("rsi");

    if (!showMacd && !showRsi) return null;

    const handleSave = () => {
        const params = new URLSearchParams(searchParams.toString());

        // MACD Ayarlarını URL'e yaz
        if (showMacd) {
            params.set("macd_fast", macdFast);
            params.set("macd_slow", macdSlow);
            params.set("macd_sig", macdSignal);
        } else {
            params.delete("macd_fast");
            params.delete("macd_slow");
            params.delete("macd_sig");
        }

        if (showRsi) {
            params.set("rsi_len", rsiLength);
        } else {
            params.delete("rsi_len");
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
                    {/* MACD AYARLARI */}
                    {showMacd && (
                        <div className="grid gap-3 border-b border-gray-700 pb-4">
                            <h4 className="font-medium text-yellow-500">MACD</h4>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="grid gap-1">
                                    <Label htmlFor="macdFast" className="text-xs text-gray-400">Fast Length</Label>
                                    <Input
                                        id="macdFast"
                                        type="number"
                                        value={macdFast}
                                        onChange={(e) => setMacdFast(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <Label htmlFor="macdSlow" className="text-xs text-gray-400">Slow Length</Label>
                                    <Input
                                        id="macdSlow"
                                        type="number"
                                        value={macdSlow}
                                        onChange={(e) => setMacdSlow(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                                <div className="grid gap-1">
                                    <Label htmlFor="macdSig" className="text-xs text-gray-400">Signal</Label>
                                    <Input
                                        id="macdSig"
                                        type="number"
                                        value={macdSignal}
                                        onChange={(e) => setMacdSignal(e.target.value)}
                                        className="bg-[#0f0f0f] border-gray-600 h-8"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {showRsi && (
                        <div className="grid gap-3">
                            <h4 className="font-medium text-yellow-500">RSI</h4>
                            <div className="grid gap-1">
                                <Label htmlFor="rsiLen" className="text-xs text-gray-400">Length</Label>
                                <Input
                                    id="rsiLen"
                                    type="number"
                                    value={rsiLength}
                                    onChange={(e) => setRsiLength(e.target.value)}
                                    className="bg-[#0f0f0f] border-gray-600 h-8"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={handleSave} className="bg-yellow-500 text-black hover:bg-yellow-400">
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}