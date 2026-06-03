// lib/constants/indicator-categories.ts
// Shared color/icon/category definitions for all indicator UI components

export interface IndicatorInfo {
    key: string;
    label: string;
    full: string;
    description: string;
    category: 'momentum' | 'oscillator' | 'volume' | 'trend' | 'demand' | 'patterns';
    color: string;
    icon: string;
    optimizable: boolean;
    popularity: number; // 1–100, higher = more widely used
}

export const INDICATOR_DETAILS: IndicatorInfo[] = [
    // ── Momentum ──────────────────────────────────────────────────────────
    {
        key: 'rsi',
        label: 'RSI',
        full: 'Relative Strength Index',
        description: 'RSI > MA → BUY (< 62), RSI < MA → SELL (> 38)',
        category: 'momentum',
        color: '#22c55e',
        icon: '📈',
        optimizable: true,
        popularity: 100,
    },
    {
        key: 'macd',
        label: 'MACD',
        full: 'Moving Average Convergence Divergence',
        description: 'MACD > Signal → BUY (histogram rising → STRONG)',
        category: 'momentum',
        color: '#3b82f6',
        icon: '📊',
        optimizable: true,
        popularity: 95,
    },
    {
        key: 'stochrsi',
        label: 'StochRSI',
        full: 'Stochastic RSI',
        description: 'K > D → BUY (K < 20 → STRONG), K < D → SELL (K > 80 → STRONG)',
        category: 'momentum',
        color: '#a855f7',
        icon: '📉',
        optimizable: true,
        popularity: 82,
    },
    {
        key: 'cci',
        label: 'CCI',
        full: 'Commodity Channel Index',
        description: 'CCI > MA → BUY (< -100 → STRONG), CCI < MA → SELL (> +100 → STRONG)',
        category: 'momentum',
        color: '#f97316',
        icon: '📐',
        optimizable: true,
        popularity: 72,
    },
    {
        key: 'wavetrend',
        label: 'WaveTrend',
        full: 'WaveTrend Oscillator',
        description: 'WT1 > WT2 → BUY (< -60 → STRONG), WT1 < WT2 → SELL (> +60 → STRONG)',
        category: 'momentum',
        color: '#eab308',
        icon: '🌊',
        optimizable: true,
        popularity: 68,
    },
    {
        key: 'dmi',
        label: 'DMI',
        full: 'Directional Movement Index',
        description: '+DI > -DI → BUY (ADX > 20 → STRONG), -DI > +DI → SELL (ADX > 20 → STRONG)',
        category: 'momentum',
        color: '#ef4444',
        icon: '🧭',
        optimizable: true,
        popularity: 78,
    },
    {
        key: 'wpr',
        label: 'WPR',
        full: "Williams %R",
        description: '< -80 → STRONG BUY, > -20 → STRONG SELL',
        category: 'momentum',
        color: '#f43f5e',
        icon: '📏',
        optimizable: true,
        popularity: 60,
    },

    // ── Oscillator ────────────────────────────────────────────────────────
    {
        key: 'ao',
        label: 'AO',
        full: 'Awesome Oscillator',
        description: 'Value > 0 & rising → BUY, Value < 0 & falling → SELL',
        category: 'oscillator',
        color: '#06b6d4',
        icon: '🔊',
        optimizable: false,
        popularity: 55,
    },
    {
        key: 'smi',
        label: 'SMI',
        full: 'SMI Ergodic Indicator',
        description: 'SMI > Signal → BUY (histogram rising → STRONG)',
        category: 'oscillator',
        color: '#8b5cf6',
        icon: '🌀',
        optimizable: true,
        popularity: 45,
    },

    // ── Volume ────────────────────────────────────────────────────────────
    {
        key: 'mfi',
        label: 'MFI',
        full: 'Money Flow Index',
        description: 'MFI < 20 → STRONG BUY, MFI > 80 → STRONG SELL',
        category: 'volume',
        color: '#84cc16',
        icon: '💰',
        optimizable: true,
        popularity: 76,
    },
    {
        key: 'cmf',
        label: 'CMF',
        full: 'Chaikin Money Flow',
        description: '> 0.05 → STRONG BUY, < -0.05 → STRONG SELL',
        category: 'volume',
        color: '#65a30d',
        icon: '💵',
        optimizable: true,
        popularity: 65,
    },
    {
        key: 'ad',
        label: 'A/D',
        full: 'Accumulation / Distribution',
        description: 'Price crosses above SMA(AD, 21) → BUY, below → SELL',
        category: 'volume',
        color: '#22d3ee',
        icon: '📦',
        optimizable: false,
        popularity: 62,
    },
    {
        key: 'netvol',
        label: 'Net Volume',
        full: 'Net Volume',
        description: '> 0 & rising → BUY, < 0 & falling → SELL',
        category: 'volume',
        color: '#2dd4bf',
        icon: '📊',
        optimizable: false,
        popularity: 42,
    },

    // ── Trend ─────────────────────────────────────────────────────────────
    {
        key: 'alma',
        label: 'ALMA',
        full: 'Arnaud Legoux Moving Average',
        description: 'Price crosses above ALMA → BUY, below → SELL',
        category: 'trend',
        color: '#ec4899',
        icon: '📉',
        optimizable: false,
        popularity: 50,
    },
    {
        key: 'bb',
        label: 'Bollinger',
        full: 'Bollinger Bands',
        description: 'Price bounces off lower band → BUY, off upper → SELL',
        category: 'trend',
        color: '#3b82f6',
        icon: '📦',
        optimizable: false,
        popularity: 92,
    },
    {
        key: 'madr',
        label: 'MADR',
        full: 'Moving Average Deviation Rate',
        description: 'Crosses from negative to positive → BUY (STRONG)',
        category: 'trend',
        color: '#a78bfa',
        icon: '📈',
        optimizable: true,
        popularity: 35,
    },

    // ── Demand ────────────────────────────────────────────────────────────
    {
        key: 'di',
        label: 'DI',
        full: 'Demand Index',
        description: '> 0 & rising → BUY, < 0 & falling → SELL',
        category: 'demand',
        color: '#fb923c',
        icon: '⚡',
        optimizable: true,
        popularity: 40,
    },

    // ── Patterns ──────────────────────────────────────────────────────────
    {
        key: 'patterns',
        label: 'Patterns',
        full: 'Candle Pattern Recognition',
        description: 'Detects doji, hammer, engulfing, morning/evening star, etc.',
        category: 'patterns',
        color: '#94a3b8',
        icon: '🕯️',
        optimizable: false,
        popularity: 88,
    },
    {
        key: 'fractals',
        label: 'Fractals',
        full: 'Historical Fractal Matching',
        description: 'Finds similar historical price patterns and projects outcomes',
        category: 'patterns',
        color: '#64748b',
        icon: '🔀',
        optimizable: false,
        popularity: 30,
    },
    {
        key: 'sr',
        label: 'S/R',
        full: 'Support & Resistance',
        description: 'Detects key support/resistance levels via swing points',
        category: 'patterns',
        color: '#475569',
        icon: '📏',
        optimizable: false,
        popularity: 85,
    },
];

// ─── Helper functions ─────────────────────────────────────────────────────────

export function getIndicatorInfo(key: string): IndicatorInfo | undefined {
    return INDICATOR_DETAILS.find((ind) => ind.key === key);
}

export function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        momentum: 'Momentum',
        oscillator: 'Oscillator',
        volume: 'Volume',
        trend: 'Trend',
        demand: 'Demand',
        patterns: 'Patterns',
    };
    return labels[category] ?? category;
}

export const CATEGORIES = [
    { key: 'momentum', label: 'Momentum', icon: '📊' },
    { key: 'oscillator', label: 'Oscillator', icon: '🔊' },
    { key: 'volume', label: 'Volume', icon: '💰' },
    { key: 'trend', label: 'Trend', icon: '📈' },
    { key: 'demand', label: 'Demand', icon: '⚡' },
    { key: 'patterns', label: 'Patterns', icon: '🕯️' },
] as const;
