/**
 * Shared test utilities for indicator reference/snapshot testing.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   import { expectOutputCloseTo } from '@/__tests__/helpers/indicator-test-utils';
 *
 *   it('matches TV reference', () => {
 *     const result = computeRSI(fixture.input);
 *     expectOutputCloseTo(result, fixture.expected, 1e-4);
 *   });
 *
 * ── Tolerance Strategy ──────────────────────────────────────────────────────
 *
 *   SMA, SMMA            1e-9  — Exact math, no rounding
 *   EMA ('value' seed)   1e-9  — Deterministic formula
 *   EMA ('sma' seed)     1e-9  — Deterministic formula
 *   RSI                  1e-4  — TradingView rounds intermediates
 *   MACD                 1e-4  — Double EMA accumulation
 *   Bollinger Bands      1e-4  — StdDev + EMA accumulation
 *   StochRSI             1e-4  — Three smoothing layers
 *   DMI                  1e-4  — Multiple SMMA layers
 *   CCI                  1e-4  — Mean deviation division
 *   WPR                  1e-4  — Range-based
 *   MFI                  1e-4  — Rolling sum + division
 *   AO                   1e-9  — Simple SMA difference
 *   SMI                  1e-4  — Double EMA + ratio
 *   WaveTrend            1e-4  — EMA chain + division
 *   CMF                  1e-6  — Rolling sum ratio
 *   Demand Index         1e-4  — EMA smoothing layers
 */

import { expect } from 'vitest';

/**
 * Compare two arrays of indicator output objects within tolerance.
 * Skips undefined values (warmup periods where indicators haven't converged).
 *
 * @param actual   — Output from our compute function
 * @param expected — Expected output (from TradingView or manual calculation)
 * @param tolerance — Maximum acceptable absolute difference (default: 1e-9)
 */
export function expectOutputCloseTo<T extends Record<string, unknown>>(
    actual: T[],
    expected: T[],
    tolerance = 1e-9,
): void {
    expect(actual.length).toBe(expected.length);

    for (let i = 0; i < actual.length; i++) {
        const act = actual[i];
        const exp = expected[i];

        // Collect all keys from both objects
        const allKeys = new Set([...Object.keys(act), ...Object.keys(exp)]);

        for (const key of allKeys) {
            const aVal = (act as Record<string, unknown>)[key];
            const eVal = (exp as Record<string, unknown>)[key];

            if (typeof aVal === 'number' && typeof eVal === 'number') {
                // Numeric comparison within tolerance
                const diff = Math.abs(aVal - eVal);
                if (diff > tolerance) {
                    throw new Error(
                        `Mismatch at index ${i}, key "${key}": ` +
                        `expected ${eVal}, got ${aVal} (diff=${diff}, tolerance=${tolerance})`,
                    );
                }
            } else if (aVal !== eVal && !(aVal === undefined && eVal === undefined)) {
                // Non-numeric comparison (strings, booleans, undefined)
                // Both undefined is OK (warmup), but one defined and other not is an error
                throw new Error(
                    `Mismatch at index ${i}, key "${key}": ` +
                    `expected ${JSON.stringify(eVal)}, got ${JSON.stringify(aVal)}`,
                );
            }
        }
    }
}

/**
 * Generate a human-readable diff report for debugging mismatches.
 * Useful when a reference test fails and you need to compare values visually.
 */
export function diffReport<T extends Record<string, unknown>>(
    actual: T[],
    expected: T[],
    label: string,
): string {
    const lines: string[] = [`=== ${label} ===`];
    const keys = new Set<string>();
    for (const obj of [...actual, ...expected]) {
        for (const k of Object.keys(obj)) keys.add(k);
    }
    const keyList = [...keys];
    const header = ['idx', ...keyList].join('\t');
    lines.push(header);
    lines.push('-'.repeat(header.length));

    const maxRows = Math.min(actual.length, expected.length, 200); // cap at 200 rows
    for (let i = 0; i < maxRows; i++) {
        const actVals = keyList.map(k => {
            const v = (actual[i] as Record<string, unknown>)[k];
            return v === undefined ? '—' : String(typeof v === 'number' ? v.toFixed(6) : v);
        });
        const expVals = keyList.map(k => {
            const v = (expected[i] as Record<string, unknown>)[k];
            return v === undefined ? '—' : String(typeof v === 'number' ? v.toFixed(6) : v);
        });
        lines.push(`A ${i}\t${actVals.join('\t')}`);
        lines.push(`E ${i}\t${expVals.join('\t')}`);
    }
    return lines.join('\n');
}
