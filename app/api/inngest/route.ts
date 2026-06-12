import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { runSimulation } from '@/lib/inngest/functions/simulation/run-simulation';
import { dailyExecution } from '@/lib/inngest/functions/paper-trading/daily-execution';
import { evaluatePendingOrdersJob } from '@/lib/inngest/pending-order-processor';
import { processCorporateActionsJob } from '@/lib/inngest/corporate-actions';
import { evaluateSmartAlerts } from '@/lib/inngest/smart-alerts';
import { aiProcessChatMessage } from '@/lib/inngest/chat-async';
import { deepDiscoveryJob } from '@/lib/inngest/discovery-deep-search';
import {
  sendSignUpEmail,
  sendDailyNewsSummary,
  evaluateDailyPriceAlerts,
  aiOptimizeParameter,
  aiRankIndicatorsJob,
  evaluateForwardTestsDailyJob,
  evaluateForwardTests4HJob,
} from '@/lib/inngest/functions';

// Tüm aktif Inngest fonksiyonları burada serve edilmelidir.
// Yeni bir createFunction eklendiğinde bu listeye de eklenmelidir; aksi halde
// fonksiyon sessizce çalışmaz (cron/event tetikleyicileri hiç görülmez).
export const registeredInngestFunctions = [
  runSimulation,
  dailyExecution,
  evaluatePendingOrdersJob,
  processCorporateActionsJob,
  evaluateSmartAlerts,
  evaluateDailyPriceAlerts,
  evaluateForwardTestsDailyJob,
  evaluateForwardTests4HJob,
  sendDailyNewsSummary,
  sendSignUpEmail,
  aiProcessChatMessage,
  aiOptimizeParameter,
  aiRankIndicatorsJob,
  deepDiscoveryJob,
];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: registeredInngestFunctions,
});
