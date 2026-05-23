"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: number; value: number }; // time is UTCTimestamp
type HistoPoint = { time: number; value: number; color?: string };

type Props = {
    smi: LinePoint[];
    signal: LinePoint[];
    histogram: HistoPoint[];
    height?: number;
};

const LightweightSMIChart = ({ smi, signal, histogram, height = 240 }: Props) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: any | undefined;
        let smiSeries: any | undefined;
        let signalSeries: any | undefined;
        let histSeries: any | undefined;
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

            // Histogram (Arkada kalsın diye önce ekliyoruz)
            histSeries = chart.addHistogramSeries({
                base: 0,
                priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
                color: '#888888', // Varsayılan renk, veriden gelen 'color' override edecek
            });
            histSeries.setData(histogram);

            // SMI Çizgisi (Ana Çizgi - Genelde Mavi/Mor)
            smiSeries = chart.addLineSeries({ color: "#2962FF", lineWidth: 2 });
            smiSeries.setData(smi);

            // Sinyal Çizgisi (Genelde Turuncu/Kırmızı)
            signalSeries = chart.addLineSeries({ color: "#FF6D00", lineWidth: 2 });
            signalSeries.setData(signal);

            // Sıfır Çizgisi (Referans)
            const zeroLine = chart.addLineSeries({
                color: "#555",
                lineWidth: 1,
                lineStyle: 2 // Kesikli çizgi
            });
            // Sadece görsel referans için veri aralığı boyunca 0 basıyoruz
            if(smi.length > 0) {
                zeroLine.setData(smi.map(p => ({ time: p.time, value: 0 })));
            }

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
    }, [JSON.stringify({ smi, signal }), height]); // histogram deep check maliyetli olabilir, gerekirse ekle

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightSMIChart;