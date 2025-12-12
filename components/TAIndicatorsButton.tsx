"use client";

import { useMemo } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem, // Bu bileşeni import ediyoruz
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TAIndicatorsButton = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const symbol = searchParams.get("symbol") || "";
    const indParam = searchParams.get("ind") || "";

    const selected = useMemo(() =>
            new Set(indParam.split(",").filter(Boolean).map((s) => s.trim().toLowerCase())),
        [indParam]);

    const macdFast = searchParams.get("macd_fast") || "12";
    const macdSlow = searchParams.get("macd_slow") || "26";
    const macdSig = searchParams.get("macd_sig") || "9";

    const stochRsiLen = searchParams.get("stoch_rsi_len") || "14";
    const stochLen = searchParams.get("stoch_len") || "14";
    const stochK = searchParams.get("stoch_k") || "3";
    const stochD = searchParams.get("stoch_d") || "3";

    const wtAvg = searchParams.get("wt_avg_len") || "10";
    const wtChan = searchParams.get("wt_channel_len") || "21";
    const wtMa = searchParams.get("wt_ma_len") || "4";

    const dmiLen = searchParams.get("dmi_di_len") || "14";
    const dmiAdxSmooth = searchParams.get("dmi_adx_smooth") || "14";
    const mfiLen = searchParams.get("mfi_period") || "14";

    const smiLong = searchParams.get("smi_long_len") || "20";
    const smiShort = searchParams.get("smi_short_len") || "5";
    const smiSig = searchParams.get("smi_sig_len") || "5";

    const rsiLen = searchParams.get("rsi_len") || "14";
    const rsiMaLen = searchParams.get("rsi_ma_len") || "14";

    const cciLen = searchParams.get("cci_len") || "20";
    const cciMaLen = searchParams.get("cci_ma_len") || "14";

    const wprLen = searchParams.get("wpr_len") || "14";

    const diLen = searchParams.get("di_len") || "10";
    const diSmooth = searchParams.get("di_smooth") || "10";
    const diK = searchParams.get("di_k") || "2";

    const cmfLen = searchParams.get("cmf_len") || "20";

    const madrLen = searchParams.get("madr_len") || "21";

    const toggle = (key: string) => {
        const params = new URLSearchParams(searchParams.toString());

        const currentIndStr = params.get("ind") || "";
        const currentSet = new Set(
            currentIndStr.split(",").filter(Boolean).map(s => s.trim().toLowerCase())
        );

        if (currentSet.has(key)) {
            currentSet.delete(key);
        } else {
            currentSet.add(key);
        }

        const newIndStr = Array.from(currentSet).join(",");

        if (newIndStr) {
            params.set("ind", newIndStr);
        } else {
            params.delete("ind");
        }

        if (symbol) params.set("symbol", symbol);

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="search-btn">Indicators</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-gray-100 max-h-[400px] overflow-y-auto">
                <DropdownMenuLabel>Indicators</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-600" />


                <DropdownMenuCheckboxItem
                    checked={selected.has("macd")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("macd")}
                >
                    MACD ({macdFast}, {macdSlow}, {macdSig})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("stochrsi")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("stochrsi")}
                >
                    Stochastic RSI ({stochRsiLen}, {stochLen}, {stochK}, {stochD})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("wavetrend")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("wavetrend")}
                >
                    WaveTrend ({wtAvg}, {wtChan}, {wtMa})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("dmi")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("dmi")}
                >
                    DMI ({dmiLen}, {dmiAdxSmooth})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("mfi")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("mfi")}
                >
                    Money Flow Index ({mfiLen})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("smi")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("smi")}
                >
                    SMI Ergodic ({smiLong}, {smiShort}, {smiSig})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("ao")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("ao")}
                >
                    Awesome Oscillator
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("rsi")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("rsi")}
                >
                    RSI ({rsiLen}, {rsiMaLen})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("cci")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("cci")}
                >
                    CCI ({cciLen}, {cciMaLen})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("wpr")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("wpr")}
                >
                    Williams %R ({wprLen})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("di")}
                    onSelect={(e) => {
                        e.preventDefault();
                        toggle("di");
                    }}
                >
                    Demand Index ({diLen}, {diK}, {diSmooth})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("cmf")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("cmf")}
                >
                    Chaikin Money Flow ({cmfLen})
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("ad")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("ad")}
                >
                    Accumulation/Distribution
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("netvol")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("netvol")}
                >
                    Net Volume
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                    checked={selected.has("madr")}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle("madr")}
                >
                    MADR ({madrLen})
                </DropdownMenuCheckboxItem>

            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default TAIndicatorsButton;