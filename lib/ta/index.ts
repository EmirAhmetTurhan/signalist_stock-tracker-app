// lib/ta/index.ts — Barrel export
export { computeIndicators, parseActiveIndicators } from './compute';
export type { ComputedIndicators } from './types';
export { generateAllSignals, computeOverall, addSignal } from './signals';
export type { SignalMap, OverallResult } from './signals';
export type { SignalLabel, IndicatorParams } from './types';
export { SIGNAL_STYLES } from './types';
export * from './registry/signal-registry';
