import {serve} from "inngest/next";
import {inngest} from "@/lib/inngest/client";
import {sendDailyNewsSummary, sendSignUpEmail, evaluateDailyPriceAlerts, aiOptimizeParameter, aiRankIndicatorsJob} from "@/lib/inngest/functions";
import {evaluateSmartAlerts} from "@/lib/inngest/smart-alerts";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [sendSignUpEmail, sendDailyNewsSummary, evaluateDailyPriceAlerts, evaluateSmartAlerts, aiOptimizeParameter, aiRankIndicatorsJob],
})