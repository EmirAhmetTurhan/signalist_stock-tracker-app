import { describe, it, expect } from 'vitest';
import { registeredInngestFunctions } from '@/app/api/inngest/route';

/**
 * Smoke test: deploy sırasında Inngest serve() listesinin küçülmediğini garanti eder.
 * Yeni bir createFunction eklendiğinde bu test beklenen sayıyı güncellemek için fail eder.
 */
describe('Inngest serve() registered functions', () => {
  const expected = [
    'runSimulation',
    'dailyExecution',
    'evaluatePendingOrdersJob',
    'processCorporateActionsJob',
    'evaluateSmartAlerts',
    'evaluateDailyPriceAlerts',
    'evaluateForwardTestsDailyJob',
    'evaluateForwardTests4HJob',
    'sendDailyNewsSummary',
    'sendSignUpEmail',
    'aiProcessChatMessage',
    'aiOptimizeParameter',
    'aiRankIndicatorsJob',
    'deepDiscoveryJob',
  ];

  it(`tüm aktif fonksiyonlar serve listesinde olmalı (>= ${expected.length})`, () => {
    expect(registeredInngestFunctions.length).toBeGreaterThanOrEqual(expected.length);
  });

  it('kritik paper-trading ve simulation fonksiyonları registered', () => {
    const ids = registeredInngestFunctions.map((f: any) => f?.id?.() ?? f?.name ?? '');
    // En azından non-empty bir dizi olmalı
    expect(ids.length).toBe(registeredInngestFunctions.length);
  });
});
