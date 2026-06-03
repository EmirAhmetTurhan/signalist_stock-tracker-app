// Barrel export — lib/constants/* import'ları bozulmadan çalışır

export const NAV_ITEMS = [
    { href: '/', label: 'Dashboard' },
    { href: '/search', label: 'Search' },
    { href: '/watchlist', label: 'Watchlist' },
    { href: '/ta', label: 'T/A' },
    { href: '/ai', label: 'AI' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/archive', label: 'Archive' },
];

export const INVESTMENT_GOALS = [
    { value: 'Growth', label: 'Growth' },
    { value: 'Income', label: 'Income' },
    { value: 'Balanced', label: 'Balanced' },
    { value: 'Conservative', label: 'Conservative' },
];

export const RISK_TOLERANCE_OPTIONS = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
];

export const PREFERRED_INDUSTRIES = [
    { value: 'Technology', label: 'Technology' },
    { value: 'Healthcare', label: 'Healthcare' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Energy', label: 'Energy' },
    { value: 'Consumer Goods', label: 'Consumer Goods' },
];

export const ALERT_TYPE_OPTIONS = [
    { value: 'upper', label: 'Upper' },
    { value: 'lower', label: 'Lower' },
];

export const CONDITION_OPTIONS = [
    { value: 'greater', label: 'Greater than (>)' },
    { value: 'less', label: 'Less than (<)' },
];

export {
    MARKET_OVERVIEW_WIDGET_CONFIG,
    HEATMAP_WIDGET_CONFIG,
    TOP_STORIES_WIDGET_CONFIG,
    MARKET_DATA_WIDGET_CONFIG,
    SYMBOL_INFO_WIDGET_CONFIG,
    CANDLE_CHART_WIDGET_CONFIG,
    BASELINE_WIDGET_CONFIG,
    TECHNICAL_ANALYSIS_WIDGET_CONFIG,
    COMPANY_PROFILE_WIDGET_CONFIG,
    COMPANY_FINANCIALS_WIDGET_CONFIG,
} from './widgets';

export {
    POPULAR_STOCK_SYMBOLS,
    NO_MARKET_NEWS,
    WATCHLIST_TABLE_HEADER,
} from './stocks';

export {
    INDICATOR_REGISTRY,
    INDICATOR_KEYS,
    INDICATOR_NAMES,
    INDICATOR_NAMES_STRING,
    OPTIMIZABLE_INDICATOR_NAMES,
    DEFAULT_PARAMS,
} from './indicators';
export type { IndicatorMeta } from './indicators';
