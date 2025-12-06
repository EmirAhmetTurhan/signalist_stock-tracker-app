"use client";

import { useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const TAIndicatorsButton = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const symbol = searchParams.get("symbol") || "";
  const indParam = searchParams.get("ind") || "";
  const selected = useMemo(() => new Set(indParam.split(",").filter(Boolean).map((s) => s.toLowerCase())), [indParam]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    const ind = Array.from(next).join(",");
    const params = new URLSearchParams();
    if (symbol) params.set("symbol", symbol);
    if (ind) params.set("ind", ind);
    const url = `${pathname}?${params.toString()}`;
    router.replace(url);
  };

  const isMacd = selected.has("macd");
  const isStochRsi = selected.has("stochrsi");
  const isWaveTrend = selected.has("wavetrend");
  const isDMI = selected.has("dmi");
  const isMFI = selected.has("mfi");
  const isSmi = selected.has("smi");
  const isAO = selected.has("ao");
  const isRSI = selected.has("rsi");
  const isCCI = selected.has("cci");
  const isWPR = selected.has("wpr");
  const isDI = selected.has("di");
  const isCMF = selected.has("cmf");
  const isAD = selected.has("ad");
  const isNetVol = selected.has("netvol");
  const isMADR = selected.has("madr");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="search-btn">Indicators</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-gray-100">
        <DropdownMenuLabel>Indicators</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-600" />
        <DropdownMenuItem onClick={() => toggle("macd")} className="cursor-pointer flex items-center gap-2">
          <Check className={`h-4 w-4 ${isMacd ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
          MACD (12, 26, 9)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("stochrsi")} className="cursor-pointer flex items-center gap-2">
          <Check className={`h-4 w-4 ${isStochRsi ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
          Stochastic RSI (14, 14, 3, 3)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("wavetrend")} className="cursor-pointer flex items-center gap-2">
          <Check className={`h-4 w-4 ${isWaveTrend ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
          WaveTrend with Crosses [LazyBear] (10, 21, 4)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("dmi")} className="cursor-pointer flex items-center gap-2">
          <Check className={`h-4 w-4 ${isDMI ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
          Directional Movement Index (14)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("mfi")} className="cursor-pointer flex items-center gap-2">
          <Check className={`h-4 w-4 ${isMFI ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
          Money Flow Index (14)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("smi")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isSmi ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           SMI Ergodic Indicator (20, 5, 5)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("ao")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isAO ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Awesome Oscillator
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("rsi")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isRSI ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Relative Strength Index (14)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("cci")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isCCI ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Commodity Channel Index (20)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("wpr")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isWPR ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Williams %R (14)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("di")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isDI ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Demand Index (19)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("cmf")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isCMF ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Chaikin Money Flow (20)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("ad")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isAD ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Accumulation/Distribution
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("netvol")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isNetVol ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Net Volume
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle("madr")} className="cursor-pointer flex items-center gap-2">
           <Check className={`h-4 w-4 ${isMADR ? 'opacity-100 text-yellow-500' : 'opacity-0'}`} />
           Moving Average Deviation Rate (25)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TAIndicatorsButton;
