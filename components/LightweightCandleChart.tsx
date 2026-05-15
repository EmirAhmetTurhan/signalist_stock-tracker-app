"use client";

import { useEffect, useRef } from "react";
import { CandlePattern } from "@/lib/indicators/candlePatterns";

type Props = {
  data: CandleDataPoint[];
  height?: number;
  almaData?: { time: string | number; value: number }[];
  almaStyleConfig?: { color: string; opacity: number; width: number; style: number };
  bbData?: { time: string | number; basis: number; upper: number; lower: number }[];
  bbStyleConfig?: { color: string; opacity: number; width: number };
  candlePatterns?: CandlePattern[];
  fractalProjection?: { time: number; value: number }[];
  srLevels?: Array<{ price: number; type: 'support' | 'resistance'; touches: number; strength: number }>;
};

function hexToRgba(hex: string, opacity: number) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(x => x + x).join('');
  if (cleanHex.length !== 6) return hex;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

const LightweightCandleChart = ({ data, height = 520, almaData, almaStyleConfig, bbData, bbStyleConfig, candlePatterns, fractalProjection, srLevels }: Props) => {
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

      // 1. Draw Candlesticks
      series = chart.addCandlestickSeries({
        upColor: "#0FEDBE",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#0FEDBE",
        wickDownColor: "#ef4444",
        wickUpColor: "#0FEDBE",
      });
      series.setData(data);

      // 2. Draw Candle Pattern Markers
      if (candlePatterns && candlePatterns.length > 0) {
        const markers = candlePatterns
          .map((p) => ({
            time: p.time as any,
            position: p.signal === 'bearish' ? 'aboveBar' : 'belowBar',
            color: p.signal === 'bullish' ? '#0FEDBE' : p.signal === 'bearish' ? '#ef4444' : '#f59e0b',
            shape: p.signal === 'bullish' ? 'arrowUp' : p.signal === 'bearish' ? 'arrowDown' : 'circle',
            text: p.label,
            size: Math.max(1, Math.round(p.strength * 2)),
          }))
          .sort((a, b) => (a.time as number) - (b.time as number));

        try {
          series.setMarkers(markers);
        } catch (e) {
          console.warn('Could not set pattern markers:', e);
        }
      }

      // 2b. Draw S/R price lines on the candlestick series
      if (srLevels && srLevels.length > 0) {
        for (const lvl of srLevels) {
          try {
            series.createPriceLine({
              price: lvl.price,
              color: lvl.type === 'support'
                ? `rgba(16, 185, 129, ${0.4 + lvl.strength * 0.5})`   // emerald
                : `rgba(239, 68, 68,  ${0.4 + lvl.strength * 0.5})`,  // red
              lineWidth: lvl.touches >= 3 ? 2 : 1,
              lineStyle: 1, // Dashed
              axisLabelVisible: true,
              title: `${lvl.type === 'support' ? 'S' : 'R'} ${lvl.touches}×`,
            });
          } catch { }
        }
      }

      // 3. Draw ALMA
      if (almaData && almaData.length > 0) {
        const styleConf = almaStyleConfig || { color: '#fbbf24', opacity: 100, width: 2, style: 0 };
        const almaSeries = chart.addLineSeries({
          color: hexToRgba(styleConf.color, styleConf.opacity),
          lineWidth: styleConf.width,
          lineStyle: styleConf.style,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        almaSeries.setData(almaData);
      }

      // 3. Draw Bollinger Bands lines and Custom Fill Primitive
      if (bbData && bbData.length > 0) {
        const styleConf = bbStyleConfig || { color: '#3b82f6', opacity: 100, width: 1 };
        const lineColor = hexToRgba(styleConf.color, styleConf.opacity);
        const bgColor = hexToRgba(styleConf.color, Math.max(5, styleConf.opacity * 0.12));

        const upperSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        upperSeries.setData(bbData.map(d => ({ time: d.time, value: d.upper })));

        const lowerSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        lowerSeries.setData(bbData.map(d => ({ time: d.time, value: d.lower })));

        const basisSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        basisSeries.setData(bbData.map(d => ({ time: d.time, value: d.basis })));

        // Attach custom primitive for filling between upper and lower bands
        class BandsFillPrimitive {
          chart: any;
          series: any;
          data: any[];
          color: string;

          constructor(chartApi: any, seriesApi: any, bandsData: any[], fillColor: string) {
            this.chart = chartApi;
            this.series = seriesApi;
            this.data = bandsData;
            this.color = fillColor;
          }

          updateAllViews() { }

          paneViews() {
            return [{
              zOrder: () => 'bottom', // Behind the series lines, but above grid
              renderer: () => ({
                draw: (target: any) => {
                  const drawFill = (ctx: CanvasRenderingContext2D) => {
                    const timeScale = this.chart.timeScale();
                    ctx.save();
                    ctx.fillStyle = this.color;
                    ctx.beginPath();

                    let hasPoints = false;

                    // Draw upper edge
                    for (let i = 0; i < this.data.length; i++) {
                      const d = this.data[i];
                      const x = timeScale.timeToCoordinate(d.time);
                      const y = this.series.priceToCoordinate(d.upper);
                      if (x === null || y === null) continue;
                      if (!hasPoints) { ctx.moveTo(x, y); hasPoints = true; }
                      else { ctx.lineTo(x, y); }
                    }

                    // Draw lower edge backwards
                    for (let i = this.data.length - 1; i >= 0; i--) {
                      const d = this.data[i];
                      const x = timeScale.timeToCoordinate(d.time);
                      const y = this.series.priceToCoordinate(d.lower);
                      if (x === null || y === null) continue;
                      ctx.lineTo(x, y);
                    }

                    if (hasPoints) {
                      ctx.fill();
                    }
                    ctx.restore();
                  };

                  if (target.useMediaCoordinateSpace) {
                    target.useMediaCoordinateSpace((scope: any) => drawFill(scope.context));
                  } else {
                    drawFill(target.context || target);
                  }
                }
              })
            }];
          }
        }

        try {
          basisSeries.attachPrimitive(new BandsFillPrimitive(chart, basisSeries, bbData, bgColor) as any);
        } catch (e) {
          console.error("Could not attach custom primitive:", e);
        }
      }

      // 5. Draw Fractal Ghost Projection Line
      if (fractalProjection && fractalProjection.length > 1) {
        try {
          const ghostSeries = chart.addLineSeries({
            color: 'rgba(251, 191, 36, 0.75)',   // amber-400 semi-transparent
            lineWidth: 2,
            lineStyle: 1,                         // 1 = Dashed
            crosshairMarkerVisible: true,
            lastValueVisible: true,
            priceLineVisible: false,
            title: 'Projected Path',
          });
          ghostSeries.setData(
            fractalProjection.map(p => ({ time: p.time as any, value: p.value }))
          );
        } catch (e) {
          console.warn('Could not draw fractal projection:', e);
        }
      }

      try {
        // Ensure the full data range is visible
        chart.timeScale().fitContent();
      } catch { }

      // keep responsive
      ro = new ResizeObserver(() => {
        try {
          chart?.applyOptions({ width: container.clientWidth, height });
        } catch { }
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      try { ro?.disconnect(); } catch { }
      try { chart?.remove?.(); } catch { }
    };
  }, [JSON.stringify(data), JSON.stringify(almaData), JSON.stringify(almaStyleConfig), JSON.stringify(bbData), JSON.stringify(bbStyleConfig), JSON.stringify(candlePatterns), JSON.stringify(fractalProjection), JSON.stringify(srLevels), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCandleChart;
