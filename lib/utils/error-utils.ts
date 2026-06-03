// lib/utils/error-utils.ts — Shared error handling utilities
// Consumed by all lib/actions/*.ts and server-side code.

/**
 * Standardized error logging with context prefix.
 * Example: logError('Alerts', error) → "[Alerts] Something went wrong"
 */
export function logError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${context}] ${message}`);
}

/**
 * Convert unknown error to human-readable string.
 */
export function formatError(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}
