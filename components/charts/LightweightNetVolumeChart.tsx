"use client";

import { useEffect, useRef } from "react";

type NVPoint = { time: number; value: number };

type Props = {
    data: NVPoint[];
    height?: number;
};

const LightweightNetVolumeChart = ({ data, height = 240 }: Props) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: any | undefined;
        let series: any | undefined;
        let zeroLine: any | undefined;
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

            zeroLine = chart.addLineSeries({
                color: "#666",
                lineWidth: 1,
                lineStyle: 2,
                priceLineVisible: false,
            });
            if (data.length > 0) {
                zeroLine.setData(data.map(d => ({ time: d.time, value: 0 })));
            }

            series = chart.addLineSeries({
                color: "#2962FF",
                lineWidth: 2,
                priceFormat: { type: 'volume' },
            });

            series.setData(data);

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
    }, [JSON.stringify(data), height]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightNetVolumeChart;