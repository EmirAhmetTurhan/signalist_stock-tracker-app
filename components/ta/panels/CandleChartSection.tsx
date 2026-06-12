"use client";

import { useState, useCallback } from "react";
import dynamicImport from "next/dynamic";
import ChartOverlayToggle from "@/components/ta/controls/ChartOverlayToggle";
import type { TradeMarker } from "@/lib/ta/signals";

const CandleChart = dynamicImport(() => import("@/components/charts/LightweightCandleChart"));

interface CandleChartSectionProps {
  data: CandleDataPoint[];
  height?: number;
  almaData?: { time: string | number; value?: number }[];
  almaStyleConfig?: { color: string; opacity: number; width: number; style: number };
  bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
  bbStyleConfig?: { color: string; opacity: number; width: number };
  candlePatterns?: import("@/lib/indicators/candlePatterns").CandlePattern[];
  fractalProjection?: { time: number; value: number }[];
  srLevels?: Array<{ price: number; type: 'support' | 'resistance'; touches: number; strength: number }>;
  tradeMarkers?: TradeMarker[];
  /** Hangi overlay toggle'ların gösterileceği */
  availableToggles?: ("bb" | "alma" | "patterns" | "sr" | "markers" | "fractals")[];
}

/**
 * Candle chart + overlay toggle butonlarını saran ince client wrapper.
 * Visibility state'ini yönetir, chart'a showBB/showALMA props olarak geçer.
 */
export default function CandleChartSection({
  data,
  height = 560,
  almaData,
  almaStyleConfig,
  bbData,
  bbStyleConfig,
  candlePatterns,
  fractalProjection,
  srLevels,
  tradeMarkers,
  availableToggles,
}: CandleChartSectionProps) {
  const [showBB, setShowBB] = useState(true);
  const [showALMA, setShowALMA] = useState(true);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showSR, setShowSR] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showFractals, setShowFractals] = useState(true);

  const hasOverlays = availableToggles && availableToggles.length > 0;

  const handleToggle = useCallback(
    (key: "bb" | "alma" | "patterns" | "sr" | "markers" | "fractals", visible: boolean) => {
      if (key === "bb") setShowBB(visible);
      if (key === "alma") setShowALMA(visible);
      if (key === "patterns") setShowPatterns(visible);
      if (key === "sr") setShowSR(visible);
      if (key === "markers") setShowMarkers(visible);
      if (key === "fractals") setShowFractals(visible);
    },
    []
  );

  return (
    <div className="relative">
      {hasOverlays && (
        <div className="absolute top-2 left-2 z-10 max-w-[calc(100%-16px)]">
          <ChartOverlayToggle
            available={availableToggles}
            onChange={handleToggle}
          />
        </div>
      )}
      <CandleChart
        data={data}
        height={height}
        almaData={almaData}
        almaStyleConfig={almaStyleConfig}
        bbData={bbData}
        bbStyleConfig={bbStyleConfig}
        candlePatterns={candlePatterns}
        fractalProjection={fractalProjection}
        srLevels={srLevels}
        tradeMarkers={tradeMarkers}
        showBB={showBB}
        showALMA={showALMA}
        showPatterns={showPatterns}
        showSR={showSR}
        showMarkers={showMarkers}
        showFractals={showFractals}
      />
    </div>
  );
}
