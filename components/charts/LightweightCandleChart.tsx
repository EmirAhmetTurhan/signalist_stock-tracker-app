"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp, Time, SeriesMarkerPosition } from "lightweight-charts";
import { CandlePattern } from "@/lib/indicators/candlePatterns";

// Prop tipleri — page.tsx'teki gerçek veri tipleriyle uyumlu
type Props = {
  data: CandleDataPoint[];
  height?: number;
  almaData?: { time: string | number; value?: number }[];
  almaStyleConfig?: { color: string; opacity: number; width: number; style: number };
  bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
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

// Branded type assertion helpers — runtime maliyeti yok, sadece TypeScript branded type'ı ikna eder
const toUT = (t: number): UTCTimestamp => t as UTCTimestamp;
const toTime = (t: string | number): Time => t as Time;

const LightweightCandleChart = ({ data, height = 520, almaData, almaStyleConfig, bbData, bbStyleConfig, candlePatterns, fractalProjection, srLevels }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart, mod) => {
    // 1. Draw Candlesticks
    const series = chart.addCandlestickSeries({
      upColor: "#0FEDBE",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#0FEDBE",
      wickDownColor: "#ef4444",
      wickUpColor: "#0FEDBE",
    });
    series.setData(data as Parameters<typeof series.setData>[0]);

    // 2. Draw Candle Pattern Markers
    if (candlePatterns && candlePatterns.length > 0) {
      const markers = candlePatterns
        .map((p) => ({
          time: toTime(p.time),
          position: (p.signal === 'bearish' ? 'aboveBar' : 'belowBar') as SeriesMarkerPosition,
          color: p.signal === 'bullish' ? '#0FEDBE' : p.signal === 'bearish' ? '#ef4444' : '#f59e0b',
          shape: (p.signal === 'bullish' ? 'arrowUp' : p.signal === 'bearish' ? 'arrowDown' : 'circle') as 'arrowUp' | 'arrowDown' | 'circle',
          text: p.label,
          size: Math.max(1, Math.round(p.strength * 2)),
        }))
        .sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number));

      try {
        series.setMarkers(markers as Parameters<typeof series.setMarkers>[0]);
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
        } catch { /* ignore */ }
      }
    }

    // 3. Draw ALMA
    if (almaData && almaData.length > 0) {
      const styleConf = almaStyleConfig || { color: '#fbbf24', opacity: 100, width: 2, style: 0 };
      const almaSeries = chart.addLineSeries({
        color: hexToRgba(styleConf.color, styleConf.opacity),
        lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        lineStyle: styleConf.style as 0 | 1 | 2 | 3 | 4,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      almaSeries.setData(
        almaData.map(d => ({ time: toTime(d.time), value: d.value }))
      );
    }

    // 3. Draw Bollinger Bands lines and Custom Fill Primitive
    if (bbData && bbData.length > 0) {
      const styleConf = bbStyleConfig || { color: '#3b82f6', opacity: 100, width: 1 };
      const lineColor = hexToRgba(styleConf.color, styleConf.opacity);
      const bgColor = hexToRgba(styleConf.color, Math.max(5, styleConf.opacity * 0.12));

      const bbAsTime = bbData.map(d => ({ time: toTime(d.time), basis: d.basis, upper: d.upper, lower: d.lower }));

      const upperSeries = chart.addLineSeries({
        color: lineColor,
        lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      upperSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.upper })));

      const lowerSeries = chart.addLineSeries({
        color: lineColor,
        lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      lowerSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.lower })));

      const basisSeries = chart.addLineSeries({
        color: lineColor,
        lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      basisSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.basis })));

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
            zOrder: () => 'bottom' as const,
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
        basisSeries.attachPrimitive(new BandsFillPrimitive(chart, basisSeries, bbAsTime, bgColor) as any);
      } catch (e) {
        console.error("Could not attach custom primitive:", e);
      }
    }

    // 5. Draw Fractal Ghost Projection Line
    if (fractalProjection && fractalProjection.length > 1) {
      try {
        const ghostSeries = chart.addLineSeries({
          color: 'rgba(251, 191, 36, 0.75)',   // amber-400 semi-transparent
          lineWidth: 2 as 1 | 2 | 3 | 4,
          lineStyle: 1 as 0 | 1 | 2 | 3 | 4,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'Projected Path',
        });
        ghostSeries.setData(
          fractalProjection.map(p => ({ time: toUT(p.time), value: p.value }))
        );
      } catch (e) {
        console.warn('Could not draw fractal projection:', e);
      }
    }
  }, [data, almaData, almaStyleConfig, bbData, bbStyleConfig, candlePatterns, fractalProjection, srLevels]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCandleChart;
