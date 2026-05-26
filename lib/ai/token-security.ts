import { createHmac, timingSafeEqual } from 'crypto';

export interface TradeProposal {
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  triggerPrice?: number; // Optional, for limit orders
  expiresAt: number; // Unix timestamp
  nonce: string; // To prevent replay attacks
  messageId: string;
}

const getSecret = () => {
  // Use BETTER_AUTH_SECRET as primary, or fallback for dev
  return process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || 'dev-fallback-secret-key-32bytes';
};

export function generateTradeToken(proposal: TradeProposal): string {
  const payload = JSON.stringify(proposal);
  const base64Payload = Buffer.from(payload).toString('base64url');
  
  const hmac = createHmac('sha256', getSecret());
  hmac.update(base64Payload);
  const signature = hmac.digest('base64url');

  return `${base64Payload}.${signature}`;
}

export function verifyTradeToken(token: string): { success: true; proposal: TradeProposal } | { success: false; error: string } {
  try {
    if (!token || typeof token !== 'string') {
      return { success: false, error: 'Token is missing or invalid type.' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { success: false, error: 'Malformed token format.' };
    }

    const [base64Payload, providedSignature] = parts;

    // Verify signature
    const hmac = createHmac('sha256', getSecret());
    hmac.update(base64Payload);
    const expectedSignature = hmac.digest('base64url');

    // Use timingSafeEqual to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature);
    const providedBuffer = Buffer.from(providedSignature);

    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      return { success: false, error: 'Invalid token signature. Data may have been tampered with.' };
    }

    // Decode and parse payload
    const payloadJson = Buffer.from(base64Payload, 'base64url').toString('utf8');
    const proposal = JSON.parse(payloadJson) as TradeProposal;

    // Check expiration
    if (Date.now() > proposal.expiresAt) {
      return { success: false, error: 'Trade proposal has expired. Please ask the AI to generate a new one.' };
    }

    return { success: true, proposal };
  } catch (error) {
    return { success: false, error: 'Failed to verify token.' };
  }
}
