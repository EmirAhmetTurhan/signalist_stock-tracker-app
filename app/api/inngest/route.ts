import {serve} from "inngest/next";
import {inngest} from "@/lib/inngest/client";
import {sendDailyNewsSummary, sendSignUpEmail, evaluateDailyPriceAlerts, aiOptimizeParameter, aiRankIndicatorsJob, evaluateForwardTestsDailyJob, evaluateForwardTests4HJob, evaluatePendingOrdersJob, processCorporateActionsJob} from "@/lib/inngest/functions";
import {evaluateSmartAlerts} from "@/lib/inngest/smart-alerts";
import {aiProcessChatMessage} from "@/lib/inngest/chat-async";
import {deepDiscoveryJob} from "@/lib/inngest/discovery-deep-search";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [sendSignUpEmail, sendDailyNewsSummary, evaluateDailyPriceAlerts, evaluateSmartAlerts, aiOptimizeParameter, aiRankIndicatorsJob, aiProcessChatMessage, evaluateForwardTestsDailyJob, evaluateForwardTests4HJob, evaluatePendingOrdersJob, processCorporateActionsJob, deepDiscoveryJob],
})