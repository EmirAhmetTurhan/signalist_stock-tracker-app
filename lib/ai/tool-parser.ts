// lib/ai/tool-parser.ts — Tool sonuclarini normalize eden parser
// AI SDK v6 (tool-invocation) + v4/v5 (tool-call/tool-result) formatlarini tek tipe cevirir

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

// Bir message'daki TUM tool sonuclarini normalize edilmis formatta dondurur.
// Dedup toolCallId bazlidir — ayni toolCallId'ye sahip sonuclardan sadece ILKI alinir
// (ilk gelen "receipt" sonucudur, addToolOutput ile gelen gercek sonuc sonradan eklenir).
// TERS SIRA ile iterate edilir — son eklenen (addToolOutput) part once islenir,
// boylece ayni toolCallId icin en guncel sonuc kazanir.
export function getAllToolResults(message: Message): NormalizedToolResult[] {
  if (!message.parts) return [];
  const results: NormalizedToolResult[] = [];
  const seenCallIds = new Set<string>();

  // Ters sirada iterate: son eklenen part (addToolOutput) once islensin
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];

    // V6: tool-invocation (state: 'result')
    if (part.type === 'tool-invocation' && part.toolInvocation?.state === 'result') {
      const inv = part.toolInvocation;
      const callId = inv.toolCallId || inv.toolName;
      if (!seenCallIds.has(callId)) {
        seenCallIds.add(callId);
        const data = (inv.result || inv.output?.value || inv.output || {}) as Record<string, unknown>;
        results.push({
          toolName: inv.toolName,
          toolCallId: callId,
          data,
          isError: data.success === false || data.error != null,
        });
      }
    }
    // V4/V5: tool-result
    if (part.type === 'tool-result' && part.toolName) {
      const callId = part.toolCallId || part.toolName;
      if (!seenCallIds.has(callId)) {
        seenCallIds.add(callId);
        const data = (part.result || part.output?.value || part.output || {}) as Record<string, unknown>;
        results.push({
          toolName: part.toolName,
          toolCallId: callId,
          data,
          isError: data.success === false || data.error != null,
        });
      }
    }
    // Include askClarification even if it's just a call (client-side execution pause)
    if (part.type === 'tool-call' && part.toolName === 'askClarification') {
      const callId = part.toolCallId || part.toolName;
      if (!seenCallIds.has(callId)) {
        seenCallIds.add(callId);
        results.push({
          toolName: part.toolName,
          toolCallId: callId,
          data: part.args || {},
          isError: false,
        });
      }
    }
    // V6: tool-invocation state: 'call' for askClarification
    if (part.type === 'tool-invocation' && part.toolInvocation?.state === 'call' && part.toolInvocation?.toolName === 'askClarification') {
      const inv = part.toolInvocation;
      const callId = inv.toolCallId || inv.toolName;
      if (!seenCallIds.has(callId)) {
        seenCallIds.add(callId);
        results.push({
          toolName: inv.toolName,
          toolCallId: callId,
          data: inv.args || {},
          isError: false,
        });
      }
    }
  }

  return results;
}

// Sadece hata donduren tool sonuclarini getir
export function getFailedToolResults(message: Message): NormalizedToolResult[] {
  return getAllToolResults(message).filter((r) => r.isError);
}

// Sadece basarili tool sonuclarini getir
export function getSuccessfulToolResults(message: Message): NormalizedToolResult[] {
  return getAllToolResults(message).filter((r) => !r.isError);
}

// optimizeParameter ozel: tool-call asamasinda mi?
export function isOptimizeParamCall(message: Message): boolean {
  if (!message.parts) return false;
  return message.parts.some((p: any) =>
    (p.type === 'tool-call' && p.toolName === 'optimizeParameter') ||
    (p.type === 'tool-invocation' && p.toolInvocation?.toolName === 'optimizeParameter' && p.toolInvocation?.state === 'call')
  );
}

// optimizeParameter ozel: tool-result alindi mi?
export function hasOptimizeParamResult(message: Message): boolean {
  if (!message.parts) return false;
  return message.parts.some((p: any) =>
    (p.type === 'tool-result' && p.toolName === 'optimizeParameter') ||
    (p.type === 'tool-invocation' && p.toolInvocation?.toolName === 'optimizeParameter' && p.toolInvocation?.state === 'result')
  );
}
