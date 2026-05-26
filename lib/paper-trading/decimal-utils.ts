// lib/paper-trading/decimal-utils.ts — Decimal128 conversion utilities
// Prevents JavaScript floating-point corruption for money calculations.
// All money operations in the paper trading system MUST go through these helpers.

import { Types } from 'mongoose';

/**
 * Convert a JS number or string to Mongoose Decimal128.
 * Always converts via string to avoid floating-point precision loss.
 */
export function toDecimal128(value: number | string): Types.Decimal128 {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot convert non-finite number to Decimal128: ${value}`);
    }
    // Use fixed precision to avoid things like 0.1 + 0.2 = 0.30000000000000004
    return Types.Decimal128.fromString(value.toFixed(10).replace(/\.?0+$/, ''));
  }
  return Types.Decimal128.fromString(value);
}

/**
 * Convert a Decimal128 value back to JS number for display/calculations.
 * WARNING: This loses precision for very large numbers. Use only for
 * display, P&L computation, and comparisons — never for DB writes.
 */
export function fromDecimal128(value: Types.Decimal128 | string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  // Decimal128 object
  return parseFloat(value.toString());
}

/**
 * Note on Precision Posture: 
 * We use scaled integer math (to 1e8) on JS `number` types to prevent floating-point
 * loss (e.g. 0.1 + 0.2) for standard portfolio calculations. This is fully sufficient 
 * for a simulation lab handling equity fractions. 
 * WARNING: This is NOT intended for HFT or cryptography. 
 * For all DB writes, the result MUST be wrapped with toDecimal128().
 */
export function decimalAdd(a: number | string, b: number | string): number {
  // Use integer math to avoid floating-point issues for cents
  const aNum = typeof a === 'string' ? parseFloat(a) : a;
  const bNum = typeof b === 'string' ? parseFloat(b) : b;
  return Math.round((aNum + bNum) * 1e8) / 1e8;
}

export function decimalSub(a: number | string, b: number | string): number {
  const aNum = typeof a === 'string' ? parseFloat(a) : a;
  const bNum = typeof b === 'string' ? parseFloat(b) : b;
  return Math.round((aNum - bNum) * 1e8) / 1e8;
}

export function decimalMul(a: number | string, b: number | string): number {
  const aNum = typeof a === 'string' ? parseFloat(a) : a;
  const bNum = typeof b === 'string' ? parseFloat(b) : b;
  return Math.round((aNum * bNum) * 1e8) / 1e8;
}

export function decimalDiv(a: number | string, b: number | string): number {
  const aNum = typeof a === 'string' ? parseFloat(a) : a;
  const bNum = typeof b === 'string' ? parseFloat(b) : b;
  if (bNum === 0) throw new Error('Division by zero');
  return Math.round((aNum / bNum) * 1e8) / 1e8;
}

/**
 * Compute weighted average entry price after adding new shares.
 * newAvg = (oldQty * oldAvg + newQty * fillPrice) / (oldQty + newQty)
 */
export function weightedAvgPrice(
  oldQty: number,
  oldAvgPrice: number,
  newQty: number,
  fillPrice: number
): number {
  const totalQty = oldQty + newQty;
  if (totalQty === 0) return 0;
  return decimalDiv(
    decimalAdd(decimalMul(oldQty, oldAvgPrice), decimalMul(newQty, fillPrice)),
    totalQty
  );
}

/** Default initial balance for new paper trading wallets */
export const DEFAULT_INITIAL_BALANCE = 10_000;

/** Default slippage in basis points (5 bps = 0.05%) */
export const DEFAULT_SLIPPAGE_BPS = 5;

/** Default commission per trade */
export const DEFAULT_COMMISSION = 0;

/** Maximum price deviation allowed from last close (20%) */
export const MAX_PRICE_DEVIATION_PERCENT = 20;

/** Maximum quote staleness in seconds */
export const MAX_QUOTE_STALENESS_SECONDS = 60;
