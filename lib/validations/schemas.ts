import { z } from 'zod';

// ---- Auth ----

export const signInSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format")
    .max(255, "Email is too long"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export const signUpSchema = z.object({
  fullName: z
    .string({ required_error: "Name is required" })
    .min(1, "Name is required")
    .max(100, "Name is too long"),
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email format")
    .max(255, "Email is too long"),
  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
  country: z.string().max(100).optional(),
  investmentGoals: z.string().max(100).optional(),
  riskTolerance: z.string().max(50).optional(),
  preferredIndustry: z.string().max(100).optional(),
});

// ---- Stock Search ----

export const stockSymbolSchema = z
  .string()
  .min(1)
  .max(10)
  .transform((s) => s.toUpperCase().trim())
  .pipe(z.string().regex(/^[A-Z0-9.]{1,10}$/, "Invalid stock symbol format"));

export const searchQuerySchema = z.string().max(50).optional();

// ---- Price Alerts ----

export const alertTypeSchema = z.enum(["upper", "lower"]);

export const createAlertSchema = z.object({
  symbol: stockSymbolSchema,
  company: z.string().min(1).max(200),
  alertName: z.string().min(1).max(100),
  alertType: alertTypeSchema,
  threshold: z
    .number({ required_error: "Threshold must be a number", invalid_type_error: "Threshold must be a number" })
    .positive("Threshold must be positive"),
});

export const updateAlertSchema = z.object({
  alertId: z.string().min(1),
  threshold: z
    .number({ required_error: "Threshold must be a number", invalid_type_error: "Threshold must be a number" })
    .positive("Threshold must be positive"),
});

// ---- Watchlist ----

export const watchlistItemSchema = z.object({
  symbol: stockSymbolSchema,
  company: z.string().min(1).max(200),
});

// ---- AI Agent Tools (ileride kullanılacak) ----

export const indicatorAnalysisRequestSchema = z.object({
  symbol: stockSymbolSchema,
  interval: z.enum(["1d", "4h"]).default("1d"),
  indicators: z.array(z.string()).min(1).max(10),
});

// ---- Utility ----

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Zod şemasıyla veriyi doğrula, sonucu normalize et.
 * Server Actions içinde kullanılmak üzere.
 */
export function validate<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  const message = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { success: false, error: message };
}
