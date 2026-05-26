'use client';

// components/portfolio/PortfolioOverview.tsx — Hero card with key portfolio metrics
// Animated counters, color-coded P&L, glassmorphism styling

import { useEffect, useState } from 'react';

interface PortfolioOverviewProps {
  portfolio: PortfolioSummaryData | null;
}

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 2 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 600;
    const start = display;
    const diff = value - start;
    const startTime = performance.now();

    function animate(time: number) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span>
      {prefix}{display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

function getPnlColor(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

function getPnlBg(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 border-emerald-500/20';
  if (value < 0) return 'bg-red-500/10 border-red-500/20';
  return 'bg-gray-500/10 border-gray-500/20';
}

export default function PortfolioOverview({ portfolio }: PortfolioOverviewProps) {
  if (!portfolio) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl bg-gray-900/40 border border-gray-800/50 animate-pulse">
            <div className="h-3 w-20 bg-gray-800 rounded mb-3" />
            <div className="h-7 w-28 bg-gray-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Equity',
      value: portfolio.totalEquity,
      prefix: '$',
      color: 'text-white',
      icon: '📊',
    },
    {
      label: 'Total Return',
      value: portfolio.totalReturn,
      prefix: portfolio.totalReturn >= 0 ? '+$' : '-$',
      absValue: Math.abs(portfolio.totalReturn),
      suffix: ` (${portfolio.totalReturnPercent >= 0 ? '+' : ''}${portfolio.totalReturnPercent.toFixed(2)}%)`,
      color: getPnlColor(portfolio.totalReturn),
      icon: portfolio.totalReturn >= 0 ? '📈' : '📉',
    },
    {
      label: 'Unrealized P&L',
      value: portfolio.totalUnrealizedPnl,
      prefix: portfolio.totalUnrealizedPnl >= 0 ? '+$' : '-$',
      absValue: Math.abs(portfolio.totalUnrealizedPnl),
      suffix: ` (${portfolio.totalUnrealizedPnlPercent >= 0 ? '+' : ''}${portfolio.totalUnrealizedPnlPercent.toFixed(2)}%)`,
      color: getPnlColor(portfolio.totalUnrealizedPnl),
      icon: '💹',
    },
    {
      label: "Today's P&L",
      value: portfolio.dayPnl,
      prefix: portfolio.dayPnl >= 0 ? '+$' : '-$',
      absValue: Math.abs(portfolio.dayPnl),
      color: getPnlColor(portfolio.dayPnl),
      icon: '📅',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className={`relative p-5 rounded-xl border backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
            m.label === 'Total Equity'
              ? 'bg-gradient-to-br from-gray-900/80 to-gray-800/40 border-gray-700/50 shadow-[0_0_20px_rgba(59,130,246,0.05)]'
              : `${getPnlBg(m.value)} backdrop-blur-sm`
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{m.label}</span>
            <span className="text-lg">{m.icon}</span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${m.color}`}>
            <AnimatedNumber
              value={m.absValue !== undefined ? m.absValue : m.value}
              prefix={m.absValue !== undefined ? m.prefix : (m.prefix || '$')}
              decimals={2}
            />
          </div>
          {m.suffix && (
            <span className={`text-xs mt-1 ${m.color} opacity-80`}>{m.suffix}</span>
          )}
        </div>
      ))}
    </div>
  );
}
