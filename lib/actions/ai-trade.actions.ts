'use server';

import { verifyTradeToken } from '@/lib/ai/token-security';
import { executeTrade, type TradeResult } from '@/lib/paper-trading/execution-engine';
import { revalidatePath } from 'next/cache';

export async function executeTradeWithToken(token: string): Promise<TradeResult & { success: boolean, message?: string }> {
  const verification = verifyTradeToken(token);
  
  if (!verification.success) {
    return { 
      success: false, 
      errorCode: 'INVALID_TOKEN', 
      userMessage: verification.error 
    };
  }

  const { proposal } = verification;

  // We have a verified, untampered proposal. Execute the trade.
  const result = await executeTrade({
    userId: proposal.userId,
    symbol: proposal.symbol,
    side: proposal.side,
    quantity: proposal.quantity,
    clientRequestId: `ai-${proposal.messageId}-${proposal.nonce}`,
    triggerSource: 'ai_proposal',
    triggerContext: {
      aiMessageId: proposal.messageId,
    }
  });

  if (result.success) {
    revalidatePath('/portfolio');
  }

  return result;
}
