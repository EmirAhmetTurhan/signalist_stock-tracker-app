// lib/actions/_utils.ts — Shared action utilities (error handling, auth guard, DB connect)
'use server';

import { connectToDatabase } from '@/database/mongoose';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Error formatting ───────────────────────────────────────────────────────

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function logActionError(actionName: string, e: unknown): void {
  const msg = formatError(e);
  // Structured error logging — production-ready (replace with pino/winston later)
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${actionName}]`, msg);
  }
}

// ─── Safe action wrapper ────────────────────────────────────────────────────

/**
 * Wraps an async action function with standardized try/catch error handling.
 *
 * Usage:
 *   export const myAction = withErrorHandler('myAction', async (userId, input) => {
 *     await connectToDatabase();
 *     const result = await doSomething(input);
 *     return { success: true, data: result };
 *   });
 */
export async function withErrorHandler<T>(
  actionName: string,
  fn: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  try {
    return await fn();
  } catch (e) {
    logActionError(actionName, e);
    return { success: false, error: formatError(e) };
  }
}

// ─── Auth guard ─────────────────────────────────────────────────────────────

/**
 * Validates that a userId is present and returns a failure response if not.
 * Use at the top of any action that requires authentication.
 */
export function requireAuth(userId: string | undefined | null): ApiResponse<never> | null {
  if (!userId) {
    return { success: false, error: 'Oturum bulunamadı. Lütfen giriş yapın.' };
  }
  return null; // null means "auth OK, continue"
}

// ─── DB connect helper ──────────────────────────────────────────────────────

let dbConnected = false;

/**
 * Ensures DB is connected (lazy, cached). Safe to call at the top of every action.
 */
export async function ensureDb(): Promise<void> {
  if (dbConnected) return;
  await connectToDatabase();
  dbConnected = true;
}
