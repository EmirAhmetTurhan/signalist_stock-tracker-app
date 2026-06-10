// lib/ta/strategy-optimizer.ts — Strategy-level optimization & discovery engine wrapper
// Re-exports functions and types from split files under strategy-optimizer/ directory.

// Re-export type definitions for backward compatibility
export type {
    AllData,
    StrategyBacktestConfig,
    StrategyBacktestResult,
    StrategyOptimizationConfig,
    RoundResult,
    StrategyOptimizationResult,
    DiscoveredStrategy,
    DiscoveryResult,
    ProfileConfig,
} from './strategy-optimizer/types';

// Re-export runStrategyBacktest and its helper functions/constants
export {
    mapComputedToAllData,
    PROFILE_CONFIGS,
    getProfileConfig,
    detectRegime,
    getBetaPosterior,
    evaluateGeneralizationScore,
    runStrategyBacktest,
    getIndicatorSignal,
    hasFreshCrossover,
} from './strategy-optimizer/run-backtest';

// Re-export optimizeStrategyParams
export {
    optimizeStrategyParams,
} from './strategy-optimizer/optimize-params';

// Re-export discoverStrategy
export {
    discoverStrategy,
} from './strategy-optimizer/discover-strategy';

// Re-export DISCOVERY_POOL
export {
    DISCOVERY_POOL,
} from './registry/indicator-registry';
