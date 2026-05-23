// lib/inngest/smart-alerts.ts — Smart Strateji Alarmları değerlendirici
import { inngest } from '@/lib/inngest/client';
import { getDailyCandles, get4HourCandles } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from '@/lib/ta/compute';
import { connectToDatabase } from '@/database/mongoose';
import { SmartAlert } from '@/database/models/smart-alert.model';
import { sendSmartAlertEmail } from '@/lib/nodemailer';

const DEFAULT_PARAMS = {
  macdFast: 12, macdSlow: 26, macdSig: 9,
  stochRsiLen: 14, stochLen: 14, stochK: 3, stochD: 3,
  wtAvgLen: 10, wtChannelLen: 21, wtMaLen: 4,
  dmiDiLen: 14, dmiAdxSmooth: 14,
  mfiPeriod: 14,
  smiLongLen: 20, smiShortLen: 5, smiSigLen: 5,
  rsiLen: 14, rsiMaLen: 14,
  cciLen: 20, cciMaLen: 14,
  wprLen: 14,
  diLen: 10, diSmooth: 10, diK: 2,
  cmfLen: 20,
  madrLen: 21,
  almaLen: 9, almaOffset: 0.85, almaSigma: 6,
  almaColor: '#fbbf24', almaOpacity: 100, almaWidth: 2, almaStyle: 0,
  bbLen: 20, bbStdDev: 2, bbOffset: 0,
  bbColor: '#3b82f6', bbOpacity: 100, bbWidth: 1,
};

function evaluateCondition(
  indicatorName: string,
  computed: any,
  candles: any[],
  condition: { indicator: string; operator: string; value: number }
): boolean {
  const ind = condition.indicator.toLowerCase();
  let currentValue: number | null = null;
  let prevValue: number | null = null;

  // Extract current and previous values based on indicator structure
  if (ind === 'rsi' && computed.rsi?.rsi?.length >= 2) {
    currentValue = computed.rsi.rsi[computed.rsi.rsi.length - 1].value;
    prevValue = computed.rsi.rsi[computed.rsi.rsi.length - 2].value;
  } else if (ind === 'macd' && computed.macd?.macd?.length >= 2) {
    currentValue = computed.macd.macd[computed.macd.macd.length - 1].value;
    prevValue = computed.macd.macd[computed.macd.macd.length - 2].value;
  } else if (ind === 'mfi' && computed.mfi?.mfi?.length >= 2) {
    currentValue = computed.mfi.mfi[computed.mfi.mfi.length - 1].value;
    prevValue = computed.mfi.mfi[computed.mfi.mfi.length - 2].value;
  } else if (ind === 'cci' && computed.cci?.cci?.length >= 2) {
    currentValue = computed.cci.cci[computed.cci.cci.length - 1].value;
    prevValue = computed.cci.cci[computed.cci.cci.length - 2].value;
  } else if (ind === 'wpr' && computed.wpr?.length >= 2) {
    currentValue = computed.wpr[computed.wpr.length - 1].value;
    prevValue = computed.wpr[computed.wpr.length - 2].value;
  } else if (ind === 'ao' && computed.ao?.length >= 2) {
    currentValue = computed.ao[computed.ao.length - 1].value;
    prevValue = computed.ao[computed.ao.length - 2].value;
  } else if (ind === 'dmi' && computed.dmi?.plusDI?.length >= 2) {
    currentValue = computed.dmi.plusDI[computed.dmi.plusDI.length - 1].value;
    prevValue = computed.dmi.plusDI[computed.dmi.plusDI.length - 2].value;
  } else if (ind === 'wavetrend' && computed.wavetrend?.wt1?.length >= 2) {
    currentValue = computed.wavetrend.wt1[computed.wavetrend.wt1.length - 1].value;
    prevValue = computed.wavetrend.wt1[computed.wavetrend.wt1.length - 2].value;
  } else if (ind === 'stochrsi' && computed.stochrsi?.k?.length >= 2) {
    currentValue = computed.stochrsi.k[computed.stochrsi.k.length - 1].value;
    prevValue = computed.stochrsi.k[computed.stochrsi.k.length - 2].value;
  }

  if (currentValue === null) return false;

  switch (condition.operator) {
    case '<': return currentValue < condition.value;
    case '>': return currentValue > condition.value;
    case 'cross_above': return prevValue !== null && prevValue < condition.value && currentValue >= condition.value;
    case 'cross_below': return prevValue !== null && prevValue > condition.value && currentValue <= condition.value;
    default: return false;
  }
}

export const evaluateSmartAlerts = inngest.createFunction(
  { id: 'smart-alerts', triggers: [{ cron: '0 */4 * * *' }] },
  async ({ step }) => {
    // Step 1: Load active alerts
    const alerts = await step.run('load-smart-alerts', async () => {
      await connectToDatabase();
      return await SmartAlert.find({ active: true }).lean();
    });

    if (!alerts || alerts.length === 0) {
      return { success: true, message: 'No active smart alerts' };
    }

    // Group by symbol+interval for batch candle fetching
    const groups = new Map<string, typeof alerts>();
    for (const a of alerts as any[]) {
      const key = `${String(a.symbol)}_${a.interval || '1d'}`;
      const list = groups.get(key) || [];
      list.push(a);
      groups.set(key, list);
    }

    const results: { alertId: string; triggered: boolean }[] = [];

    for (const [key, items] of groups) {
      const [symbol, interval] = key.split('_');

      try {
        // Step 2: Fetch candles
        const candles = await step.run(`fetch-${key}`, async () =>
          interval === '4h'
            ? await get4HourCandles(symbol, 365)
            : await getDailyCandles(symbol, 365)
        );

        if (!candles || candles.length === 0) continue;

        // Step 3: Compute needed indicators
        const neededIndicators = new Set<string>();
        for (const item of items as any[]) {
          for (const c of item.conditions || []) {
            neededIndicators.add(String(c.indicator).toLowerCase());
          }
        }

        const computed = computeIndicators(candles as any, neededIndicators, DEFAULT_PARAMS);

        // Step 4: Evaluate each alert
        for (const alert of items as any[]) {
          const last = alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt) : null;
          const now = new Date();
          const hoursSinceLast = last ? (now.getTime() - last.getTime()) / 3600000 : Infinity;
          const minHours = alert.frequency === '1h' ? 0.5 : alert.frequency === '4h' ? 3 : 20;
          if (hoursSinceLast < minHours) continue;

          const allMet = (alert.conditions || []).every((c: any) =>
            evaluateCondition(c.indicator, computed, candles, c)
          );

          if (allMet) {
            await step.run(`notify-${alert._id}`, async () => {
              await sendSmartAlertEmail({
                email: String(alert.email),
                name: String(alert.name),
                symbol,
                conditions: (alert.conditions || []).map((c: any) =>
                  `${String(c.indicator).toUpperCase()} ${c.operator} ${c.value}`
                ).join(', '),
              });
            });

            await step.run(`update-${alert._id}`, async () => {
              await SmartAlert.updateOne(
                { _id: alert._id },
                { $set: { lastTriggeredAt: new Date() } }
              );
            });

            results.push({ alertId: String(alert._id), triggered: true });
          }
        }
      } catch (e) {
        console.error('Smart alert evaluation failed for', symbol, e);
      }
    }

    return { success: true, results };
  }
);
