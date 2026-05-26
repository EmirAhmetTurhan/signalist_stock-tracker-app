// lib/ai/tool-parser.ts — Tool sonuclarini normalize eden parser
// AI SDK v6 (tool-invocation) + v4/v5 (tool-call/tool-result) formatlarini tek tipe cevirir

import { normalizeMessage, type CanonicalPart } from './message-format';

type Message = {
  id: string;
  role: string;
  parts?: any[];
};

export type NormalizedToolResult = {
  toolName: string;
  toolCallId?: string;
  data: Record<string, unknown>;
  isError: boolean;
};

// Sadece arkaplanda çalisan / tool-call durumunda olan araçlari gosteren "Aborted" kontrolü vs. icin lazim.
export function getAllToolResults(message: Message): NormalizedToolResult[] {
  const canonical = normalizeMessage(message);
  const results: NormalizedToolResult[] = [];
  const seenCallIds = new Set<string>();

  // Ters sirada iterate: son eklenen part (addToolOutput ile gelebilecek) once islensin
  for (let i = canonical.parts.length - 1; i >= 0; i--) {
    const part = canonical.parts[i] as CanonicalPart;

    if (part.type === 'tool-result') {
      if (!seenCallIds.has(part.toolCallId)) {
        seenCallIds.add(part.toolCallId);
        results.push({
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          data: (part.output as Record<string, unknown>) || {},
          isError: part.isError,
        });
      }
    }
    
    // Include askClarification even if it's just a call (client-side execution pause)
    if (part.type === 'tool-call' && part.toolName === 'askClarification') {
      if (!seenCallIds.has(part.toolCallId)) {
        seenCallIds.add(part.toolCallId);
        results.push({
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          data: (part.input as Record<string, unknown>) || {},
          isError: false,
        });
      }
    }
  }

  return results;
}

export function getFailedToolResults(message: Message): NormalizedToolResult[] {
  return getAllToolResults(message).filter((r) => r.isError);
}

export function getSuccessfulToolResults(message: Message): NormalizedToolResult[] {
  return getAllToolResults(message).filter((r) => !r.isError);
}

export function isOptimizeParamCall(message: Message): boolean {
  const canonical = normalizeMessage(message);
  return canonical.parts.some((p) => p.type === 'tool-call' && p.toolName === 'optimizeParameter');
}

export function hasOptimizeParamResult(message: Message): boolean {
  const canonical = normalizeMessage(message);
  return canonical.parts.some((p) => p.type === 'tool-result' && p.toolName === 'optimizeParameter');
}
