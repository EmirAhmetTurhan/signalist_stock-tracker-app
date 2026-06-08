// =============================================================================
// _math.ts — Central Math Core
//
// Common MA functions used by all technical indicators.
// Purpose: Unify 3 different EMA, 5 different SMA implementations into a single source.
// =============================================================================

// ─── Helper Type ────────────────────────────────────────────────────────────
type Numeric = number | undefined;

// ─── Exponential Moving Average (EMA) ──────────────────────────────────────
//
// Two seed strategies:
//   'value' — Seed with first value (TradingView compatible, for MACD)
//   'sma'   — Seed with SMA of first `period` values (standard approach)
//
export function createEMA(
    values: Numeric[],
    period: number,
    seed: 'value' | 'sma' = 'sma'
): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n === 0 || period <= 0) return out;

    const k = 2 / (period + 1);

    // Find first valid index
    let firstIdx = -1;
    for (let i = 0; i < n; i++) {
        if (typeof values[i] === 'number') { firstIdx = i; break; }
    }
    if (firstIdx === -1) return out;

    if (seed === 'value') {
        // TradingView compatible: seed with first value
        let prev = Number(values[firstIdx] ?? 0);
        out[firstIdx] = prev;
        for (let i = firstIdx + 1; i < n; i++) {
            const v = typeof values[i] === 'number' ? (values[i] as number) : prev;
            prev = v * k + prev * (1 - k);
            out[i] = prev;
        }
    } else {
        // Standard: seed with SMA
        if (n - firstIdx < period) return out;

        let sum = 0;
        for (let i = firstIdx; i < firstIdx + period; i++) {
            sum += values[i] as number;
        }
        let prev = sum / period;
        out[firstIdx + period - 1] = prev;

        for (let i = firstIdx + period; i < n; i++) {
            const v = typeof values[i] === 'number' ? (values[i] as number) : prev;
            prev = v * k + prev * (1 - k);
            out[i] = prev;
        }
    }

    return out;
}

// ─── Wilder's Smoothing (SMMA) ─────────────────────────────────────────────
//
// CORRECT formula: prev = (prev * (period - 1) + cur) / period
// WRONG formula:   prev = prev - prev / period + cur  (cumulative sum, seen in DMI)
//
// For RSI, DMI (+DI/-DI/ADX), and other Wilder's Smoothing based indicators.
//
export function createSMMA(values: number[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n < period || period <= 0) return out;

    // SMA seed
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += Number(values[i] ?? 0);
    }
    let prev = sum / period;
    out[period - 1] = prev;

    // Wilder's Smoothing
    for (let i = period; i < n; i++) {
        const cur = Number(values[i] ?? 0);
        prev = (prev * (period - 1) + cur) / period;
        out[i] = prev;
    }

    return out;
}

// ─── Simple Moving Average (SMA) ───────────────────────────────────────────
//
// Pine Script compatible: undefined (na) values count as 0 in sum,
// but window position is preserved. First output at index `period-1`
// (same as ta.sma).
//
// Previous behavior: undefined values were skipped entirely → caused window
// drift and output delayed to `2*period-2` (root cause of CCI MAD bug).
//
// CIRCULAR BUFFER IMPLEMENTATION (O(n) single pass, 0 per-bar allocation):
// Old version used `window.push() + window.shift() + window.filter()`
// → O(n) per bar → 17 indicators × 500 bars × 15K GA eval = 127M array allocations.
// New version: pre-allocated fixed-size buffer + rotating index + running sum.
export function createSMA(values: Numeric[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n <= 0 || period <= 0) return out;

    // Pre-allocated circular buffer (reuse across iterations, no allocation)
    const buffer: Numeric[] = new Array(period);
    let bufferIdx = 0;       // Next write position (rotating)
    let bufferCount = 0;     // Current element count in window (cannot exceed period)
    let sum = 0;             // Sum of defined (number) values in window
    let definedCount = 0;    // Count of defined values in window

    for (let i = 0; i < n; i++) {
        const v = values[i];

        // If window is full, remove oldest element (rotating out)
        if (bufferCount === period) {
            const oldest = buffer[bufferIdx];
            if (typeof oldest === 'number') {
                sum -= oldest;
                definedCount--;
            }
        } else {
            bufferCount++;
        }

        // Write new element to buffer
        buffer[bufferIdx] = v;
        if (typeof v === 'number') {
            sum += v;
            definedCount++;
        }

        // Advance circular index
        bufferIdx = (bufferIdx + 1) % period;

        // Window full AND at least 1 valid value → SMA output
        // BUGFIX: divide by definedCount (not period) so undefined warmup bars
        // don't bias the average downward. With sum/period, a single defined value
        // in a 14-bar window gives 1/14th the real value, poisoning all dependent
        // MA calculations (RSI-MA, CCI-MA, Bollinger, AO, etc.) for 13+ bars.
        if (bufferCount === period && definedCount > 0) {
            out[i] = sum / definedCount;
        }
    }

    return out;
}

// ─── Mean Absolute Deviation (Pine Script ta.dev compatible) ──────────────
//
// Pine Script: ta.dev(source, length) = sum(|source - mean|, length) / length
//   where mean = ta.sma(source, length)[i] (CURRENT bar's SMA for ALL terms)
//
// CRITICAL DIFFERENCE: createSMA(absDiff, period) uses historical SMA
// for each term, while ta.dev() uses the SAME mean (current SMA). This
// difference significantly impacts CCI calculation.
//
// Output: First valid value at index `period-1` (same as ta.dev).
//
export function createDev(values: number[], period: number): Numeric[] {
    const n = values.length;
    const out: Numeric[] = new Array(n).fill(undefined);
    if (n < period || period <= 0) return out;

    // SMA of values (same as ta.sma(source, length))
    const smas = createSMA(values, period);

    for (let i = period - 1; i < n; i++) {
        const mean = smas[i];
        if (typeof mean !== 'number') continue;

        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sum += Math.abs(values[j] - mean);
        }
        out[i] = sum / period;
    }

    return out;
}
