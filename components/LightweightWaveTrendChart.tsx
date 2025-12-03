"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: UTCTimestamp; value: number };
type Marker = { time: UTCTimestamp; cross: 1 | -1 };

type Props = {
  wt1: LinePoint[];
  wt2: LinePoint[];
  crosses?: Marker[];
  height?: number;
};

const LightweightWaveTrendChart = ({ wt1, wt2, crosses = [], height = 240 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let wt1Series: any | undefined;
    let wt2Series: any | undefined;
    let level60: any | undefined;
    let levelNeg60: any | undefined;
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

      level60 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level60.setData((wt1.length > 0 ? wt1 : wt2).map((p) => ({ time: p.time, value: 60 })));
      levelNeg60 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      levelNeg60.setData((wt1.length > 0 ? wt1 : wt2).map((p) => ({ time: p.time, value: -60 })));

      wt1Series = chart.addLineSeries({ color: "#0db27a", lineWidth: 2 });
      wt1Series.setData(wt1);

      wt2Series = chart.addLineSeries({ color: "#ffb703", lineWidth: 2 });
      wt2Series.setData(wt2);

      // Mark crosses on wt1 line
      try {
        const markers = crosses.map((m) => ({
          time: m.time,
          position: "inBar", // scaled overlay
          color: m.cross === 1 ? "#16a34a" : "#ef4444",
          shape: m.cross === 1 ? "arrowUp" : "arrowDown",
          text: m.cross === 1 ? "WT ⤴" : "WT ⤵",
        }));
        // @ts-ignore - markers API exists at runtime
        wt1Series.setMarkers?.(markers);
      } catch {}

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
  }, [JSON.stringify({ wt1, wt2, crosses }), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightWaveTrendChart;
