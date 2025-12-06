"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: number; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightMADRChart = ({ data, height = 240 }: Props) => {
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

            series = chart.addBaselineSeries({
                baseValue: { type: 'price', price: 0 },
                topLineColor: '#0db27a', // Yeşil Çizgi
                topFillColor1: 'rgba(13, 178, 122, 0.28)', // Yeşil Dolgu (Koyu)
                topFillColor2: 'rgba(13, 178, 122, 0.05)', // Yeşil Dolgu (Açık)
                bottomLineColor: '#ef4444', // Kırmızı Çizgi
                bottomFillColor1: 'rgba(239, 68, 68, 0.05)', // Kırmızı Dolgu (Açık)
                bottomFillColor2: 'rgba(239, 68, 68, 0.28)', // Kırmızı Dolgu (Koyu)
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

export default LightweightMADRChart;