// lib/ai/message-format.ts — Canonical Message Format Layer
// Centralized normalization for the 4 different message formats circulating in the system.

export type CanonicalPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError: boolean }
  | { type: 'reasoning'; text: string };

export type CanonicalMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | 'data';
  parts: CanonicalPart[];
};

export function normalizePart(part: any): CanonicalPart | null {
  if (!part) return null;

  if (part.type === 'text') {
    return { type: 'text', text: part.text || '' };
  }

  if (part.type === 'reasoning') {
    return { type: 'reasoning', text: part.text || part.reasoning || '' };
  }

  // Tool Call extraction (AI SDK v4, v6)
  if (part.type === 'tool-call' || (part.type === 'tool-invocation' && part.toolInvocation?.state === 'call')) {
    const p = part.toolInvocation || part;
    const callId = p.toolCallId || p.toolName || crypto.randomUUID();
    const args = p.args || p.input || {};
    return { type: 'tool-call', toolCallId: callId, toolName: p.toolName, input: args };
  }

  // Tool Result extraction (AI SDK v4, v6)
  if (part.type === 'tool-result' || (part.type === 'tool-invocation' && part.toolInvocation?.state === 'result')) {
    const p = part.toolInvocation || part;
    const callId = p.toolCallId || p.toolName || crypto.randomUUID();
    const data = p.result || p.output?.value || p.output || {};
    const isError = data.success === false || data.error != null;
    return { type: 'tool-result', toolCallId: callId, toolName: p.toolName, output: data, isError };
  }

  // askClarification is a special case: we often halt the stream, meaning we only get a tool-call.
  // The UI treats it as a tool-result functionally to render the ClarificationForm.
  // We'll let `tool-parser.ts` handle that semantic override, but here we just parse it as a tool-call.

  return null;
}

export function normalizeMessage(msg: any): CanonicalMessage {
  const role = msg.role || 'assistant';
  const id = msg.id || msg._id || crypto.randomUUID();
  
  if (msg.parts && Array.isArray(msg.parts)) {
    const normalizedParts = msg.parts
      .map(normalizePart)
      .filter(Boolean) as CanonicalPart[];
    return { id, role, parts: normalizedParts };
  }

  if (msg.content && typeof msg.content === 'string') {
    return { id, role, parts: [{ type: 'text', text: msg.content }] };
  }

  return { id, role, parts: [] };
}

export function toModelMessages(messages: CanonicalMessage[]): any[] {
  const coreMessages: any[] = [];

  // 1. Gather all fulfilled toolCallIds across the entire conversation history
  const fulfilledToolCallIds = new Set<string>();
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === 'tool-result' && p.toolCallId) {
        fulfilledToolCallIds.add(p.toolCallId);
      }
    }
  }

  for (const m of messages) {
    if (m.parts.length === 0) continue;

    const assistantParts: any[] = [];
    const toolParts: any[] = [];

    for (const p of m.parts) {
      if (p.type === 'tool-result') {
        // Output format matching AI SDK v4+ validation schemas (they expect 'output' instead of 'result')
        // We provide both 'result' for backwards compatibility and 'output' to satisfy Zod
        toolParts.push({ 
          type: 'tool-result', 
          toolCallId: p.toolCallId, 
          toolName: p.toolName, 
          result: p.output,
          output: { type: 'json', value: p.output }
        });
      } else if (p.type === 'tool-call') {
        // AI SDK strictly requires every tool-call to have a matching tool-result.
        // If the user interrupted a tool call (like askClarification) by sending a new text message,
        // we must strip the hanging tool-call to prevent "Invalid prompt: The messages do not match the ModelMessage[] schema"
        if (fulfilledToolCallIds.has(p.toolCallId)) {
          assistantParts.push({ 
            type: 'tool-call', 
            toolCallId: p.toolCallId, 
            toolName: p.toolName, 
            args: p.input,
            input: p.input
          });
        } else {
          console.warn(`[AI] Stripped unfulfilled tool-call from history: ${p.toolName} (${p.toolCallId})`);
        }
      } else if (p.type === 'text') {
        assistantParts.push({ type: 'text', text: p.text });
      }
    }

    // AI SDK strictly requires `tool-result` to be in a `tool` role message,
    // and `tool-call` to be in an `assistant` role message.
    if (assistantParts.length > 0) {
      const mappedRole = (m.role === 'user' || m.role === 'system') ? m.role : 'assistant';
      // Fallback to string if it's just a single text part to satisfy strict schema validation
      if (assistantParts.length === 1 && assistantParts[0].type === 'text') {
        coreMessages.push({ role: mappedRole, content: assistantParts[0].text });
      } else {
        coreMessages.push({ role: mappedRole, content: assistantParts });
      }
    }

    if (toolParts.length > 0) {
      coreMessages.push({ role: 'tool', content: toolParts });
    }
  }

  return coreMessages;
}
