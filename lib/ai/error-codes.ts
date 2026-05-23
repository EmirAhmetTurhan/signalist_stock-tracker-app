// lib/ai/error-codes.ts — Standardize edilmis hata kodlari ve kullanici mesajlari
// Client ve server arasinda tutarli hata iletisimi icin tek kaynak

export type ErrorCode =
  | 'EXTERNAL_API_DENIED'
  | 'EXTERNAL_API_RATE_LIMIT'
  | 'EXTERNAL_API_TIMEOUT'
  | 'INSUFFICIENT_DATA'
  | 'INVALID_SYMBOL'
  | 'OPTIMIZATION_FAILED'
  | 'INNGEST_QUEUE_FULL'
  | 'INTERNAL_ERROR';

export interface ErrorInfo {
  userMessage: string;
  recoverable: boolean;
  action?: 'retry' | 'check_api' | 'try_different_symbol' | 'contact_support';
}

export const ERROR_MAP: Record<ErrorCode, ErrorInfo> = {
  EXTERNAL_API_DENIED: {
    userMessage: 'Borsa veri saglayicisi (Finnhub) erisimi reddetti. API planinizi kontrol edin veya daha sonra tekrar deneyin.',
    recoverable: true,
    action: 'check_api',
  },
  EXTERNAL_API_RATE_LIMIT: {
    userMessage: 'API istek limitine ulasildi (60 istek/dakika). Lutfen 1 dakika bekleyip tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  EXTERNAL_API_TIMEOUT: {
    userMessage: 'Borsa veri saglayicisi yanit vermedi. Sunucular yogun olabilir, tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  INSUFFICIENT_DATA: {
    userMessage: 'Bu hisse için yeterli gecmis veri bulunamadi. Hisse piyasada yeni olabilir veya veri kaynagi bu sembolu desteklemiyor.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  INVALID_SYMBOL: {
    userMessage: 'Gecersiz hisse sembolu. Sembolu kontrol edip tekrar deneyin veya hisse arama ozelligini kullanin.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  OPTIMIZATION_FAILED: {
    userMessage: 'Teknik analiz motorunda bir hesaplama hatasi olustu. Farkli bir indikator veya zaman araligi deneyin.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  INNGEST_QUEUE_FULL: {
    userMessage: 'Arka plan islem kuyrugu su anda dolu. Biraz bekleyip tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  INTERNAL_ERROR: {
    userMessage: 'Beklenmeyen bir sistem hatasi olustu. Lutfen daha sonra tekrar deneyin.',
    recoverable: false,
    action: 'contact_support',
  },
};

// Hata mesajindan ErrorCode tespit et
export function detectErrorCode(errorMessage: string): ErrorCode {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('403') || msg.includes('denied') || msg.includes('access')) return 'EXTERNAL_API_DENIED';
  if (msg.includes('429') || msg.includes('rate limit')) return 'EXTERNAL_API_RATE_LIMIT';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'EXTERNAL_API_TIMEOUT';
  if (msg.includes('insufficient') || msg.includes('candle') || msg.includes('no data')) return 'INSUFFICIENT_DATA';
  if (msg.includes('invalid') || msg.includes('symbol')) return 'INVALID_SYMBOL';
  if (msg.includes('queue') || msg.includes('full')) return 'INNGEST_QUEUE_FULL';
  return 'INTERNAL_ERROR';
}
