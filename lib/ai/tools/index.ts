// lib/ai/tools/index.ts — Unified AI tools factory
// All 22 tools organized by category: TA, Research, User, Portfolio + askClarification meta-tool

import { tool } from 'ai';
import { z } from 'zod';
import { createTATools } from './ta';

// Re-export helpers for consumers
export { toToolError, formatError, safeResult, mapIndicatorData } from './helpers';
export type { ToolResult } from './helpers';

// ─── askClarification (meta-tool) ───────────────────────────────────────────

function createClarificationTool() {
  return tool({
    description: '[SYSTEM] Use this tool when you are missing required arguments to fulfill the user\'s request (like missing stock symbol, indicator name, or timeframe). It halts execution and renders a UI for the user to pick or type the missing information.',
    inputSchema: z.object({
      missingFields: z.array(z.string()).describe('List of missing fields (e.g. ["symbol", "indicator"])'),
      question: z.string().describe('A clear question to ask the user in Turkish (e.g. "Hangi hisseyi incelememi istersiniz?")'),
      options: z.array(z.string()).optional().describe('Optional quick-reply options as buttons (e.g. ["AAPL", "TSLA", "MSFT"])'),
    }),
    execute: async ({ missingFields, question, options }) => {
      return { success: true, isClarification: true, missingFields, question, options: options || [] };
    },
  });
}

// ─── Main factory — merges all categories ───────────────────────────────────

/**
 * Returns all 22 AI tools for the given user.
 * Tools are organized by category but exposed as a flat namespace
 * for AI SDK compatibility.
 */
export function getTools(userId?: string | null) {
  // Each category factory is imported when this function is called
  // (cached by module system after first import)

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createResearchTools } = require('./research');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createUserTools } = require('./user');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createPortfolioTools } = require('./portfolio');

  return {
    askClarification: createClarificationTool(),
    ...createTATools(userId),
    ...createResearchTools(userId),
    ...createUserTools(userId),
    ...createPortfolioTools(userId),
  };
}
