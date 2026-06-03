# Signalist — Master Architecture (Anayasa)

> **Son Güncelleme:** 3 Haziran 2026
> **Amaç:** Bu tek dosya, tüm Signalist projesinin güncel ve geçerli mimarisini belgeler. Yeni bir AI ajanı veya geliştirici yalnızca bu dosyayı okuyarak projeyi tam olarak anlayabilmelidir. Eski/1wk içerik bu dosyada **YOKTUR** — sadece bugün çalışan sistem.

---

## 1. Proje Özeti & Stack

**Signalist**, 17 teknik indikatörü birleştirip **oylama (voting) + kombinasyonel keşif** mantığıyla strateji üreten, indikatör bazlı bir **momentum + mean-reversion hibrit** trading sinyal sistemidir. Temel iddia: *"Tek bir indikatör yetersizdir; 2-5 indikatör aynı yönde oy verirse sinyal güvenilir olur."*

| Katman | Teknoloji | Versiyon |
|--------|-----------|----------|
| Framework | Next.js (App Router + Turbopack) | 16.0.3 |
| UI | React | 19.2.0 |
| Dil | TypeScript | ~5.x |
| Stil | Tailwind CSS | v4 |
| Veritabanı | MongoDB Atlas + Mongoose | v9.0.0 |
| Auth | Better Auth | v1.4.1 |
| AI SDK | Vercel AI SDK | v6 |
| AI Modelleri | Qwen 3 14B (local Ollama), Groq, OpenRouter | — |
| Background Jobs | Inngest | v4.3.0 |
| Charts | lightweight-charts (TradingView) | v4.2.0 |
| TradingView | iframe embed widget | — |
| Email | Nodemailer (Gmail SMTP) | v7.0.10 |
| State | Zustand + persist middleware | — |
| Test | Vitest | v4 |
| Validation | Zod | — |
| AI Email | Google Gemini (Inngest AI plugin) | — |

**Önemli Konfig Dosyaları:**
- `next.config.ts` — React Compiler aktif
- `proxy.ts` — Middleware auth guard (tüm route'lar korumalı, `/api`, `/_next/*`, `/favicon.ico`, `/sign-in`, `/sign-up`, `/assets` hariç)
- `tsconfig.json` — Path alias: `@/` → `./`

---

## 2. Dizin Yapısı (A → Z)

```
signalist_stock-tracker-app/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # sign-in, sign-up
│   ├── (root)/                   # Authenticated: home, /ai, /ta, /portfolio, /watchlist, /stocks, /alerts, /archive
│   ├── api/                      # chat, inngest, portfolio, stock, discovery
│   ├── layout.tsx                # Root layout
│   └── globals.css
├── components/                   # React UI
│   ├── ai/                       # AI Generative UI cards
│   ├── charts/                   # Lightweight Charts bileşenleri
│   ├── forms/                    # Input, Select, Country
│   ├── layout/                   # Header, ErrorBoundary, EditProfileModal
│   ├── panels/                   # TA panelleri (Backtest, Discovery, vb.)
│   ├── portfolio/                # Paper trading
│   ├── providers/                # AIEngineProvider
│   ├── ta/                       # TA-specific (IndicatorSection, DeepDiscovery, vb.)
│   ├── ui/                       # shadcn primitives
│   ├── watchlist/                # Watchlist
│   ├── alerts/, archive/, jobs/, notebook/  # Feature-specific
├── database/
│   ├── mongoose.ts
│   └── models/                   # 14 Mongoose model
├── docs/                         # YALNIZCA MASTER_ARCHITECTURE.md (bu dosya)
├── hooks/                        # Custom React hooks (chat, debounce, chart)
├── lib/                          # Backend logic
│   ├── actions/                  # Server Actions (18 adet)
│   ├── ai/                       # AI Agent (tools, prompts, contracts)
│   ├── better-auth/              # Auth config
│   ├── constants/                # Paylaşılan sabitler
│   ├── indicators/               # 17 indikatör + 3 pattern
│   ├── inngest/                  # Inngest client + function dosyaları
│   ├── nodemailer/               # Email templates
│   ├── paper-trading/            # Execution, metrics, forward test
│   ├── ta/                       # TA core (compute, signals, backtest, optimizer, strategy-optimizer)
│   ├── utils/, validations/
├── public/, store/, types/
├── scripts/                      # Tek-seferlik scriptler (cleanup, compare, diagnose)
└── __tests__/                    # Vitest (data, fixtures, helpers, paper-trading, reference, ta)
```

---

## 3. Mimari & Veri Akışı

### 3.1 Yüksek Seviye Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐         │
│  │  Pages   │ │  Server  │ │   API    │ │  Hooks  │         │
│  │  (RSC)   │ │ Actions  │ │  Routes  │ │ (Client)│         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘         │
│       └────────────┴────────────┴────────────┘                │
│                        │                                      │
│  ┌──── TA Core ────┐ ┌── Paper Trading ──┐ ┌── AI Agent ──┐  │
│  │ compute/signal  │ │ execution/metrics │ │ tools/prompts│  │
│  └─────────────────┘ └───────────────────┘ └──────────────┘  │
│                        │                                      │
└────────────────────────┼──────────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      ┌─────────┐  ┌─────────┐  ┌─────────┐
      │ MongoDB │  │ Finnhub │  │ Yahoo   │
      └─────────┘  └─────────┘  └─────────┘
```

### 3.2 4 Veri Akışı Pattern'i

**Pattern A: Page → Server Action → DB → Response**
Page (RSC) → Server Action → Mongoose → render. (Portfolio, watchlist, alerts, archive için)

**Pattern B: Page → External API → Response**
Page (RSC) → Server Action → Finnhub/Yahoo → candle data → charts. (TA, stock detail için)

**Pattern C: Chat → API → Inngest → AI → DB → Poll**
Client → POST /api/chat → AIJob create → Inngest → tools → save → client poll 1.5s.

**Pattern D: Cron → Inngest → Evaluate → Notify**
Cron → Inngest function → load user data → evaluate → notification/email.

### 3.3 Kritik Mimari Kararlar

| Karar | Gerekçe |
|-------|---------|
| AI için streaming YOK | 10s+ Vercel edge timeout'tan kaçınmak için async polling + Inngest |
| Para için Decimal128 | Floating-point corruption önleme (paper trading) |
| Immutable Trade ledger | Append-only trades → full audit trail |
| Signal Registry pattern | 51 pure fonksiyon, test edilebilir + composable |
| Lazy indicator computation | Sadece aktif indikatörler hesaplanır (Set-based filter) |
| URL-based indicator params | Tüm TA ayarları search params'ta → paylaşılabilir URL |
| Yahoo Finance primary | API key gerekmez, rate limit yok, 10+ yıl veri |
| `stopWhen: stepCountIs(3)` | AI max 3 tool call → hızlı yanıt, az DB yazma |
| **Timeframe = '1d' \| '4h'** | Sprint 3'te 1wk kaldırıldı — sadece daily ve 4-hour desteklenir |

---

## 4. Sayfalar & Route'lar

| Route | Tür | Açıklama |
|-------|-----|----------|
| `/` | RSC | Home dashboard — 4 TradingView widget |
| `/ta` | RSC | Teknik Analiz — indikatörler, chart'lar, backtest, strateji paneli |
| `/ai` | Client | AI Chat — Generative UI, tool sonuçları |
| `/portfolio` | Client | Paper trading — wallet, positions, trades |
| `/watchlist` | RSC | Watchlist + canlı fiyat |
| `/stocks/[symbol]` | RSC | Hisse detay |
| `/stocks/[symbol]/alert` | Client | Fiyat alarmı oluştur |
| `/alerts/create` | Client | Alarm oluştur |
| `/archive` | RSC | Jobs & reports archive |
| `/archive/reports/[id]` | RSC | Rapor detay |
| `/sign-in`, `/sign-up` | — | Better Auth email/password |

**TA Sayfası Yapısı:** URL-driven state: `?symbol=AAPL&ind=macd,rsi,bb&interval=1d&years=2`. Candle chart + 15 indikatör + strateji paneli + backtest monitor. Tüm ayarlar URL'de → paylaşılabilir.

---

## 5. Authentication

- **Library:** Better Auth v1.4.1 (`lib/better-auth/auth.ts`)
- **Strateji:** Email/password + session cookie
- **Middleware:** `proxy.ts` (whitelist: `/api|_next/static|_next/image|favicon.ico|sign-in|sign-up|assets`)
- **Session:** `auth.api.getSession({ headers: await headers() })`
- **Actions:** `lib/actions/auth.actions.ts` (sign-in, sign-up, sign-out wrapper)
- **Kayıt alanları:** fullName, email, password, country, investmentGoals, riskTolerance, preferredIndustry (Zod validation)

---

## 6. Technical Analysis Pipeline

```
Candle Data → computeIndicators() → computed Data
                                          ↓
                          generateAllSignals() → SignalMap + OverallResult
                                          ↓
                          calculateWinRate() (backtest)
                                          ↓
                          findBestParameter() (optimizer)
```

**Çekirdek tipler (`lib/ta/types.ts`):**
```typescript
type SignalLabel = 'STRONG BUY' | 'WEAK BUY' | 'STRONG SELL' | 'WEAK SELL' | 'NEUTRAL';
type Timeframe = '1d' | '4h';   // Sprint 3 sonrası — 1wk YOK
type SignalStrength = 2 | 1 | 0 | -1 | -2;
```

**`computeIndicators(candles, activeSet, params)`:** Sadece aktif indikatörler hesaplanır (Set-based filter). Lazy evaluation.

**`generateAllSignals(computed, candles)`:** Tüm aktif indikatörlerden sinyal al, `overall.label` (STRONG/WEAK/NÖTR) + `overall.score` (normalize edilmiş) üret.

**`calculateWinRate(indicator, candles, data, {lookForward})`:** Her sinyal için `lookForward` bar sonrası fiyat kontrolü. Cooldown + taze crossover filtresi.

---

## 7. 17 İndikatör + Signal Registry

**Merkezi matematik kernel** (`lib/indicators/_math.ts`): `createEMA`, `createSMMA` (Wilder's), `createSMA`, `createDev` (Pine Script uyumlu).

| # | Key | İsim | Kategori | Optimize? | Default |
|---|-----|------|----------|-----------|---------|
| 1 | rsi | RSI | momentum | ✅ | 14, 14 |
| 2 | macd | MACD | momentum | ✅ | 12, 26, 9 |
| 3 | stochrsi | Stochastic RSI | momentum | ✅ | 14, 14, 3, 3 |
| 4 | wavetrend | WaveTrend | oscillator | ✅ | 10, 21, 4 |
| 5 | dmi | Directional Movement | trend | ✅ | 14, 14 |
| 6 | mfi | Money Flow Index | volume | ✅ | 14 |
| 7 | smi | Stochastic Momentum | momentum | ✅ | 20, 5, 5 |
| 8 | ao | Awesome Oscillator | momentum | ❌ | 5, 34 |
| 9 | cci | Commodity Channel | oscillator | ✅ | 20, 14 |
| 10 | wpr | Williams %R | oscillator | ✅ | 14 |
| 11 | di | Demand Index | demand | ✅ | 10, 10, 2 |
| 12 | cmf | Chaikin Money Flow | volume | ✅ | 20 |
| 13 | ad | Accumulation/Distribution | volume | ❌ | — |
| 14 | netvol | Net Volume | volume | ❌ | — |
| 15 | madr | MA Deviation Ratio | oscillator | ✅ | 21 |
| 16 | alma | Arnaud Legoux MA | trend | ❌ | 9, 0.85, 6 |
| 17 | bb | Bollinger Bands | trend | ❌ | 20, 2, 0 |

**+ 3 Pattern aracı:** Candle Patterns, Historical Fractals, Support/Resistance.

**Signal Registry (`lib/ta/signal-registry.ts`):** 51 pure fonksiyon — her indikatör için 3 varyant:
- `*Signal()` → `'BUY' | 'SELL' | null` (basit yön)
- `*Strength()` → `2 | 1 | 0 | -1 | -2` (yoğunluk)
- `*Cross()` → `boolean` (crossover)

**Skorlama:** `STRONG BUY = +2`, `WEAK BUY = +1`, `NEUTRAL = 0`, `WEAK SELL = -1`, `STRONG SELL = -2`. Overall = aktif indikatör skorlarının ortalaması.

---

## 8. Backtest Engine

**`calculateWinRate(indicatorName, candles, data, config)`** → `{ winRate, totalSignals, wins, history }`

**Multi-Indicator Strategy Backtest (`lib/ta/strategy-optimizer.ts:runStrategyBacktest`):**
- Warmup: 55 bar (1d/4h)
- Cooldown (interval-aware): **1d=5 bar, 4h=15 bar** (1wk kaldırıldı)
- Her bar için: futurePrice = candles[i + lookForward].close
- Trade koşulu: ≥2 valid voter + ≥1 taze crossover + cooldown OK
- Voting: `all` (oybirliği) veya `majority` (çoğunluk)
- Win = `(BUY && futurePrice > currentPrice) || (SELL && futurePrice < currentPrice)`

**Built-in strateji (RSI_CCI_WT):** RSI + CCI + opsiyonel WaveTrend, oybirliği + en az 1 taze crossover.

---

## 9. Strategy Optimizer + Deep Discovery

### 9.1 OPTIMIZABLE_INDICATORS Registry
`Record<string, OptimizerEntry>` — her biri: `param`, `range [min, max]`, `compute(candles, val)`, `formatData(raw)`. 12 optimizable (RSI, MACD, STOCHRSI, WAVETREND, DMI, MFI, SMI, CCI, WPR, DI, CMF, MADR) + ALMA, BB (farklı range).

### 9.2 Single-Indicator Brute-Force
`findBestParameter(name, candles, config)` — range içindeki her değer için recompute + backtest. En iyi `{val, winRate}` döner.

### 9.3 Deep Discovery Engine — **5-Fazlı Pipeline** ✅
*(`lib/inngest/discovery-deep-search.ts` ve `lib/ta/strategy-optimizer.ts:discoverStrategy`)*

| Faz | Açıklama | Kazanç |
|-----|----------|--------|
| **1. Exhaustive Search** | Tüm 2'li ve 3'lü kombinasyonları test (worker pool, paralel) | 15.6% → 100% search coverage |
| **2. Surrogate Optimization** | Hızlı yaklaşık fonksiyonla parameter refinement | Global optimum bulma |
| **3. Diversity Ranking** | Birbirine benzer stratejileri ele | 10x çeşitlilik |
| **4. Cross-Validation (5-fold)** | Overfitting koruması | Gerçek piyasa performansına yakın sonuç |
| **5. Top 10 DB'ye kayıt** | Archive'a persist | Kalıcı keşif |

**Dinamik Pool:** `DISCOVERY_POOL.length = 17` (MAX_INDICATORS limiti YOK). Worker thread pool (auto-detect CPU cores, chunk=200, 5-min timeout).

**Race Condition Koruması:** MongoDB partial unique index (`{userId, type}` where status IN ['queued','running']) + atomic `AIJob.create()` + UI click guard.

---

## 10. 6 Algoritma İyileştirmesi + 7-Katman Filtre (HAP BİLGİ)

> **Win rate artışı:** ~59% → ~65-70% (Sprint 1-2 toplam kazanım)

### 10.1 6 İyileştirme

| # | İyileştirme | Mekanizma | WR Kazancı |
|---|-------------|-----------|------------|
| 1 | **Dynamic Cooldown (ATR-based)** | `ceil(baseCD × (avgATR/currentATR)^0.5)`, clamp [2, 20] | +1.5% |
| 2 | **Market Regime Detection** | 5 regime: ADX approx + MA slope + normalized ATR (uptrend/downtrend/ranging/volatile/neutral) | +3.5% |
| 3 | **Dempster-Shafer Fusion** | BBA belief masses + Dempster's Rule (conflict normalization, ≥0.65 threshold) | +2.0% |
| 4 | **ALMA/WT Boost** | 5% fitness multiplier (GA'da) | +1.5% |
| 5 | **Bayesian Meta-Learning** | Beta-Binomial posterior: `α/(α+β)` per regime | +2.5% |
| 6 | **TPE Parameter Optimizer** | KDE Parzen windows + EI ratio sampling | +2.0% |

### 10.2 7-Katman Filtre Pipeline

```
Candles → Warmup(55) → LookForward(14) → Dynamic Cooldown(ATR, 2-20)
        → Fresh Crossover → DST Fusion(≥0.65) → Market Regime Filter → Signals
```

**Pipeline öncesi:** Basit oybirliği/çoğunluk. **Pipeline sonrası:** Belief fusion + rejim bilinci + dinamik zamanlama.

---

## 11. Sprint 1 Tarihçesi (HAP BİLGİ)

| Alan | Değer |
|------|-------|
| **Aggressive Threshold** | `0.15` (eskiden `0.45` — çok sıkı, az sinyal) |
| **Confidence Gate** | RSI gibi göstergelere eklendi — sinyal olgunluk skoru |
| **Yönlü Cooldown** | Cooldown, sinyal yönüne göre (BUY sonrası farklı, SELL sonrası farklı) |
| **DST (Dempster-Shafer Theory)** | Oylama yerine inanç birleştirme (≥0.65 threshold) |

**Öğrenilen Ders:** Sabit threshold'lar piyasa rejimine göre başarısız olur; confidence gate ve ATR-based cooldown gerçek win rate'i yükseltir.

---

## 12. Sprint 2 Tarihçesi (HAP BİLGİ — 1wk guard bölümü çıkarıldı)

| Alan | Değer |
|------|-------|
| **Timeframe-aware lookback** | Timeframe'e göre farklı lookForward/warmup |
| **Soft-vote (in Trust)** | Marjinal kazançlar yerine confidence skoru (keskin oy birliği yerine yumuşak inanç) |
| **Auto-fallback (worker crash)** | `SEQUENTIAL_YIELD_INTERVAL = 5` — worker çökerse sıralı yedek (~500ms max blocking) |
| **Partial unique index** | MongoDB'de `{userId, type}` duplicate prevention |
| **AIEngineProvider debounce** | `lastRefreshRef` + 5s minimum interval |

---

## 13. Sprint 3 Tarihçesi — 1wk Temizliği

**Yapılan:** `'1wk'` Timeframe union'dan silindi → sadece `1d` ve `4h` desteklenir. `lib/constants/timeframe-limits.ts` silindi; tüm kullanımlar inline `LIMIT_INFO` veya `Math.min(years*365, 3650)` clamp'a dönüştürüldü.

**Etkilenen dosyalar:** 13 (types, timeframe-guard, inngest guard, API route, UI button, timeframes, finnhub actions, optimizer actions, AI tools, ta page, 2 component dosyası, inngest functions).

**Test sonucu:** 54/54 PASS (focused: rsi + wavetrend + strategy-optimizer + optimizer-sprint2).

---

## 14. AAPL Gerçek Backtest Sonuçları (HAP BİLGİ)

**Pipeline:** 30 sinyal → 18 hit → **%60 WR** (gerçek AAPL verisi).

**Funnel Analizi (kanıt):**
- RSI_CCI_WT ham backtest → yüksek sinyali ama düşük kalite
- 7-katman filtre sonrası → 30 sinyale düşürüldü (kalite > nicelik)
- Hardcoded tuning (Sprint 1 öncesi) her piyasada **ÇALIŞMAZ** — piyasa rejimine göre parametre değişmeli

**Ders:** Backtest "iyi görünen" sonuçlar overfitting olabilir. Cross-validation + regime detection + hardcoded tuning'den kaçınma zorunlu.

---

## 15. 4 Kritik Bug Dersleri (HAP BİLGİ)

| # | Bug | Kök Neden | Ders |
|---|-----|-----------|------|
| 1 | **Duplicate Engine B** | runStrategyBacktest'in hem client hem server'da çağrılması | Tek motor, tek kaynak (server action) |
| 2 | **Auto-save missing fields** | `isDiscovered` ve `sourceReportId` ilk save'de boş | Schema'da tüm alanları zorunlu yap, default değer ata |
| 3 | **Premature bestParams assignment** | `bestParams[x] = val` her iterasyonda, `if (winRate > best)` bloğu DIŞINDA | Parametre ataması, gerçek iyileşme koşulu İÇİNDE olmalı |
| 4 | **React Hooks violation** | Conditional `if` içinde `useState`/`useCallback` | Tüm hook'lar component top-level'ında, koşuldan ÖNCE |

---

## 16. AI Agent (20 tool, 3 kategori)

**Defense-in-depth:** 4 katman (Zod validation + try-catch + timeout + yieldToMain).

**3 Tool Kategorisi (token patlamasını önler):**

| Kategori | Tool'lar | Amaç |
|----------|----------|------|
| **TA_TOOLS** | analyzeIndicators, getCurrentPrice, searchStock | Anlık analiz, fiyat |
| **RESEARCH_TOOLS** | runBacktest, optimizeParameter, batchOptimizeParameter, rankIndicators, findBestIndicator, optimizeStrategyParams, discoverBestStrategy, getMarketNews | Backtest + optimizasyon (ağır CPU) |
| **USER_TOOLS** | getWatchlist, addToWatchlist, removeFromWatchlist, createPriceAlert, deletePriceAlert, getUserAlerts, getSmartAlerts, startForwardTest, getPortfolioStatus, proposeTrade, stopForwardTest | Kullanıcı verisi + trade |
| **PORTFOLIO_TOOLS** | getPortfolioStatus, proposeTrade, stopForwardTest | Portföy yönetimi |
| **+ SYSTEM** | askClarification | Eksik argüman toplama (UI halts) |

**STRICT BOUNDARY:** Her tool description'ında "NEVER use when user asks about..." — yanlış kategori kullanımını önler.

**4 Savunma Hattı:**
1. Zod input validation
2. try-catch wrapper (`safeResult` + `toToolError`)
3. Timeout: HEAVY=45s (optimizasyon), LIGHT=30s (veri çekme)
4. `yieldToMain` — event loop bloklamasın

**Hata kodları:** `EXTERNAL_API_DENIED`, `EXTERNAL_API_RATE_LIMIT`, `EXTERNAL_API_TIMEOUT`, `INSUFFICIENT_DATA`, `INVALID_SYMBOL`, `INTERNAL_ERROR` → kullanıcı dostu Türkçe mesaj.

**Trade özelliği:** `proposeTrade` tool'u → secure token (HMAC + nonce + 5dk expiry) → frontend confirmation card.

---

## 17. Database Models (14 collection)

`database/models/`:
1. **User** — Better Auth user + profile (country, investmentGoals, riskTolerance, preferredIndustry)
2. **Watchlist** — symbol + company
3. **Alert (PriceAlert)** — upper/lower threshold
4. **SmartAlert** — multi-indicator conditions (operator: `<`, `>`, `cross_above`, `cross_below`)
5. **Trade** — immutable ledger (Decimal128, append-only)
6. **Wallet** — cash, buyingPower, reserved
7. **Order** — limit/stop-loss/take-profit
8. **ForwardTest** — strategy definition + executionMode (shadow/auto/propose_only)
9. **SavedStrategy** — `{pinned, sourceReportId, isDiscovered}` (Sprint 2 eklentileri)
10. **Report** — fullData + status (optimization/discovery results)
11. **AIJob** — Inngest tracking (partial unique index for race prevention)
12. **Notification** — type, title, message, jobId
13. **StrategyMeta** — Bayesian posterior (α, β per regime)
14. **(diğer)** — session, account (Better Auth internal)

**Index stratejisi:** Compound index'ler (`{userId, pinned, createdAt}`), partial unique (`{userId, type}` where status IN [...]), lean() ile performans.

---

## 18. Inngest Jobs (11 fonksiyon)

| ID | Trigger | Amaç |
|----|---------|------|
| `sign-up-email` | event | Hoşgeldin emaili (Gemini ile kişiselleştirilmiş intro) |
| `daily-news-summary` | cron 0 12 * * * | Günlük watchlist haberleri emaili |
| `daily-price-alerts` | cron 0 12 * * * | Fiyat alarmlarını değerlendir + email |
| `ai-optimize-parameter` | event | Tek indikatör brute-force (background) |
| `ai-rank-indicators` | event | findBest + rankIndicators (isSingle flag) |
| `discovery-deep-search` | event | 5-fazlı pipeline worker |
| `evaluate-forward-tests-daily` | cron 0 18 * * 1-5 | 6 PM ET (piyasa kapanışı sonrası) |
| `evaluate-forward-tests-4h` | cron 30 9,13 * * 1-5 | 9:30 + 13:30 ET |
| `pending-order-processor` | cron | Bekleyen order'ları işle |
| `process-corporate-actions` | event | Hisse bölünmesi / temettü |
| **(toplam 11)** | | |

**Timeframe Guard:** `assertAllowedTimeframe(interval, callerName)` — 1wk gelirse '1d' fallback. `lib/ta/timeframe-guard.ts`.

---

## 19. Frontend Component Map

**TA Sayfası (`/ta`):** 17 chart (LightweightCandleChart + 15 indicator chart) + TAIntervalButton + TAIndicatorsButton + TATimeframes + TAIndicatorSettings + TASearch + StrategyBacktestMonitor + CustomStrategyPanel + CandlePatternPanel + HistoricalFractalsPanel + SRPanel + IndicatorSection (registry pattern ile 15 satır → tek bir block).

**AI Sayfası (`/ai`):** ChatManager hook + Generative UI cards (12 tip) + auto-scroll + offline detection.

**Portfolio:** WalletCard + PositionTable + TradeHistory + ManualTradeModal + ForwardTestCreator + PendingOrders.

**Archive:** JobsSection (15s polling) + JobItem (React.memo) + ReportDetail.

**Critical Hook'lar:** `useChatManager` (debounced), `useDebounce`, `useLightweightChart`, `useTradingViewWidget`, `useTAIndicatorParams`.

**State:** Zustand store (`store/useAppStore.ts`) + persist middleware.

---

## 20. Test Yapısı (Sprint 3 sonrası)

```
__tests__/
├── data/
│   └── synthetic-4h.test.ts
├── fixtures/                # Test verisi (korunur, kalsın)
│   ├── data/, indicators/, tradingview/
├── helpers/
│   └── indicator-test-utils.ts
├── paper-trading/
│   ├── decimal-utils.test.ts
│   └── execution-engine.test.ts
├── reference/               # TradingView karşılaştırma
│   ├── bollinger.reference.test.ts
│   ├── macd.reference.test.ts
│   ├── rsi.reference.test.ts
│   └── tradingview-comparison.test.ts
└── ta/
    └── optimizer.test.ts    # (sprint2 prefix'i kaldırıldı, root'tan taşındı)
```

**Sprint 3 öncesi silinen/taşınan:**
- `__tests__/optimizer-sprint2.test.ts` → `__tests__/ta/optimizer.test.ts` (taşıma)
- `__tests__/ta/signal-pipeline-aggressive-profile.test.ts` (1wk bağımlı, silindi)
- `__tests__/ta/diagnose-aggressive-profile.test.ts` (diagnostic script, silindi)
- `__tests__/reference/timeframe-all-indicators.test.ts` (1wk test verisi, silindi)

**Bilinen pre-existing sorun:** `rsi.reference.test.ts` 4 test — Sprint 1'in `confidence` field'ı ile fixture uyumsuz (Sprint 4'te yenilenecek).

**Test komutu:** `npx vitest run`

---

## 21. Bilinen Sorunlar & Gelecek Yol Haritası

### 21.1 Bilinen Sorunlar
- **1wk fixture sorunu:** `__tests__/reference/rsi.reference.test.ts` (Sprint 1 confidence field'ı uyumsuz)
- **Duplicate indicator'lar:** RSI + StochRSI korelasyonu yüksek (şişirilmiş sinyal)
- **Discovery yavaş:** 17 indikatörün tam kombinasyonu worker thread ile paralel ama sınırlı
- **Backtest slippage YOK:** Forward test'te slippage/spread/commission simülasyonu eksik

### 21.2 Gelecek Planlar (Roadmap)
| Sprint | Konu | Öncelik |
|--------|------|---------|
| 4 | Pre-existing fixture sorunları (RSI confidence) | YÜKSEK |
| 5 | İndikatör korelasyon matrisi (şişirilmiş sinyal önleme) | YÜKSEK |
| 6 | Discovery Engine → distributed queue (Redis/BullMQ) | ORTA |
| 7 | Slippage + spread + commission simülasyonu (backtest) | ORTA |
| 8 | Walk-Forward Optimization (in-sample / out-of-sample periodic) | ORTA |
| 9 | Ensemble stacking meta-classifier | DÜŞÜK |
| 10 | Exponential time-decay cooldown penalty | DÜŞÜK |
| - | **40+ indikatör ölçeklendirme** (SCALABLE_DISCOVERY_ARCHITECTURE) | PLANDA |

### 21.3 Scalability (gelecek 40+ indikatör)
- Sadece `lib/indicators/_math.ts`'a yeni compute + signal-registry'ye 3 varyant eklemek yeterli
- `INDICATOR_PARAMS` registry'ye default + bounds
- Dynamic pool (MAX_INDICATORS limiti YOK)
- Worker pool zaten auto-detect CPU cores

### 21.4 Strateji Felsefesi (tek cümle)
*"Doğru indikatör kombinasyonunu bul → oybirliği + cross-validation ile overfitting'den koru → paper trading ile gerçek piyasada doğrula → gerçek parayla oyna."*

---

## 📌 DEĞİŞİKLİK GEÇMİŞİ

| Tarih | Değişiklik |
|-------|-----------|
| 2026-06-02 | İlk MASTER_ARCHITECTURE.md oluşturuldu (Sprint 3 sonrası Bahar Temizliği) |

**Bu dosya TEK KAYNAK. Eski docs/ ve plans/ klasörleri tamamen temizlendi. Tüm bilgi sadece burada.**
