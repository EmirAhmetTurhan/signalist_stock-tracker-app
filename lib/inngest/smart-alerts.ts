// lib/inngest/smart-alerts.ts — Smart Strateji Alarmları değerlendirici
import { inngest } from '@/lib/inngest/client';
import { getDailyCandles, get4HourCandles } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from '@/lib/ta/compute';
import { connectToDatabase } from '@/database/mongoose';
import { SmartAlert } from '@/database/models/smart-alert.model';
import { sendSmartAlertEmail } from '@/lib/nodemailer';
import { DEFAULT_PARAMS } from '@/lib/constants/indicators';
import type { ComputedIndicators } from '@/lib/ta/types';

function evaluateCondition(
  indicatorName: string,
  computed: ComputedIndicators,
  candles: any[],
  condition: { indicator: string; operator: string; value: number }
): boolean {
  const ind = condition.indicator.toLowerCase();
  let currentValue: number | null = null;
  let prevValue: number | null = null;

  // Extract current and previous values based on indicator structure
  // Local variable extraction ensures TypeScript narrows types properly
  if (ind === 'rsi') {
    const arr = computed.rsi?.rsi;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'macd') {
    const arr = computed.macd?.macd;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'mfi') {
    const arr = computed.mfi?.mfi;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'cci') {
    const arr = computed.cci?.cci;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'wpr') {
    const arr = computed.wpr;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'ao') {
    const arr = computed.ao;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'dmi') {
    const arr = computed.dmi?.plusDI;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'wavetrend') {
    const arr = computed.wavetrend?.wt1;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
  } else if (ind === 'stochrsi') {
    const arr = computed.stochrsi?.k;
    if (arr && arr.length >= 2) { currentValue = arr[arr.length - 1].value ?? null; prevValue = arr[arr.length - 2].value ?? null; }
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
          const minHours = alert.frequency === '4h' ? 3 : 20;
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
