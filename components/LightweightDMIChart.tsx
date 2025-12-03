"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  plusDI: LinePoint[];
  minusDI: LinePoint[];
  adx: LinePoint[];
  height?: number;
};

const LightweightDMIChart = ({ plusDI, minusDI, adx, height = 240 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let plusSeries: any | undefined;
    let minusSeries: any | undefined;
    let adxSeries: any | undefined;
    let level20: any | undefined;
    let level25: any | undefined;
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

      // Horizontal guide levels
      const refData = plusDI.length > 0 ? plusDI : (minusDI.length > 0 ? minusDI : adx);
      level20 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level20.setData(refData.map((p) => ({ time: p.time, value: 20 })));
      level25 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level25.setData(refData.map((p) => ({ time: p.time, value: 25 })));

      plusSeries = chart.addLineSeries({ color: "#0db27a", lineWidth: 2 });
      plusSeries.setData(plusDI);

      minusSeries = chart.addLineSeries({ color: "#ef4444", lineWidth: 2 });
      minusSeries.setData(minusDI);

      adxSeries = chart.addLineSeries({ color: "#ffb703", lineWidth: 2 });
      adxSeries.setData(adx);

      try {
        chart.timeScale().fitContent();
      } catch {}

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
  }, [JSON.stringify({ plusDI, minusDI, adx }), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightDMIChart;
