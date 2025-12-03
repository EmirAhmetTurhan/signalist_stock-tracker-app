"use client";

import { useEffect, useRef } from "react";

type Props = {
  data: CandleDataPoint[];
  height?: number;
};

const LightweightCandleChart = ({ data, height = 520 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let series: any | undefined;
    let ro: ResizeObserver | undefined;
    let disposed = false;

    (async () => {
      const mod = await import("lightweight-charts");
      if (disposed) return;
      const container = containerRef.current!;
      if (!container) return;

      chart = mod.createChart(container, {
        layout: {
          background: { color: "#141414" },
          textColor: "#DBDBDB",
        },
        grid: {
          vertLines: { color: "rgba(240,243,250,0.08)" },
          horzLines: { color: "rgba(240,243,250,0.08)" },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: { mode: mod.CrosshairMode.Normal },
        autoSize: true,
        height,
      });

      series = chart.addCandlestickSeries({
        upColor: "#0FEDBE",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#0FEDBE",
        wickDownColor: "#ef4444",
        wickUpColor: "#0FEDBE",
      });
      series.setData(data);
      try {
        // Ensure the full data range is visible
        chart.timeScale().fitContent();
      } catch {}

      // keep responsive
      ro = new ResizeObserver(() => {
        try {
          chart?.applyOptions({ width: container.clientWidth, height });
        } catch {}
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      try { ro?.disconnect(); } catch {}
      try { chart?.remove?.(); } catch {}
    };
  }, [JSON.stringify(data), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCandleChart;
