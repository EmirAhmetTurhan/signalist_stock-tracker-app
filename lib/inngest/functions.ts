import { inngest } from "@/lib/inngest/client";
import { NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT } from "@/lib/inngest/prompts";
import { sendNewsSummaryEmail, sendWelcomeEmail, sendPriceAlertEmail } from "@/lib/nodemailer";
import { getAllUsersForNewsEmail } from "@/lib/actions/user.actions";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions";
import { getNews } from "@/lib/actions/finnhub.actions";
import { getFormattedTodayDate } from "@/lib/utils";
import { connectToDatabase } from "@/database/mongoose";
import PriceAlert from "@/database/models/price-alert.model";
import { fetchJSON, getDailyCandlesForAI, getDailyCandles, get4HourCandles, getCandlesForInterval } from "@/lib/actions/finnhub.actions";
import { Report } from "@/database/models/report.model";
import AIJob from "@/database/models/ai-job.model";
import Notification from "@/database/models/notification.model";
import { findBestParameter, OPTIMIZABLE_INDICATORS } from "@/lib/ta/optimizer";
import type { Candle } from "@/lib/ta/simulation/backtest";
// SPRINT 3: timeframe-limits.ts silindi, inline clamp kullanılıyor.
import { INDICATOR_KEYS, DEFAULT_PARAMS } from "@/lib/constants/indicators";
import { mapIndicatorData } from "@/lib/ai/tools";
import { calculateWinRate } from "@/lib/ta/simulation/backtest";
import { computeIndicators } from "@/lib/ta/compute";
import { evaluateForwardTests } from "@/lib/paper-trading/forward-test-evaluator";

export { evaluatePendingOrdersJob } from './pending-order-processor';
export { processCorporateActionsJob } from './corporate-actions';

// Local typing to satisfy TS without altering public contracts
type UserForNewsEmail = { id: string; email: string; name: string };
type AITextPart = { text?: string };
type AIContent = { parts?: AITextPart[] };
type AICandidate = { content?: AIContent };
type AIResponse = { candidates?: AICandidate[] };

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email', triggers: [{ event: 'app/user.created' }] },
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `

        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)

        const response = await step.ai.infer('generate-welcome-intro', {
            model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
            body: {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: prompt }
                        ]
                    }]
            }
        })

        await step.run('send-welcome-email', async () => {
            const ai = response as AIResponse;
            const part = ai.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) || 'Thanks for joining Signalist. You now have the tools to track markets and make smarter moves.'

            const { data: { email, name } } = event;

            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }
    }
)

export const sendDailyNewsSummary = inngest.createFunction(
    { id: 'daily-news-summary', triggers: [{ event: 'app/send.daily.news' }, { cron: '0 12 * * *' }] },
    async ({ step }) => {
        // Step #1: Get all users for news delivery
        const users = await step.run('get-all-users', getAllUsersForNewsEmail)

        if (!users || users.length === 0) return { success: false, message: 'No users found for news email' };

        // Step #2: For each user, get watchlist symbols -> fetch news (fallback to general)
        const results = await step.run('fetch-user-news', async () => {
            const perUser: Array<{ user: UserForNewsEmail; articles: MarketNewsArticle[] }> = [];
            for (const user of users as UserForNewsEmail[]) {
                try {
                    const symbols = await getWatchlistSymbolsByEmail(user.email);
                    let articles = await getNews(symbols);
                    // Enforce max 6 articles per user
                    articles = (articles || []).slice(0, 6);
                    // If still empty, fallback to general
                    if (!articles || articles.length === 0) {
                        articles = await getNews();
                        articles = (articles || []).slice(0, 6);
                    }
                    perUser.push({ user, articles });
                } catch (e) {
                    console.error('daily-news: error preparing user news', user.email, e);
                    perUser.push({ user, articles: [] });
                }
            }
            return perUser;
        });

        // Step #3: (placeholder) Summarize news via AI
        const userNewsSummaries: { user: UserForNewsEmail; newsContent: string | null }[] = [];

        for (const { user, articles } of results as Array<{ user: UserForNewsEmail; articles: MarketNewsArticle[] }>) {
            try {
                const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(articles, null, 2));

                const response = await step.ai.infer(`summarize-news-${user.email}`, {
                    model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
                    body: {
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    }
                });

                const ai = response as AIResponse;
                const part = ai.candidates?.[0]?.content?.parts?.[0];
                const newsContent = (part && 'text' in part ? part.text : null) || 'No market news.'

                userNewsSummaries.push({ user, newsContent });
            } catch (e) {
                console.error('Failed to summarize news for : ', user.email);
                userNewsSummaries.push({ user, newsContent: null });
            }
        }

        // Step #4: (placeholder) Send the emails
        await step.run('send-news-emails', async () => {
            await Promise.all(
                userNewsSummaries.map(async ({ user, newsContent }) => {
                    if (!newsContent) return false;

                    return await sendNewsSummaryEmail({ email: user.email, date: getFormattedTodayDate(), newsContent })
                })
            )
        })

        return { success: true, message: 'Daily news summary emails sent successfully' }
    }
)

// Daily evaluation of price alerts; shares the same cadence as news
export const evaluateDailyPriceAlerts = inngest.createFunction(
    { id: 'daily-price-alerts', triggers: [{ event: 'app/evaluate.price.alerts' }, { cron: '0 12 * * *' }] },
    async ({ step }) => {
        // Load active daily alerts
        const alerts = await step.run('load-active-alerts', async () => {
            await connectToDatabase();
            return await PriceAlert.find({ active: true, frequency: 'daily' }).lean();
        });

        if (!alerts || alerts.length === 0) return { success: true, message: 'No active alerts' };

        // Group by symbol
        const groups = new Map<string, typeof alerts>();
        for (const a of alerts as any[]) {
            const key = String(a.symbol).toUpperCase();
            const list = (groups.get(key) || []) as any[];
            list.push(a);
            groups.set(key, list);
        }

        const token = process.env.FINNHUB_API_KEY || '';
        const now = new Date();

        for (const [symbol, items] of groups) {
            try {
                // Fetch quote
                const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
                const quote = await step.run(`quote-${symbol}`, async () => await fetchJSON<{ c?: number }>(url, 60));
                const price = Number(quote?.c || 0);
                if (!Number.isFinite(price) || price <= 0) continue;

                // Evaluate each alert
                for (const alert of items as any[]) {
                    const last = alert.lastNotifiedOn ? new Date(alert.lastNotifiedOn) : null;
                    const alreadyToday = last && last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
                    if (alreadyToday) continue; // once per day

                    const threshold = Number(alert.threshold);
                    const type = alert.alertType === 'lower' ? 'lower' : 'upper';
                    const shouldSend = type === 'upper' ? price > threshold : price < threshold;
                    if (!shouldSend) continue;

                    const timestamp = now.toLocaleString('en-US', { timeZone: 'UTC' });
                    await step.run(`send-email-${alert._id}`, async () => {
                        return await sendPriceAlertEmail({
                            email: String(alert.email),
                            symbol,
                            company: String(alert.company || symbol),
                            currentPrice: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price),
                            threshold: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(threshold),
                            type,
                            timestamp,
                        })
                    });

                    // Update lastNotifiedOn
                    await step.run(`update-last-${alert._id}`, async () => {
                        await PriceAlert.updateOne({ _id: alert._id }, { $set: { lastNotifiedOn: now } });
                    });
                }
            } catch (e) {
                console.error('Failed evaluating alerts for', symbol, e);
            }
        }

        return { success: true, message: 'Price alerts evaluated' };
    }
)

// ---- AI Agent Arka Plan İşlemleri ----

export const aiOptimizeParameter = inngest.createFunction(
    { id: 'ai-optimize-parameter', retries: 0, triggers: [{ event: 'ai/optimize-parameter' }] },
    async ({ event, step }) => {
        const data = event.data as { jobId?: string; batchId?: string; symbol?: string; indicator?: string; interval?: string; years?: number; userId?: string };
        const jobId = data.jobId || 'unknown';
        const batchId = data.batchId || null;
        const symbol = data.symbol || 'UNKNOWN';
        const indicator = data.indicator || 'UNKNOWN';
        const interval = data.interval || '1d';
        const years = data.years || 1;

        const userId = data.userId || 'inngest-system';

        // Adim 1: Veritabaninda 'running' durumunda AIJob olustur + ilk step
        await step.run('create-ai-job', async () => {
            await connectToDatabase();
            await AIJob.create({
                userId,
                type: 'optimize_parameter',
                status: 'running',
                title: `${symbol} için ${indicator} optimizasyonu`,
                source: 'chat',
                jobId,
                batchId,
                input: { symbol, indicator, interval },
                startedAt: new Date(),
                steps: [
                    { name: 'create-job', status: 'completed', detail: 'Analysis job created', completedAt: new Date() },
                    { name: 'fetch-candles', status: 'running', detail: `Fetching historical candle data for ${symbol}...` },
                ],
            });
        });

        // Adim 2: Gercek TA hesaplamasi (brute-force optimizasyon)
        let bestValue: number | null = null;
        let winRate: number | null = null;
        let paramName = '?';

        try {
            const result = await step.run('run-optimization', async () => {
                const name = indicator.toUpperCase();
                const config = OPTIMIZABLE_INDICATORS[name];
                if (!config) throw new Error(`${indicator} is not optimizable`);

                // SPRINT 3: inline clamp (4h/1d max 10 yıl)
                const days = Math.min(years * 365, 3650);
                const candles: Candle[] = await getCandlesForInterval(symbol, interval, days);

                if (!candles || candles.length === 0) {
                    return { error: `Insufficient candle data for ${symbol}` };
                }

                // Step guncelle: veri cekildi, optimizasyon basliyor
                await connectToDatabase();
                await AIJob.updateOne({ jobId }, {
                    $set: {
                        'steps.1.status': 'completed',
                        'steps.1.completedAt': new Date(),
                        'steps.1.detail': `Fetched ${candles.length} candles for ${symbol}`,
                    }
                });
                await AIJob.updateOne({ jobId }, {
                    $push: {
                        steps: { name: 'run-optimization', status: 'running', detail: `Computing ${name} for all parameter values...` },
                    }
                });

                const optResult = findBestParameter(name, candles, { lookForward: 5, interval });

                // Step guncelle: optimizasyon tamamlandi
                await connectToDatabase();
                await AIJob.updateOne({ jobId }, {
                    $set: {
                        'steps.2.status': 'completed',
                        'steps.2.completedAt': new Date(),
                        'steps.2.detail': `${name} optimization complete. Best result found.`,
                    }
                });
                await AIJob.updateOne({ jobId }, {
                    $push: {
                        steps: { name: 'finalize', status: 'running', detail: 'Saving results...' },
                    }
                });

                return optResult;
            });

            if (result && typeof result === 'object' && 'error' in result) {
                throw new Error(result.error as string);
            }

            if (result && typeof result === 'object' && 'bestVal' in result && result.bestVal !== -1) {
                bestValue = result.bestVal as number;
                winRate = Math.round((result.bestWinRate as number) * 100) / 100;
                paramName = OPTIMIZABLE_INDICATORS[indicator.toUpperCase()]?.param ?? '?';
            }
        } catch (e) {
            // Hata durumunda raporu 'failed' olarak isaretle + kullanici dostu hata mesaji
            const errMsg = String(e);
            const userFriendlyError =
                errMsg.includes('403') || errMsg.includes('access') || errMsg.includes('denied')
                    ? `Borsa veri saglayicisi (Finnhub) ${symbol} icin erisimi reddetti veya hata verdi.`
                    : errMsg.includes('Insufficient') || errMsg.includes('candle')
                        ? `${symbol} icin yeterli mum verisi bulunamadi. Bu hisse piyasada yeni olabilir.`
                        : `Optimizasyon sirasinda beklenmeyen bir hata olustu: ${errMsg.slice(0, 200)}`;

            await step.run('mark-failed', async () => {
                await connectToDatabase();
                await AIJob.updateOne({ jobId }, { $set: { status: 'failed', errorMessage: userFriendlyError, updatedAt: new Date() } });
                await AIJob.updateOne({ jobId }, { $push: { steps: { name: 'error', status: 'failed', detail: userFriendlyError, completedAt: new Date() } } });

                await Notification.create({
                    userId,
                    type: 'ai_job_failed',
                    title: 'Optimizasyon Başarısız',
                    message: `${symbol} için ${indicator} optimizasyonu sırasında bir hata oluştu.`,
                    jobId
                });
            });
            return { success: false, jobId, error: String(e) };
        }

        // Adim 3: Raporu gercek sonuclarla olustur ve isi 'completed' yap
        await step.run('update-report', async () => {
            await connectToDatabase();

            const fullData = {
                symbol,
                indicator,
                interval,
                bestValue,
                winRate,
                parameter: paramName,
                completedAt: new Date(),
            };

            const report = await Report.create({
                jobId,
                userId,
                symbol,
                indicator,
                bestValue,
                winRate,
                fullData,
                status: 'completed',
            });

            await AIJob.updateOne(
                { jobId },
                {
                    $set: {
                        status: 'completed',
                        reportId: report._id.toString(),
                        completedAt: new Date(),
                        'steps.3.status': 'completed',
                        'steps.3.completedAt': new Date(),
                        'steps.3.detail': `Best ${paramName}: ${bestValue} (${winRate}% win rate)`,
                    },
                }
            );

            await Notification.create({
                userId,
                type: 'ai_job_completed',
                title: 'Optimizasyon Tamamlandı',
                message: `${symbol} için ${indicator} optimizasyonu başarıyla sonuçlandı. Win Rate: %${winRate}`,
                jobId,
                reportId: report._id.toString(),
                actionUrl: `/archive/reports/${report._id.toString()}`
            });
        });

        return {
            success: true,
            jobId,
            message: `${symbol} için ${indicator} optimizasyonu tamamlandı. Best ${paramName}: ${bestValue}, Win Rate: ${winRate}%`,
            symbol,
            indicator,
            interval,
            bestValue,
            winRate,
            parameter: paramName,
        };
    }
)

export const aiRankIndicatorsJob = inngest.createFunction(
    { id: 'ai-rank-indicators', retries: 0, triggers: [{ event: 'ai/rank-indicators' }] },
    async ({ event, step }) => {
        const data = event.data as { jobId?: string; symbol?: string; interval?: string; years?: number; indicators?: string[]; isSingle?: boolean; topN?: number };
        const jobId = data.jobId || 'unknown';
        const symbol = data.symbol || 'UNKNOWN';
        let interval = data.interval || '1d';
        const years = data.years || 1;
        const topN = data.topN || 5;
        const isSingle = data.isSingle || false;
        const requestedIndicators = data.indicators;

        // ── Timeframe Isolation Guard ──────────────────────────────
        try {
            const { assertAllowedTimeframe } = await import('@/lib/ta/timeframe-guard');
            interval = assertAllowedTimeframe(interval, 'inngest.aiRankIndicators');
        } catch {
            interval = '1d';
        }

        const days = Math.round(years * 365);

        const userId = (data as Record<string, unknown>).userId as string || 'inngest-system';

        await step.run('create-ai-job', async () => {
            await connectToDatabase();
            await AIJob.create({
                userId,
                type: isSingle ? 'find_best_indicator' : 'rank_indicators',
                status: 'running',
                title: `${symbol} için İndikatör Sıralaması`,
                source: 'chat',
                jobId,
                input: { symbol, indicator: isSingle ? 'FIND_BEST' : 'RANK', interval, years },
                startedAt: new Date(),
                steps: [
                    { name: 'init', status: 'completed', detail: 'Analysis job started', completedAt: new Date() },
                    { name: 'fetch-candles', status: 'running', detail: `Fetching ${years} years of historical data for ${symbol}...` },
                ],
            });
        });

        let results: { name: string; winRate: number; signals: number }[] = [];

        try {
            const stepResult = await step.run('run-ranking', async () => {
                // SPRINT 3: inline clamp (4h/1d max 10 yıl)
                const clampedDays = Math.min(days, 3650);
                const candles: Candle[] = await getCandlesForInterval(symbol, interval, clampedDays);

                if (!candles || candles.length === 0) {
                    return { error: `Insufficient candle data for ${symbol}` };
                }

                await connectToDatabase();
                await AIJob.updateOne({ jobId }, {
                    $set: {
                        'steps.1.status': 'completed',
                        'steps.1.completedAt': new Date(),
                        'steps.1.detail': `Fetched data (${candles.length} candles)`,
                    }
                });
                await AIJob.updateOne({ jobId }, {
                    $push: {
                        steps: { name: 'compute', status: 'running', detail: `Computing technical indicators...` },
                    }
                });

                const toTest = requestedIndicators ?? INDICATOR_KEYS.filter((n) => OPTIMIZABLE_INDICATORS[n.toUpperCase()]);
                const activeSet = new Set(toTest.map((s) => s.toLowerCase()));
                const computed = computeIndicators(candles as any, activeSet, DEFAULT_PARAMS);

                await connectToDatabase();
                await AIJob.updateOne({ jobId }, {
                    $set: {
                        'steps.2.status': 'completed',
                        'steps.2.completedAt': new Date(),
                        'steps.2.detail': `Indicators computed.`,
                    }
                });
                await AIJob.updateOne({ jobId }, {
                    $push: {
                        steps: { name: 'backtest', status: 'running', detail: `Running historical backtests...` },
                    }
                });

                const testResults: { name: string; winRate: number; signals: number }[] = [];
                let indIdx = 0;
                for (const ind of toTest) {
                    if (indIdx > 0 && indIdx % 5 === 0) await new Promise(r => setTimeout(r, 0));
                    indIdx++;
                    const idata = mapIndicatorData(computed, ind.toLowerCase());
                    if (!idata) continue;
                    try {
                        const { winRate, totalSignals } = calculateWinRate(ind.toUpperCase(), candles, idata, { lookForward: 5 });
                        testResults.push({ name: ind.toUpperCase(), winRate: Math.round(winRate * 100) / 100, signals: totalSignals });
                    } catch { /* ignore single error */ }
                }

                testResults.sort((a, b) => b.winRate - a.winRate);
                return { data: testResults };
            });
            if (stepResult && typeof stepResult === 'object' && 'error' in stepResult) {
                throw new Error(stepResult.error as string);
            }
            results = (stepResult && typeof stepResult === 'object' && 'data' in stepResult ? stepResult.data : []) as { name: string; winRate: number; signals: number }[];
        } catch (e) {
            const errMsg = String(e);
            await step.run('mark-failed', async () => {
                await connectToDatabase();
                await AIJob.updateOne({ jobId }, { $set: { status: 'failed', errorMessage: errMsg, updatedAt: new Date() } });
                await AIJob.updateOne({ jobId }, { $push: { steps: { name: 'error', status: 'failed', detail: errMsg, completedAt: new Date() } } });

                await Notification.create({
                    userId,
                    type: 'ai_job_failed',
                    title: 'İndikatör Sıralaması Başarısız',
                    message: `${symbol} analizi sırasında bir hata oluştu.`,
                    jobId
                });
            });
            return { success: false, jobId, error: errMsg };
        }

        await step.run('update-report', async () => {
            const finalRanked = results.slice(0, topN);
            await connectToDatabase();

            const fullData = {
                symbol,
                interval,
                best: isSingle ? finalRanked : undefined,
                ranked: !isSingle ? finalRanked : undefined,
                results: results,
                completedAt: new Date(),
            };

            const report = await Report.create({
                jobId,
                userId,
                symbol,
                indicator: isSingle ? 'FIND_BEST' : 'RANK',
                bestValue: finalRanked.length > 0 ? finalRanked[0].winRate : null,
                winRate: finalRanked.length > 0 ? finalRanked[0].winRate : null,
                fullData,
            });

            await AIJob.updateOne(
                { jobId },
                {
                    $set: {
                        status: 'completed',
                        reportId: report._id.toString(),
                        completedAt: new Date(),
                        'steps.3.status': 'completed',
                        'steps.3.completedAt': new Date(),
                        'steps.3.detail': `Backtests completed successfully.`,
                    },
                }
            );

            await Notification.create({
                userId,
                type: 'ai_job_completed',
                title: 'İndikatör Sıralaması Tamamlandı',
                message: `${symbol} için teknik göstergeler başarıyla analiz edildi.`,
                jobId,
                reportId: report._id.toString(),
                actionUrl: `/archive/reports/${report._id.toString()}`
            });
        });

        return { success: true, jobId };
    }
);


// ---- Forward Tests ----

export const evaluateForwardTestsDailyJob = inngest.createFunction(
    { id: 'evaluate-forward-tests-daily', triggers: [{ cron: '0 18 * * 1-5' }] }, // 6 PM ET on weekdays (after market close)
    async ({ step }) => {
        const result = await step.run('run-daily-evaluation', async () => {
            return await evaluateForwardTests('1d');
        });
        return { success: true, executed: result.executed };
    }
);

export const evaluateForwardTests4HJob = inngest.createFunction(
    { id: 'evaluate-forward-tests-4h', triggers: [{ cron: '30 9,13 * * 1-5' }] }, // 9:30 AM and 1:30 PM
    async ({ step }) => {
        const result = await step.run('run-4h-evaluation', async () => {
            return await evaluateForwardTests('4h');
        });
        return { success: true, executed: result.executed };
    }
);
