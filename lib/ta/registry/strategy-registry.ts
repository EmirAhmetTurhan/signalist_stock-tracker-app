// lib/ta/strategy-registry.ts — Canonical source of truth for built-in strategies.
// Defines which indicators are REQUIRED for each strategy.
// When adding a new built-in strategy, add ONE entry here.
// TAIndicatorsButton and other consumers derive their validation logic from this registry.

export interface StrategyRegistryEntry {
    /** Human-readable name */
    label: string;
    /** Indicators that MUST be present for this strategy to function correctly */
    indicators: readonly string[];
    /** Voting mode used by the backtest engine */
    mode: 'all' | 'majority';
    /** Default look-forward bars */
    lookForward: number;
    /** Short description */
    description: string;
}

/**
 * STRATEGY_REGISTRY: single source of truth for all built-in strategies.
 *
 * Usage:
 *   const entry = STRATEGY_REGISTRY['rsi_cci_wt'];
 *   const missing = entry.indicators.filter(i => !activeIndicators.includes(i));
 */
export const STRATEGY_REGISTRY: Record<string, StrategyRegistryEntry> = {
    rsi_cci_wt: {
        label: 'RSI + CCI + WaveTrend',
        indicators: ['rsi', 'cci', 'wavetrend'],
        mode: 'all',
        lookForward: 5,
        description: 'Trade when 3 indicators signal in the same direction',
    },
} as const;

/**
 * Validate that the given indicator set covers all requirements for the strategy.
 *
 * @param strategyKey  - e.g. "rsi_cci_wt"
 * @param indicators   - array of active indicator keys (lowercase)
 * @returns { valid: boolean; missing?: string[] }
 *
 * @example
 * const result = validateStrategyIndicators('rsi_cci_wt', ['rsi', 'cci']);
 * // result.valid   === false
 * // result.missing === ['wavetrend']
 */
export function validateStrategyIndicators(
    strategyKey: string,
    indicators: string[],
): { valid: boolean; missing?: string[] } {
    const entry = STRATEGY_REGISTRY[strategyKey];
    if (!entry) {
        // Unknown strategy key — treat as user-defined (no requirement)
        return { valid: true };
    }
    const missing = entry.indicators.filter(req => !indicators.includes(req));
    if (missing.length === 0) {
        return { valid: true };
    }
    return { valid: false, missing };
}

/**
 * Check whether a given key is a known built-in strategy.
 */
export function isBuiltInStrategy(strategyKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(STRATEGY_REGISTRY, strategyKey);
}
