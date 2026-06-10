// lib/ta/indicator-all-data-map.ts — Shared mapping: indicator key → AllData field
// Extracted from strategy-optimizer.ts and ga-optimizer.ts to eliminate DRY violation.
// Both files import from here instead of duplicating the map.
//
// IMPORTANT: This file must NOT import from strategy-optimizer.ts or ga-optimizer.ts
// to avoid circular dependencies. It only imports the AllData type.

import type { AllData } from '@/lib/ta/strategy-optimizer';

/**
 * Map lowercase indicator key → AllData field key for recomputation injection.
 * Used by:
 * - strategy-optimizer.ts: optimizeStrategyParams (carry-forward optimization)
 * - ga-optimizer.ts: recomputeIndicator, recomputeAllIndicators
 *
 * When adding a new indicator, add its mapping here AND in AllData interface.
 */
export const INDICATOR_TO_ALLDATA_FIELD: Record<string, keyof AllData> = {
    'rsi': 'rsiData',
    'macd': 'macdData',
    'stochrsi': 'stochRsiData',
    'wavetrend': 'waveTrendData',
    'dmi': 'dmiData',
    'mfi': 'mfiData',
    'smi': 'smiData',
    'cci': 'cciData',
    'wpr': 'wprData',
    'di': 'diData',
    'cmf': 'cmfData',
    'madr': 'madrData',
    'alma': 'almaData',
    'bb': 'bbData',
    'ao': 'aoData',
    'ad': 'adData',
    'netvol': 'nvData',
};
