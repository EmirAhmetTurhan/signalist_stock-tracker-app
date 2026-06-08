// lib/inngest/chat-async.ts
import { inngest } from "./client";
import { connectToDatabase } from "@/database/mongoose";
import AIJob from "@/database/models/ai-job.model";
import { Message } from "@/database/models/message.model";
import mongoose from "mongoose";
import { generateText, stepCountIs } from "ai";
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { getTools } from '@/lib/ai/tools';
import { saveMessage } from '@/lib/actions/chat-history.actions';
import { resolveModel } from '@/lib/ai/model-resolver';
import { normalizeMessage, toModelMessages } from '../ai/message-format';

// Helper to normalize AI SDK response message parts for DB merging
function extractPartsFromMsg(msg: { parts?: unknown; content?: unknown }): Record<string, unknown>[] {
  if (Array.isArray(msg.parts)) return msg.parts as Record<string, unknown>[];
  if (Array.isArray(msg.content)) return msg.content as Record<string, unknown>[];
  if (typeof msg.content === 'string') return [{ type: 'text', text: msg.content }];
  return [];
}

interface ChatEvent { data: { jobId: string; conversationId: string; userId: string; selectedModel?: string; userApiKey?: string } }

export const aiProcessChatMessage = inngest.createFunction(
  { id: 'ai-process-chat-message', retries: 0, timeouts: { finish: '90s' }, triggers: [{ event: 'ai/process-chat-message' }] },
  async ({ event, step }: { event: ChatEvent; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    // We now receive conversationId and fetch messages directly from DB
    const { jobId, conversationId, userId, selectedModel, userApiKey } = event.data;

    // Step 1: Initialize
    await connectToDatabase();
    await AIJob.findOneAndUpdate({ jobId }, { status: 'running' });

    // Step 2: Fetch last 10 messages from DB
    const rawMessages = await Message.find({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      userId,
    })
      .sort({ createdAt: 1 })
      .lean();
    
    const recentMessages = rawMessages.slice(-10);

    // Step 3: Generate Text with live DB updates
    const { model } = resolveModel(selectedModel, userApiKey);
    
    // Clean transformation: DB Raw Format -> Canonical -> CoreMessage
    const modelMessages = toModelMessages(recentMessages.map(normalizeMessage));

    try {
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        messages: modelMessages,
        tools: getTools(userId),
        stopWhen: stepCountIs(3), // Reduced from 10 steps to 3 to optimize AI behavior and DB writes
        temperature: 0.3,
        onStepFinish: async ({ text, toolCalls, toolResults, finishReason }) => {
          // Push a step update to the DB for the "Thinking UI"
          await connectToDatabase();
          
          let detailStr = '';
          if (toolCalls && toolCalls.length > 0) {
            detailStr = toolCalls.map(t => t.toolName).join(', ');
          }

          const newStep = {
            name: toolCalls && toolCalls.length > 0 ? `Araç çağrılıyor` : 'Metin üretiliyor',
            status: 'completed' as const,
            detail: detailStr,
            completedAt: new Date()
          };

          await AIJob.findOneAndUpdate(
            { jobId },
            { $push: { steps: newStep } }
          );
        }
      });

      // Step 4: Merge all response messages into ONE assistant message, then save
      const toolNames: Record<string, string> = {};
      
      for (const msg of result.response.messages) {
        const parts = extractPartsFromMsg(msg);
        for (const p of parts) {
          if (p.type === 'tool-call' && p.toolCallId && p.toolName) {
            toolNames[p.toolCallId as string] = p.toolName as string;
          }
        }
      }

      const mergedParts: Record<string, unknown>[] = [];
      for (const msg of result.response.messages) {
        const parts = extractPartsFromMsg(msg);
        for (const p of parts) {
          // Enrich tool-result with toolName
          if (p.type === 'tool-result' && p.toolCallId && !p.toolName) {
            p.toolName = toolNames[p.toolCallId as string] || 'unknown-tool';
          }
          mergedParts.push(p);
        }
      }

      if (mergedParts.length > 0) {
        // Save using the specific userId to bypass headers() usage inside saveMessage
        await saveMessage(conversationId, 'assistant', mergedParts, userId);
      }

      // Step 5: Complete Job
      await AIJob.findOneAndUpdate(
        { jobId },
        { 
          status: 'completed', 
          progress: 100,
          $push: { steps: { name: 'İşlem tamamlandı', status: 'completed', completedAt: new Date() } }
        }
      );

      return { success: true };

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      await connectToDatabase();
      await AIJob.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          errorMessage: msg,
          $push: { steps: { name: 'Hata oluştu', status: 'failed', detail: msg, completedAt: new Date() } }
        }
      );
      throw error;
    }
  }
);
