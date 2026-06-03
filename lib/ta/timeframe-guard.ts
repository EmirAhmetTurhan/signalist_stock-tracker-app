// lib/ta/timeframe-guard.ts — Centralized Timeframe Validation
// SPRINT 3: '1wk' removed. Only 4h (swing) and 1d (daily) data enters the
// discovery pipeline. Blocks 1h, 1M, 1wk, and any unsupported intervals at
// the code level.

/** The set of allowed timeframes for the discovery pipeline. */
export const ALLOWED_TIMEFRAMES = new Set(['4h', '1d']);

/** Human-readable labels for rejected timeframes. */
const DISALLOWED_LABELS: Record<string, string> = {
    '1h': '1-hour (1h)',
    '1H': '1-hour (1H)',
    '60': '1-hour (60 min)',
    '1M': '1-month (1M)',
    '30': '30-minute (30 min)',
    '15': '15-minute (15 min)',
    '5': '5-minute (5 min)',
    '1': '1-minute (1 min)',
    '1wk': '1-week (1wk) — removed in Sprint 3',
    '1W': '1-week (1W) — removed in Sprint 3',
};

/**
 * Validate that the given interval is one of the allowed timeframes
 * for the discovery/optimization pipeline.
 *
 * Allowed: '4h', '1d'
 * Blocked: '1h', '1M', '1wk', and any other unsupported value
 *
 * @param interval - The timeframe string to validate
 * @param context  - Optional description of the call site for error messages
 * @returns The validated interval (for chaining / type narrowing)
 * @throws Error if the interval is not in the allowed set
 */
export function assertAllowedTimeframe(interval: string, context?: string): string {
    const normalised = interval?.toLowerCase().trim() ?? '';

    if (ALLOWED_TIMEFRAMES.has(normalised)) {
        return normalised;
    }

    const label = DISALLOWED_LABELS[interval] ?? `"${interval}"`;
    const ctx = context ? ` [${context}]` : '';

    throw new Error(
        `[TimeframeGuard] Blocked disallowed timeframe ${label}${ctx}. ` +
        `The discovery pipeline only supports: 4h (4-hour) and 1d (daily). ` +
        `Timeframes like 1h, 1M, and 1wk are intentionally excluded ` +
        `to prevent computational noise and erroneous signals.`
    );
}

/**
 * Check if a given interval is allowed without throwing.
 * Useful for conditional logic before fallback to a default.
 */
export function isAllowedTimeframe(interval: string): boolean {
    return ALLOWED_TIMEFRAMES.has(interval?.toLowerCase().trim() ?? '');
}
