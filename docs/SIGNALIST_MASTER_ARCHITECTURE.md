# Signalist — Ana Sistem Mimarisi ve Teknik Referans

> **Versiyon:** 5.1 — Faz 4 (Trade Simulator Motoru + UI/UX Terminal İyileştirmeleri + System Logic Flow Dokümantasyonu)  
> **Tarih:** 2026-06-11  
> **Amaç:** Signalist projesinin eksiksiz, güncel ve tek kaynak teknik dokümanı.  
> Bu belge, kod tabanının Faz 2 (Clean Architecture ve Modülerizasyon), Faz 3 (Sinyal Mimarisi Güncellemesi — Kesişim Tabanlı Sinyaller) ve Faz 4 (Trade Simulator Motoru Mantıksal Güncellemeleri + UI/UX Terminal İyileştirmeleri) sonrasındaki nihai halini yansıtır.  
> **Dil:** Türkçe  
> **Muhatap:** Projeye yeni başlayan herhangi bir geliştirici (insan veya AI).

> ✅ **DÜZELTİLDİ (Resolved):** Faz 3 sonrasındaki sinyal düşüşü sorunu, Sprint 3 ile indikatör sinyallerinin tekrar seviye tabanlı trend takipçisi yapılmasıyla tamamen çözülmüştür. Güncel durumda sistem 394/395 sinyal üretebilmektedir. Detaylı analiz için [FEATURES_TODO_AND_DEBUG_REPORTS.md](./FEATURES_TODO_AND_DEBUG_REPORTS.md) Bölüm 11'e bakınız.
>
> ✅ **YENİ (Faz 4):** Trade Simulator motoruna pyramiding prevention, flat-only kuralı, time-stop bypass (trend rider) ve negatif fiyat koruması eklenmiştir. UI/UX tarafında CSV export, Popover parametreler, Hybrid Profit Factor badge ve scroll zıplama çözümü gibi kritik terminal iyileştirmeleri yapılmıştır.

---

## İçindekiler

1. [Proje Felsefesi ve Konsept](#1-proje-felsefesi-ve-konsept)
2. [Veri Akışı (Data Flow)](#2-veri-akışı-data-flow)
   - [2.1 End-to-End Veri Yolu](#21-end-to-end-veri-yolu)
   - [2.2 İki Ayrı Backtest Yolu](#22-iki-ayrı-backtest-yolu)
   - [2.3 Deep Discovery Pipeline](#23-deep-discovery-pipeline)
   - [2.4 Deep Discovery → TA Sayfası Senkronizasyonu](#24-deep-discovery--ta-sayfası-senkronizasyonu-keşiften-stratejiye-köprü)
   - [2.5 System Logic Flow & Hierarchy](#25-system-logic-flow--hierarchy)
     - [2.5.1 User Journey & Interaction Flow](#251-user-journey--interaction-flow-clientserver-synchronization)
     - [2.5.2 Mathematical & Engine Logic Flow](#252-mathematical--engine-logic-flow-pure-computation-pipeline)
     - [2.5.3 State Management Hierarchy](#253-state-management-hierarchy-activeposition-lifecycle)
     - [2.5.4 Import/Export Zinciri](#254-importexport-zinciri-dependency-graph)
3. [Matematiksel ve Mantıksal Motor](#3-matematiksel-ve-mantıksal-motor)
4. [Strateji Keşif ve Simülasyon Altyapısı](#4-strateji-keşif-ve-simülasyon-altyapısı)
5. [Trade Simulator Motoru — Faz 4 Mantıksal Güncellemeleri](#5-trade-simulator-motoru--faz-4-mantıksal-güncellemeleri)
6. [Güncel UI ve UX Durumu](#6-güncel-ui-ve-ux-durumu)
7. [UI/UX Terminal İyileştirmeleri — Faz 4](#7-uiux-terminal-iyileştirmeleri--faz-4)
8. [Gerçekçi Yol Haritası (Next Steps)](#8-gerçekçi-yol-haritası-next-steps)
9. [Gelecek Vizyonu ve İleri Düzey Geliştirme Önerileri](#9-gelecek-vizyonu-ve-ileri-düzey-geliştirme-önerileri)
10. [Ek A: Kritik Dosya Referansları ve Yeni Dosya Hiyerarşisi](#ek-a-kritik-dosya-referansları-ve-yeni-dosya-hiyerarşisi)
11. [Ek B: Faz 1-2 Kritik Düzeltme ve Refaktör Özeti](#ek-b-faz-1-2-kritik-düzeltme-ve-refaktör-özeti)
12. [Ek C: Faz 4 Trade Simulator ve UI/UX Güncelleme Özeti](#ek-c-faz-4-trade-simulator-ve-uiux-güncelleme-özeti)

---

## 1. Proje Felsefesi ve Konsept

### 1.1 Temel Prensip: İndikatör Tek Başına Strateji Değildir

Her teknik indikatör, piyasa hakkında **tek bir boyutu ölçen** bir araçtır. Hiçbiri doğrudan "al" veya "sat" diyemez.

| İndikatör | Gerçekte Yanıtladığı Soru | Kategori |
|-----------|--------------------------|----------|
| RSI | "Momentum aşırı uzandı mı?" | Osilatör |
| MACD | "Kısa ve uzun vadeli momentum farkı değişiyor mu?" | Trend |
| Bollinger Bands | "Fiyat istatistiksel normalin dışına çıktı mı?" | Volatilite |
| ADX / DMI | "Mevcut trendin gücü ne kadar?" | Trend Gücü |
| CMF / MFI | "Büyük para piyasaya giriyor mu, çıkıyor mu?" | Hacim |
| WaveTrend | "Kısa vadeli momentum osilasyonu hangi yönde?" | Osilatör |
| AO | "Anlık momentum ile orta vadeli momentum farkı?" | Momentum |

Gerçek bir trader'ın karar zinciri şöyledir:

1. **Trend hangi yönde?** (MACD, ADX, DMI)
2. **Momentum nerede?** (RSI, WaveTrend, StochRSI)
3. **Hacim destekliyor mu?** (CMF, MFI, A/D)
4. **Fiyat kritik bölgede mi?** (Bollinger, ALMA)
5. **Risk ne kadar?** (ATR, volatilite rejimi)

Bu beş sorunun **hepsine birden bakarak** bir karar verilir. İşte bu bir **stratejidir.** Sistemimiz, bu çok boyutlu karar sürecini matematiksel olarak modellemek üzere tasarlanmıştır.

### 1.2 Sistemin Çalışma Prensibi: DST + MCTS + MI

Sinyal üretim ve strateji keşif motoru üç temel matematiksel yapı taşı üzerine kuruludur:

```
Her bir İndikatör
      │
      ├── Sinyal üretir (BUY / SELL / null)
      │     └── *Signal() fonksiyonları → lib/ta/registry/signal-registry.ts
      │
      ├── İnanca dönüştürülür (BBA — Basic Belief Assignment)
      │     └── signalToBBA(signal, confidence, regime) → lib/ta/registry/signal-registry.ts:706
      │
      └── Tüm inançlar DST ile birleştirilir
            └── dempsterCombine() + fuseAll() → lib/ta/registry/signal-registry.ts:669-698
                  │
                  └── Konsensüs Karar: buy > TRADE_THRESHOLD → AL sinyali
```

Bu yaklaşımın avantajları:

- **Çakışan sinyaller graceful şekilde ele alınır:** Bir indikatör BUY, diğeri SELL diyorsa belirsizlik (uncertainty) artar, sistem "karar veremiyorum" der.
- **Her indikatörün gücü bağlama göre ayarlanır:** Trending piyasada daha az belirsizlik (güven artar), ranging piyasada daha fazla belirsizlik (güven azalır).
- **Tek bir indikatörün yanlış sinyali sistemi çökertmez:** Soft-vote mekanizması sayesinde aykırı sinyaller azınlıkta kalır.

### 1.3 Strateji Keşif Felsefesi: MI + MCTS + Hyperband

Sistem, "hangi indikatörler birlikte çalışır?" sorusunu üç aşamalı yanıtlar:

| Aşama | Algoritma | Yanıtladığı Soru |
|-------|-----------|-----------------|
| **MI Filtresi** | Mutual Information | "Bu indikatör bu hisse için bilgi taşıyor mu?" |
| **MCTS Arama** | Monte Carlo Tree Search | "Hangi indikatör kombinasyonu en iyi?" |
| **Hyperband** | Multi-Fidelity Optimization | "Bu kombinasyon gerçekten sağlam mı?" |

**Kritik tasarım kararı:** MI, MCTS için bir **soft bias (yumuşak öncelik)** olarak kullanılır, **hard filter (sert filtre) olarak değil.** Düşük MI skorlu indikatörler hâlâ keşfedilebilir — sadece daha düşük öncelikle.

### 1.4 Proje Teknoloji Yığını

| Katman | Teknoloji |
|--------|----------|
| **Framework** | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| **Veritabanı** | MongoDB (Mongoose 9 ODM) |
| **State Yönetimi** | Zustand 5 |
| **Auth** | Better Auth 1.4 (session-based) |
| **İş Kuyruğu** | Inngest (event-driven, durable execution) |
| **Test** | Vitest 3 |
| **UI** | Tailwind CSS v4 + shadcn/ui |
| **Grafik** | Lightweight Charts (canvas) + TradingView Widget |
| **AI/LLM** | Vercel AI SDK — Groq, OpenAI, OpenRouter, Google Gemini, Ollama |
| **E-posta** | Nodemailer 7 (SMTP) |
| **Veri Kaynağı** | Finnhub REST API + Yahoo Finance (yedek) |

---

## 2. Veri Akışı (Data Flow)

### 2.1 End-to-End Veri Yolu

```
┌─ 1. Kullanıcı TA sayfasında hisse ve timeframe seçer ─────────────────────┐
│                                                                            │
│   app/(root)/ta/page.tsx                                                   │
│   components/ta/controls/TAIntervalButton.tsx (1d veya 4h)                 │
│   components/ta/controls/TASearch.tsx (sembol arama)                        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ 2. Finnhub API'den OHLCV verisi çekilir ─────────────────────────────────┐
│                                                                            │
│   lib/actions/finnhub.actions.ts (Giriş)                                   │
│     └── Delege eder → lib/actions/finnhub/candles.ts                       │
│     • interval: "1d" veya "4h" (timeframe-guard.ts ile valide edilir)     │
│     • days: 365-3650 (1-10 yıl)                                            │
│     • Dönüş: Candle[] { time, open, high, low, close, volume }            │
│     • Optimizer 10 yıl (3650 gün) kullanır — lib/actions/optimize.actions.ts│
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ 3. İndikatörler hesaplanır ───────────────────────────────────────────────┐
│                                                                            │
│   lib/ta/compute.ts → computeIndicators(candles, activeKeys, params)      │
│     • 17 indikatör paralel hesaplanır (sadece activeKeys set'inde olanlar)│
│     • Varsayılan parametreler: RSI(14), MACD(12,26,9), CCI(20), vb.      │
│     • Dönüş: ComputedIndicators { rsi, macd, cci, mfi, ... }             │
│                                                                            │
│   lib/ta/strategy-optimizer.ts (Delege eder)                               │
│     └── Delege eder → lib/ta/strategy-optimizer/run-backtest.ts            │
│           └── mapComputedToAllData(computed) → AllData                     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─ 4a. TEK İNDİKATÖR BACKTEST ──┐   ┌─ 4b. STRATEJİ BACKTEST / KEŞİF ─────┐
│                                │   │                                       │
│ lib/ta/simulation/backtest.ts  │   │ lib/ta/strategy-optimizer/            │
│   calculateWinRate()           │   │   run-backtest.ts                     │
│                                │   │     runStrategyBacktest()             │
│ • Her bar bağımsız değerlendir │   │                                       │
│ • *Signal() → BUY/SELL         │   │ • Her bar için:                      │
│ • 5 bar sonraki fiyata bak     │   │   1. classifyRegime() → rejim tespit │
│ • Basit, zincirleme yok        │   │   2. getIndicatorSignal() → sinyal   │
│                                │   │   3. signalToBBA() → inanç          │
│ Kullanıcı: "RSI'yı optimize    │   │   4. fuseAll() → DST konsensüs      │
│             et" butonu         │   │   5. simulateTrade() → SL/TP/Trail  │
│                                │   │   6. activePosition yönetimi (Faz 4) │
│                                │   │                                       │
│                                │   │ Kullanıcı: "Strateji Keşfet" butonu  │
└────────────────────────────────┘   └───────────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─ 5. Sonuçlar UI'da gösterilir ────────────────────────────────────────────┐
│                                                                            │
│   components/panels/BacktestMonitor.tsx (tek indikatör sonuçları)         │
│   components/panels/StrategyBacktestMonitor.tsx (strateji sonuçları)      │
│   components/ta/discovery/DeepDiscoveryResults.tsx (keşif sonuçları)      │
│   components/ta/panels/MarketTelemetryPanel.tsx (rejim analizi)            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 İki Ayrı Backtest Yolu

Sistemde **birbirinden bağımsız iki backtest yolu** bulunur:

| Özellik | Yol A: Tek İndikatör | Yol B: Strateji (DST) |
|---------|---------------------|----------------------|
| **Fonksiyon** | `calculateWinRate()` | `runStrategyBacktest()` |
| **Dosya** | [lib/ta/simulation/backtest.ts](lib/ta/simulation/backtest.ts) | [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts) |
| **Sinyal** | `*Signal()` doğrudan (kesişim tabanlı) | `*Signal()` → BBA → DST Fusion (kesişim tabanlı) |
| **Değerlendirme** | 5 bar lookForward | Path-aware trade simülasyonu (SL/TP/Trailing) |
| **Regime** | Kullanılmaz | `classifyRegime()` ile rejim-adaptif |
| **SL/TP** | Yok | Var (ATR tabanlı) |
| **Pyramiding Prev.** | Yok | Var (Faz 4 — `activePosition` state) |
| **Flat-Only Kuralı** | Yok | Var (Faz 4 — ters sinyalde düz geçiş) |
| **Time-Stop Bypass** | Yok | Var (Faz 4 — kârda trende tutunma) |
| **Kullanıcı Aksiyonu** | "Optimize Et" butonu | "Strateji Keşfet" butonu |

> **Faz 3 Notu:** Her iki yol da aynı `signal-registry.ts`'teki **kesişim tabanlı** `*Signal()` fonksiyonlarını paylaşır. Sinyal fonksiyonları artık `prev*` parametreleri alır ve sadece crossover anında BUY/SELL döner. Birinde yapılan değişiklik diğerini etkiler.

### 2.3 Deep Discovery Pipeline (Inngest Background Job)

```
Kullanıcı "Deep Discovery" başlatır
  │
  └── Inngest event: "discovery/deep-search.started"
        │
        └── lib/inngest/discovery-deep-search.ts → deepDiscoveryJob
              │
              ├── Phase 1: VERİ HAZIRLAMA
              │     • getCandlesForInterval() → Candle[]
              │     • computeIndicators() → ComputedIndicators
              │     • mapComputedToAllData() → AllData
              │
              ├── Phase 1.5: TELEMETRY EVAL (Market Telemetry Integration)
              │     • computeTelemetryConfidences() → Record<string, number>
              │     • Her indikatör için nedensel (causal) rejim hit rate'lerini hesaplar ve DST için inanç (confidence) skorlarına dönüştürür.
              │
              ├── Phase 2: MI FİLTRESİ + MCTS ARAMA
              │     • computeMIPriorWeights() → Float64Array(17)
              │     • mctsSearch() — 100 simülasyon, max 300 düğüm, max derinlik 4
              │
              ├── Phase 3a-c: HYPERBAND BRACKET'LER
              │     • Bracket 0: %25 density → top 1/3 promote
              │     • Bracket 1: %50 density → top 1/3 promote
              │     • Bracket 2: %100 density + DE optimizasyonu
              │
              ├── Phase 4: STRATEJİ PORTFÖYÜ
              │     • buildPortfolio() → korelasyon bazlı seçim
              │     • computeWeights() → rejim-adaptif fusion
              │
              └── Phase 5: KAYDET
                    • AIJob.updateOne() → MongoDB
                    • Report.create() → arşiv
                    • Notification.create() → kullanıcı bildirimi
```

### 2.4 Deep Discovery → TA Sayfası Senkronizasyonu (Keşiften Stratejiye Köprü)

Keşif motorunun bulduğu stratejiler, TA sayfasına üç kanaldan aktarılır:

| Kanal | Tetikleyici | URL Formatı | Açıklama |
|-------|------------|-------------|----------|
| **Arşiv Raporu** | "Go to TA" butonu | `?strategy=<id>&mode=majority&evalMode=pathaware&profile=<p>&p=<json>` | Tam keşif konfigürasyonu ile birebir senkronizasyon |
| **DiscoveredStrategiesSection** | Strateji seçimi → Apply | `?strategy=<id>&p=<json>` | Kaydedilmiş keşif stratejisini aktif eder |
| **Deep Discovery Sonuç** | `onApply` callback | `?strategy=<id>&p=<json>` | Keşif tamamlandığında anında uygulama |

**Kritik:** `mode`, `evalMode` ve `profile` parametreleri URL'de taşınmazsa, TA sayfası varsayılan değerlere düşer ve keşif raporuyla sayfa arasında Win Rate / Sinyal uyuşmazlığı oluşur. Bu senkronizasyon [Sprint 3'te](FEATURES_TODO_AND_DEBUG_REPORTS.md#11-10062026-tarihli-sprint-3-arayüz-düzeltmeleri-senkronizasyon-ve-yönlendirme-uyuşmazlığı-raporu-sprint-3-ui-sync--discrepancy-fixes) tamamlanmıştır.

---

### 2.5 System Logic Flow & Hierarchy

Bu bölüm, kullanıcının bir butona basmasıyla başlayan ve backtest motorunun matematiksel çıktısına kadar uzanan zincirleme sürecin teknik yol haritasını belgeler. İki perspektiften incelenir:

- **Interaction Flow:** Client/Server boundary'sinde parametrelerin nasıl dönüştüğü
- **Engine Flow:** Saf fonksiyon pipeline'ında state yönetiminin nerede devreye girdiği

---

#### 2.5.1 User Journey & Interaction Flow (Client/Server Synchronization)

Sistem, Next.js App Router'ın hibrit mimarisini kullanır: Server Components (`page.tsx`) veriyi hazırlar, Client Components (butonlar, monitörler) etkileşimi yönetir, Server Actions (`backtest.actions.ts`) güvenli hesaplama yapar.

##### Aşama 1: URL → Server Component Dispatch

```
Kullanıcı bir hisse seçer veya strateji butonuna basar
  │
  └── router.push("/ta?symbol=AAPL&strategy=rsi_cci_wt&interval=1d")
        │
        └── page.tsx (Server Component) — her istekte yeniden çalışır
              │
              ├── URL Parametrelerini okur:
              │     search.symbol   → "AAPL"
              │     search.ind      → "rsi,cci,macd" (veya boş)
              │     search.interval → "1d" | "4h"     (varsayılan: 1d)
              │     search.strategy → "rsi_cci_wt" | "temp" | "<mongoId>"
              │     search.mode     → "majority" | "all"
              │     search.evalMode → "pathaware" | "lookforward" | "regime"
              │     search.profile  → "TrendFollower" | "SwingTrader" | ...
              │     search.p        → JSON optimized params (keşiften gelen)
              │     search.optimize → "1" (senkron optimizasyon tetikle)
              │
              ├── extractIndicatorParams(effectiveSearch) → Record<string, number>
              │     Kaynak: lib/constants/indicator-params.ts
              │     URL'deki snake_case parametreleri (rsi_len=14)
              │     IndicatorParams objesine dönüştürür.
              │
              └── Auth kontrolü: auth.api.getSession() → userId
```

##### Aşama 2: Server-Side Engine Dispatch (Veri → Hesaplama)

```
page.tsx (server) devam eder:
  │
  ├── 2a. VERİ ÇEKME
  │     getCandlesForInterval(symbol, interval, days)
  │       → lib/actions/finnhub.actions.ts (delegating wrapper)
  │         → lib/actions/finnhub/candles.ts
  │           → Finnhub REST API (OHLCV)
  │       ← Candle[] { time, open, high, low, close, volume }
  │     Not: Maksimum 3650 gün (10 yıl). 4h ve 1d için inline clamp.
  │
  ├── 2b. İNDİKATÖR HESAPLAMA
  │     computeIndicators(candles, activeIndicators, ip)
  │       → lib/ta/compute.ts (orchestrator)
  │         → 17 bağımsız compute fonksiyonu (lib/indicators/*.ts)
  │           Ortak matematik: lib/indicators/_math.ts
  │             createSMA, createEMA, createSMMA, createDev
  │       ← ComputedIndicators { rsi, macd, cci, wavetrend, ... }
  │
  ├── 2c. STRATEJİ BACKTEST (eğer strategy param varsa)
  │     ComputedIndicators → AllData (manuel mapping, page.tsx:168-186)
  │     runStrategyBacktest(candles, strategyName, allData, config, opts)
  │       → lib/ta/strategy-optimizer/run-backtest.ts
  │         ├── computeATR(candles, 14) → atrValues[]
  │         ├── classifyRegime() — tüm barlar için pre-compute
  │         ├── Ana döngü (i = startIndex → endIndex):
  │         │   ├── evaluateRawSignal(i) → DST Fusion / Majority Vote
  │         │   ├── Gate 2: Pyramiding Prevention
  │         │   ├── Gate 3: Flat-Only Rule
  │         │   ├── Gate 4: Dynamic Cooldown
  │         │   └── simulateTrade() → SL/TP/Trailing/Time-Stop Bypass
  │         └── Metric aggregation → StrategyBacktestResult
  │       ← StrategyBacktestResult { winRate, history[], profitFactor, ... }
  │     → TradeMarker[] (entry + exit noktaları, grafik için)
  │       Her history item: entry marker (BUY▼/SELL▲) + exit marker (SL/TP/TS/TIME/OPP)
  │
  └── 2d. CANLI SİNYAL PANELİ
        generateAllSignals(computed, candles)
          → lib/ta/signals.ts
          ← { signals: SignalMap, overall: { label, signalCount } }
```

##### Aşama 3: Server → Client Hydration (Props olarak veri geçişi)

Server Component (`page.tsx`), tüm hesaplamaları tamamladıktan sonra Client Component'lere props olarak veriyi geçirir. Bu noktada **client'a sadece sembol ve interval değil, önceden hesaplanmış tüm indikatör verileri** iletilir — böylece client tarafında tekrar API çağrısı yapılmaz.

```
page.tsx → JSX render:
  │
  ├── TAStrategiesButton
  │     props: { userId, candles, allData (17 indikatör), interval, symbol }
  │     → Client Component — strateji seçimi, kaydetme, keşif tetikleme
  │     → Kullanıcı strateji değiştirdiğinde router.push ile sayfa yeniden yüklenir
  │       (sayfa Server Component olduğu için Aşama 1-2 tekrar çalışır)
  │
  ├── StrategyBacktestMonitor
  │     props: { strategyName, symbol, candles, rsiData, cciData,
  │              waveTrendData, interval, mode, signalProfile,
  │              initialOptimizedParams, discoveryWinRate, ... }
  │     → Client Component — backtest sonuçlarını gösterir
  │     → İçinde kendi useEffect + runBacktestAction (Server Action) çağrısı yapar
  │       (parametre değişikliklerinde dinamik olarak sunucuya istek atar)
  │
  ├── CandleChartSection
  │     props: { data: candles, tradeMarkers, bbData, almaData,
  │              candlePatterns, fractalProjection, srLevels, availableToggles }
  │     → Client Component — canvas grafik + overlay toggle'lar
  │
  └── IndicatorSection (17 indikatör paneli)
        → Her biri kendi BacktestMonitor'ünü içerir
        → BacktestMonitor: calculateWinRate() + Diagnostic Optimization butonu
```

##### Aşama 4: Client Interaction — TAStrategiesButton Karar Ağacı

```
TAStrategiesButton (Client Component)
  │
  ├── Kullanıcı "Built-In: RSI+CCI+WT" seçer → toggleStrategy("rsi_cci_wt")
  │     └── applyStrategy("rsi_cci_wt")
  │           → router.push("/ta?symbol=AAPL&strategy=rsi_cci_wt")
  │           → Tam sayfa yeniden yükleme (Server Component)
  │           → page.tsx Aşama 2c'yi strategyName="RSI_CCI_WT" ile çalıştırır
  │
  ├── Kullanıcı kayıtlı/discovered strateji seçer → toggleStrategy(id)
  │     └── applyStrategy(id)
  │           → router.push("/ta?symbol=AAPL&strategy=<id>&p=<json_params>")
  │           → page.tsx, p paramındaki değerleri IndicatorParams'a override eder
  │             (Case-insensitive: toLowerCase() ile registry anahtarları eşleştirilir)
  │
  ├── Kullanıcı "Create Strategy" butonuna basar → setModalOpen(true)
  │     └── CustomStrategyModal → indikatör seçimi, parametre ayarı
  │         → Kaydet: MongoDB'ye yeni strateji dokümanı
  │         → handleCreated() → listeye ekle, modalı kapat
  │
  ├── Kullanıcı "Discover Strategies" butonuna basar → setDiscoveryOpen(true)
  │     └── StrategyDiscoveryDialog → sembol ve interval seçimi
  │         → Inngest event: "discovery/deep-search.started"
  │         → Arka planda deepDiscoveryJob çalışır (bkz. Bölüm 2.3)
  │         → Tamamlandığında handleDiscoveryApply() ile strateji aktif edilir
  │
  └── Strateji yönetimi (pin, rename, delete):
        → useStrategyActions hook → MongoDB CRUD
        → useStrategyURL hook → URL ↔ state senkronizasyonu
```

##### Aşama 5: Client → Server Action (Dinamik Backtest ve Optimizasyon)

`StrategyBacktestMonitor`, sayfa yüklendiğinde `useEffect` ile otomatik backtest çalıştırır. Kullanıcı parametre değiştirdiğinde veya "Optimize" butonuna bastığında da Server Action'lar tetiklenir.

```
┌─ runBacktestAction(symbol, strategyName, config) ──────────────────────────┐
│ 'use server' — lib/actions/backtest.actions.ts                             │
│                                                                            │
│ 1. Better Auth oturum kontrolü (auth.api.getSession)                       │
│ 2. getCandlesForInterval(symbol, interval, 3650) → Candle[]               │
│ 3. computeIndicators(candleInputs, activeIndicators, mergedParams)         │
│    → ComputedIndicators                                                    │
│ 4. mapComputedToAllData(computed) → AllData                               │
│ 5. runStrategyBacktest(candles, strategyName, allData, config, opts)      │
│    → StrategyBacktestResult                                                │
│ 6. return sonuç → Client'ta setStats() ile state güncellenir               │
│                                                                            │
│ Kullanıcı tetikleyicisi: useEffect (symbol/strategy/params değişince)     │
│ Config: lookForward, interval, customIndicators, mode, signalProfile,     │
│         evaluationMode, portfolioConfig, parameterOverrides                │
└────────────────────────────────────────────────────────────────────────────┘

┌─ optimizeStrategyAction(symbol, indicatorKeys, options) ───────────────────┐
│ 'use server' — lib/actions/optimize-strategy.actions.ts                    │
│                                                                            │
│ 1. Better Auth oturum kontrolü                                             │
│ 2. getCandlesForInterval(symbol, interval, 3650) → Candle[]               │
│ 3. computeIndicators(candleInputs, activeIndicators, mergedParams)         │
│ 4. mapComputedToAllData(computed) → AllData                               │
│ 5. optimizeStrategyParams(candles, allData, config)                        │
│      → lib/ta/strategy-optimizer/optimize-params.ts                        │
│      → Brute-force parametre taraması (örn: lookForward 5→30 adım 1)      │
│      → Her parametre değeri için runStrategyBacktest() çağrısı             │
│      → En yüksek winRate'i veren parametre seti seçilir                    │
│ 6. return { bestParams, bestWinRate, iterations, roundResults }            │
│                                                                            │
│ Kullanıcı tetikleyicisi: "Optimize" butonu (Zap ⚡ ikonu)                  │
│ Buton state'leri:                                                          │
│   - Normal: optimizeStrategyAction çağrılır                                │
│   - AI Discovered: buton disabled (zaten optimize edilmiş)                 │
│   - isOptimizing: Loader2 spinner gösterilir                               │
└────────────────────────────────────────────────────────────────────────────┘
```

##### Aşama 6: Sonuç → UI Render + CSV Export

```
StrategyBacktestResult Client'a ulaştığında (setStats):
  │
  ├── SVG Circular Progress Bar (64×64px, animasyonlu stroke-dashoffset)
  │     • Renk: ≥68% emerald glow, ≥62% emerald, ≥55% green,
  │              ≥48% yellow, >0% red, 0% gray
  │     • Merkezde: %{displayRate} (canlı backtest sonucu)
  │
  ├── Signal Count + Hit Count + Profit Factor Badge
  │     • PF ≥ 1.50 → 🟢 Emerald (güçlü kârlılık)
  │     • PF 1.00-1.49 → 🟡 Amber (marjinal)
  │     • PF < 1.00 → 🔴 Red (zarar)
  │     • Hover: Total Return (%) + R/R Ratio detayı
  │
  ├── Optimized Settings (Popover)
  │     • Tetikleyici: ⚡ Optimized Settings butonu (amber, animate-pulse)
  │     • İçerik: Parametre adı (gray-400 uppercase) + değer (amber-400 bold)
  │     • max-h-48 scrollable, glassmorphism backdrop
  │
  ├── Trade History Dialog (History 📜 ikonu)
  │     • max-h-[400px] scrollable tablo
  │     • Kolonlar: Date, Signal, Entry, Exit, Bars, Exit Reason, Result
  │     • Exit Reason renk kodlaması:
  │       TP=emerald, SL=red, Trailing=blue, Time=yellow, Opposite=gray
  │     • Sonuç: HIT (yeşil badge) / MISS (kırmızı badge)
  │
  └── CSV Export (Download ⬇ butonu)
        • handleDownloadCSV(): history[] → CSV string
        • Blob API + URL.createObjectURL() + geçici <a> click()
        • Sıfır sunucu isteği — tamamen client-side
        • Dosya adı: strategy_history_{symbol}_{strategyName}.csv
        • Kolonlar: Date, Signal, Entry Price, Exit Price,
                     Bars Held, Exit Reason, Outcome
```

---

#### 2.5.2 Mathematical & Engine Logic Flow (Pure Computation Pipeline)

Bu bölüm, ham veriden nihai metriğe uzanan **7 katmanlı saf fonksiyon pipeline'ını** belgeler. Her katman, bir üst katmanın çıktısını girdi olarak alır. State yönetimi (Pyramiding Prevention, Flat-Only, Time-Stop Bypass) **Katman 4 ve Katman 5'te** devreye girer.

```
KATMAN 0: RAW DATA
┌─────────────────────────────────────────────────────────────────┐
│ Candle[] { time, open, high, low, close, volume }              │
│ Kaynak: Finnhub REST API → lib/actions/finnhub/candles.ts      │
│ Hacim: 1-10 yıl (365-3650 gün), interval: "1d" veya "4h"      │
│ Not: time alanı number (Unix timestamp) formatında             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
KATMAN 1: INDICATOR ENGINE
┌─────────────────────────────────────────────────────────────────┐
│ computeIndicators(candles, activeKeys, params)                  │
│ Dosya: lib/ta/compute.ts                                        │
│                                                                 │
│ 17 bağımsız indikatör paralel hesaplanır (sadece activeKeys):   │
│   RSI(14)+MA, MACD(12,26,9), CCI(20)+MA, StochRSI(14,3,3),    │
│   WaveTrend(21,10,4), DMI(14,14), MFI(14), SMI(14,3,3),       │
│   AO, WPR(14), DI(10,10,2), CMF(20), A/D(21),                  │
│   NetVolume, MADR(21), ALMA(9,0.85,6), BB(20,2)                │
│                                                                 │
│ Her compute fonksiyonu → lib/indicators/<name>.ts               │
│   Ortak matematik: lib/indicators/_math.ts                      │
│     createSMA (circular buffer, sum/definedCount)               │
│     createEMA (k=2/(period+1), iki seed stratejisi)             │
│     createSMMA (Wilder's smoothing, RSI/DMI/ADX için)           │
│     createDev (Pine Script ta.dev uyumlu, CCI için)             │
│                                                                 │
│ Çıktı: ComputedIndicators {                                     │
│   rsi, macd, cci, stochrsi, wavetrend, dmi, mfi, smi,         │
│   ao, wpr, di, cmf, ad, netvol, madr, alma, bb                 │
│ }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
KATMAN 2: DATA ADAPTER
┌─────────────────────────────────────────────────────────────────┐
│ mapComputedToAllData(computed: ComputedIndicators): AllData     │
│ Dosya: lib/ta/strategy-optimizer/run-backtest.ts:38-74          │
│                                                                 │
│ ComputedIndicators → AllData (yapısal dönüşüm):                 │
│   computed.rsi        → allData.rsiData  { rsi, ma, confidence }│
│   computed.wavetrend  → allData.waveTrendData { wt1, wt2, ... } │
│   computed.mfi        → allData.mfiData { mfi }                 │
│   ... (17 indikatör, her biri kendi key yapısına)               │
│                                                                 │
│ Bu katman, indicator compute (compute.ts) ile backtest engine   │
│ (run-backtest.ts) arasındaki tip uyumluluğunu sağlar.           │
│ page.tsx tarafında manuel mapping de kullanılabilir (satır 168).│
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
KATMAN 3: SIGNAL ENGINE (DST Fusion / Majority Vote)
┌─────────────────────────────────────────────────────────────────┐
│ evaluateRawSignal(barIdx: number): 'BUY' | 'SELL' | null        │
│ Dosya: lib/ta/strategy-optimizer/run-backtest.ts:743-821        │
│                                                                 │
│ İKİ YOL (strategyName'e göre):                                  │
│                                                                 │
│ YOL A — RSI_CCI_WT (Majority Vote, 3 indikatör):                │
│   1. rsiSignal(rsi, rsiMa)          → BUY/SELL/null             │
│   2. cciSignal(cci, cciMa)          → BUY/SELL/null             │
│   3. waveTrendSignal(wt1, wt2)      → BUY/SELL/null             │
│   4. buyVotes === totalVoters → BUY (tümü aynı fikirde olmalı) │
│   5. requireCrossover? → hasFreshCrossover() son 7 bar kontrol  │
│                                                                 │
│ YOL B — CUSTOM (DST Fusion, 2+ indikatör):                      │
│   1. Her indikatör için: getIndicatorSignal(key, i, allData)    │
│        → *Signal() fonksiyonları (signal-registry.ts)           │
│        → Kesişim tabanlı: sadece crossover anında sinyal        │
│   2. Kaufman ER: efficiencyRatio(candles, i, 10) → [0,1]       │
│        → ER ≈ 1: güçlü trend, sinyal güveni yüksek             │
│        → ER ≈ 0: gürültülü piyasa, sinyal güveni düşük         │
│   3. Her sinyal → signalToBBA(signal, confidence × ER, regime)  │
│        → { buy, sell, uncertainty }                             │
│        → regime adaptasyonu: trending → -0.1 uncertainty        │
│                              ranging  → +0.15 uncertainty       │
│   4. fuseAll(bbas[]) → pairwise Dempster kombinasyonu           │
│        → conflict = 1 ise → { uncertainty: 1 } (karar yok)     │
│   5. fused.buy > TRADE_THRESHOLD → BUY                          │
│      fused.sell > TRADE_THRESHOLD → SELL                       │
│                                                                 │
│ TRADE_THRESHOLD (sinyal profiline göre):                         │
│   TrendFollower: 0.25 | SwingTrader: 0.30 | Aggressive: 0.15  │
│   Balanced: 0.40 | Conservative: 0.65                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
╔═════════════════════════════════════════════════════════════════╗
║ KATMAN 4: STATE GATE LAYER (Faz 4 — Sinyal Filtreleme)        ║
╠═════════════════════════════════════════════════════════════════╣
║ Dosya: lib/ta/strategy-optimizer/run-backtest.ts:737-847       ║
║                                                                 ║
║ activePosition: { type, entryIndex, exitIndex } | null          ║
║                                                                 ║
║ ┌─ GATE 1: Position Lifecycle Cleanup ───────────────────────┐ ║
║ │ if (activePosition && i > activePosition.exitIndex)        │ ║
║ │   activePosition = null  // pozisyon kapandı, state sıfırla│ ║
║ │                                                            │ ║
║ │ Bu gate, pozisyonun yaşam döngüsünü yönetir. ExitIndex     │ ║
║ │ geçildiğinde sistem tekrar sinyallere açık hale gelir.     │ ║
║ └────────────────────────────────────────────────────────────┘ ║
║                              │                                  ║
║                              ▼                                  ║
║ ┌─ GATE 2: Pyramiding Prevention ────────────────────────────┐ ║
║ │ isSameDirectionAsActive =                                  │ ║
║ │   activePosition !== null && signal === activePosition.type │ ║
║ │                                                             │ ║
║ │ Eğer TRUE → signal = null (aynı yönde ek işlem ENGELLENDİ) │ ║
║ │                                                             │ ║
║ │ Örnek: Bar 50'de BUY açıldı (exitIndex=65).                │ ║
║ │        Bar 55'te yeni BUY sinyali → İPTAL.                 │ ║
║ │        Amaç: Üst üste pozisyon açmayı (pyramiding) önlemek.│ ║
║ └────────────────────────────────────────────────────────────┘ ║
║                              │                                  ║
║                              ▼                                  ║
║ ┌─ GATE 3: Flat-Only Rule (Testere Koruması) ────────────────┐ ║
║ │ isOppositeDirectionOnExitBar =                             │ ║
║ │   activePosition !== null &&                               │ ║
║ │   i <= activePosition.exitIndex &&                         │ ║
║ │   signal !== activePosition.type                           │ ║
║ │                                                             │ ║
║ │ Eğer TRUE → signal = null (ters dönüş ENGELLENDİ)          │ ║
║ │                                                             │ ║
║ │ Örnek: BUY pozisyonu SELL sinyaliyle kapandı (exitIndex=65)│ ║
║ │        Bar 60-65 arası yeni SELL sinyali → İPTAL.          │ ║
║ │        Sistem FLAT konuma geçer, bekler.                   │ ║
║ │        Amaç: Testere piyasasında art arda zararı önlemek.  │ ║
║ └────────────────────────────────────────────────────────────┘ ║
║                              │                                  ║
║                              ▼                                  ║
║ ┌─ GATE 4: Dynamic Cooldown ─────────────────────────────────┐ ║
║ │ cd = getDynamicCooldown(atrValues, i, interval, config)    │ ║
║ │ cooldownOk = (i - lastSignalBar) >= cd                     │ ║
║ │                                                             │ ║
║ │ Volatilite-adaptif formül:                                  │ ║
║ │   cd = baseCooldown × (avgATR / currentATR)^gamma          │ ║
║ │   Clamp: [cooldownMin, cooldownMax]                        │ ║
║ │   intervalFactor: 4h → ×1.5 (daha sık işlem)              │ ║
║ │                                                             │ ║
║ │ SELL Bypass: Cooldown aktif olsa bile, mevcut BUY           │ ║
║ │ pozisyonunu kapatacak SELL sinyaline izin verilir.         │ ║
║ └────────────────────────────────────────────────────────────┘ ║
╚═════════════════════════════════════════════════════════════════╝
                             │
                             ▼
KATMAN 5: TRADE SIMULATOR (Path-Aware Bar-by-Bar Simulation)
┌─────────────────────────────────────────────────────────────────┐
│ simulateTrade(candles, entryIndex, signal, atrValues,           │
│               riskConfig, hasOppositeSignal?)                    │
│ Dosya: lib/ta/simulation/trade-simulator.ts:83-234               │
│                                                                 │
│ Giriş seviyeleri (ATR bazlı):                                   │
│   stopDistance = currentATR × stopLossAtrMult                   │
│   tpDistance   = stopDistance × takeProfitR                     │
│   BUY:  stopPrice = entry - stopDistance                        │
│         tpPrice   = entry + tpDistance                          │
│   SELL: stopPrice = entry + stopDistance                        │
│         tpPrice   = entry - tpDistance                          │
│                                                                 │
│ Her bar (i = entryIndex+1 → maxBar):                            │
│                                                                 │
│ ┌─ 5a. SL/TP/Trailing Kontrolü ──────────────────────────────┐ │
│ │ BUY pozisyon için:                                          │ │
│ │   • Trailing stop güncelle:                                 │ │
│ │     if (price > peakPrice) {                                │ │
│ │       peakPrice = price;                                    │ │
│ │       trailStop = peakPrice - ATR × trailAtrMult;           │ │
│ │     }                                                       │ │
│ │   • effectiveStop = max(fixedSL, trailingStop)              │ │
│ │   • price <= effectiveStop → stop_loss / trailing_stop      │ │
│ │   • price >= tpPrice → take_profit                          │ │
│ │                                                              │ │
│ │ SELL pozisyon için (inverse):                                │ │
│ │   • price < peakPrice → peakPrice güncelle                  │ │
│ │   • effectiveStop = min(fixedSL, trailingStop)              │ │
│ │   • price >= effectiveStop → stop_loss / trailing_stop      │ │
│ │   • price <= tpPrice → take_profit                          │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ 5b. Opposite Signal Kontrolü ─────────────────────────────┐ │
│ │ hasOppositeSignal(i) → evaluateRawSignal(i) çağrısı         │ │
│ │   signal === BUY  → SELL sinyali aranır                     │ │
│ │   signal === SELL → BUY sinyali aranır                       │ │
│ │ Eğer TRUE → opposite_signal ile çıkış                       │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ╔═════════════════════════════════════════════════════════════╗ │
│ ║ 5c. TIME-STOP BYPASS — TREND RIDER (Faz 4)                ║ │
│ ╠═════════════════════════════════════════════════════════════╣ │
│ ║ if (i >= entryIndex + timeStopBars) {                     ║ │
│ ║   const isTrailingStopActiveAndInProfit =                 ║ │
│ ║     riskConfig.useTrailingStop && pnlPct > 0;             ║ │
│ ║   if (!isTrailingStopActiveAndInProfit) {                 ║ │
│ ║     return time_stop;  // ← sadece BU koşulda çıkış       ║ │
│ ║   }                                                        ║ │
│ ║   // else: BYPASS → pozisyon trende tutunmaya devam eder  ║ │
│ ║ }                                                          ║ │
│ ║                                                            ║ │
│ ║ Aktif profiller:                                           ║ │
│ ║   TrendFollower (SL:3.0, TP:4.0, Trail:2.5) ✅           ║ │
│ ║   SwingTrader   (SL:2.0, TP:2.5, Trail:1.5) ✅           ║ │
│ ║   Aggressive    (SL:1.5, TP:1.5, Trail:0.5) ✅           ║ │
│ ║ Pasif profiller:                                           ║ │
│ ║   Balanced      (useTrailingStop: false)         ❌       ║ │
│ ║   Conservative  (useTrailingStop: false)         ❌       ║ │
│ ╚═════════════════════════════════════════════════════════════╝ │
│                                                                 │
│ Negatif Fiyat Koruması (Faz 4):                                 │
│   rawReturn = (exitPrice - entryPrice) / Math.abs(entryPrice)   │
│   → Teorik negatif fiyat senaryolarında işaret hatasını önler   │
│                                                                 │
│ Çıktı: SimulatedTrade {                                         │
│   entryIndex, exitIndex, exitReason, entryPrice, exitPrice,    │
│   realizedReturnPct, mfe, mae, intraTradeMaxDD, barsHeld       │
│ }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
KATMAN 6: METRIC AGGREGATION
┌─────────────────────────────────────────────────────────────────┐
│ runStrategyBacktest() — Sonuçların toplulaştırılması             │
│ Dosya: lib/ta/strategy-optimizer/run-backtest.ts:1050-1207      │
│                                                                 │
│ 6a. TEMEL METRİKLER:                                            │
│     winRate      = (wins / totalSignals) × 100                  │
│     profitFactor = grossLoss > 0 ? grossProfit/grossLoss : 999  │
│     sharpeRatio  = (mean/std) × √252 (Welford's online algo)   │
│     avgWin       = ΣwinningReturns / winningCount               │
│     avgLoss      = ΣlosingReturns / losingCount                 │
│     maxDrawdown  = max(peakEquity - currentEquity)              │
│     totalReturn  = Σ(tradeReturns)  (kümülatif, bileşik değil) │
│                                                                 │
│ 6b. PATH-AWARE METRİKLER (evalMode !== 'lookforward'):          │
│     avgMFE       = Σ(mfe) / totalSignals                        │
│     avgMAE       = Σ(mae) / totalSignals                        │
│     avgBarsHeld  = Σ(barsHeld) / totalSignals                   │
│     exitReasonBreakdown = {                                     │
│       stop_loss: N, take_profit: N, trailing_stop: N,          │
│       opposite_signal: N, time_stop: N                          │
│     }                                                           │
│                                                                 │
│ 6c. İLERİ METRİKLER:                                            │
│     PSR (Probabilistic Sharpe Ratio)                             │
│       → Bailey & López de Prado (2012) formülü                  │
│       → tradesReturns.length >= 3 ise hesaplanır               │
│     averageReturnPerBar = Σ(|realizedReturn|/barsHeld) / N      │
│     opportunityEfficiency = Σ(|realizedReturn|/mfe) / N         │
│     generalizationScore (train/test WR harmonic mean)           │
│                                                                 │
│ 6d. REGIME BREAKDOWN:                                           │
│     Her rejim için (uptrend/downtrend/ranging/volatile/neutral):│
│       winRate, totalSignals, wins, avgReturn, totalReturn       │
│                                                                 │
│ 6e. PORTFÖY SIMÜLASYONU (opsiyonel, portfolioConfig varsa):     │
│     runPortfolioSimulation(candles, portfolioSignals, config)   │
│       → equityCurve (200 noktaya resample), drawdownCurve       │
│       → finalEquity, cagr, maxDrawdownPct                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
KATMAN 7: OUTPUT → UI / CSV / CHART
┌─────────────────────────────────────────────────────────────────┐
│ StrategyBacktestResult {                                         │
│   winRate, totalSignals, wins, history[], profitFactor,         │
│   sharpeRatio, avgWin, avgLoss, maxDrawdown, totalReturn,       │
│   regimeBreakdown, avgMFE, avgMAE, avgBarsHeld,                 │
│   exitReasonBreakdown, equityCurve, drawdownCurve,              │
│   finalEquity, cagr, maxDrawdownPct, psr,                       │
│   averageReturnPerBar, opportunityEfficiency,                    │
│   evaluationMode, log (debugLog açıksa)                          │
│ }                                                               │
│                                                                 │
│   ├── UI: StrategyBacktestMonitor                               │
│   │     • SVG circle (%winRate, renk kodlu)                     │
│   │     • Signal count + Hit count + Profit Factor badge        │
│   │     • Popover: Optimized Settings                           │
│   │     • Dialog: Trade History tablosu                         │
│   │                                                              │
│   ├── CSV: handleDownloadCSV()                                  │
│   │     • history[] → Array.map() → CSV string                  │
│   │     • new Blob([csv], {type:'text/csv'}) → download        │
│   │     • Kolonlar: Date, Signal, Entry, Exit, Bars,           │
│   │       Exit Reason, Outcome                                  │
│   │                                                              │
│   └── Chart: TradeMarker[]                                      │
│         • Entry marker: fiyat seviyesinde ok (BUY▲/SELL▼)      │
│         • Exit marker: çıkış sebebi etiketi (SL/TP/TS/TIME/OPP)│
│         • LightweightCandleChart → series.setMarkers()          │
└─────────────────────────────────────────────────────────────────┘
```

---

#### 2.5.3 State Management Hierarchy (activePosition Lifecycle)

Faz 4'te eklenen `activePosition` state yönetimi, backtest motorunun **Katman 4 (State Gate Layer)** ve **Katman 5 (Trade Simulator)** arasında çalışan bir orkestrasyon mekanizmasıdır. Global state yoktur — `activePosition`, `runStrategyBacktest()`'in içinde bir closure değişkenidir.

##### State Transitions

```
                    ┌──────────────────────────────┐
                    │   activePosition = null      │ ← Başlangıç durumu
                    │   (sistem nakitte/beklemede) │
                    └──────────────┬───────────────┘
                                   │
                         evaluateRawSignal(i) → BUY/SELL
                         + Gate 2 (Pyramiding) PASS (activePosition null olduğu için)
                         + Gate 3 (Flat-Only)  PASS (activePosition null olduğu için)
                         + Gate 4 (Cooldown)   PASS
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   simulateTrade() → çalışır  │
                    │   Bar-bar SL/TP/Trailing/    │
                    │   Opposite/Time-Stop kontrol │
                    │   → SimulatedTrade döndürür   │
                    └──────────────┬───────────────┘
                                   │
                         activePosition = {
                           type: signal,        // 'BUY' | 'SELL'
                           entryIndex: i,       // giriş barı
                           exitIndex: simResult.exitIndex  // çıkış barı
                         }
                                   │
                                   ▼
                    Sonraki barlarda (i++ döngüsü):
                    ┌──────────────────────────────────────┐
                    │ GATE 1: i > activePosition.exitIndex? │
                    │   EVET → activePosition = null       │ ← Döngü başa döner
                    │   HAYIR → Gate 2 & 3 aktif kalır     │
                    └──────────────────────────────────────┘
```

##### Gate Öncelik Sıralaması (Execution Order)

Backtest ana döngüsünde (`runStrategyBacktest`), gate'ler şu sırayla ve öncelikle kontrol edilir:

| Sıra | Gate | Kontrol | Başarısızlıkta Aksiyon | Faz |
|------|------|---------|------------------------|-----|
| **0** | Position Cleanup | `i > activePosition.exitIndex` | `activePosition = null`, sonraki gate'lere geç | 4 |
| **1** | Signal Evaluation | `evaluateRawSignal(i)` | `null` ise bar atlanır | 3 |
| **2** | Pyramiding Prevention | `signal === activePosition.type` | `signal = null` (debug log'a yazılır) | 4 |
| **3** | Flat-Only Rule | `i <= exitIndex && signal !== activePosition.type` | `signal = null` (debug log'a yazılır) | 4 |
| **4** | Cooldown | `(i - lastSignalBar) < cd` | Bar atlanır (SELL bypass hariç) | 2 |
| **5** | Trade Simulation | `simulateTrade(...)` | İşlem her durumda `activePosition`'ı günceller | 2 |

##### Time-Stop Bypass'ın Hiyerarşideki Yeri

Time-Stop Bypass, Gate 5'in (Trade Simulation) **içinde**, en alt seviyede çalışır. `simulateTrade()` içindeki kontrol sırası:

```
simulateTrade() içinde (her bar için):
  ├── 1. Unrealized P&L güncellemesi (MFE/MAE/IntraDD tracking)
  ├── 2. Trailing stop güncellemesi (eğer useTrailingStop aktifse)
  ├── 3. Stop-Loss kontrolü       ← En yüksek öncelik: kaybı sınırla
  ├── 4. Take-Profit kontrolü     ← Kârı realize et
  ├── 5. Opposite signal kontrolü ← Trend değişimini tespit et (callback)
  └── 6. Time-Stop kontrolü       ← En düşük öncelik
        └── BYPASS: useTrailingStop && pnlPct > 0 → time-stop ATLANIR
```

Bu hiyerarşi, risk yönetiminin önceliğini yansıtır: **önce kaybı sınırla (SL), sonra kârı al (TP), sonra trend değişimini tespit et (opposite signal), en son süre limitini kontrol et (time-stop) — ama eğer trend güçlüyse ve kârdaysan süre limitini yok say (bypass).**

"SELL bypass" (Gate 4) ile "Time-Stop bypass" (Gate 5 içi) farklı mekanizmalardır:

| Bypass | Konum | Tetikleyici | Amaç |
|--------|-------|------------|------|
| **SELL Bypass** | Gate 4 (Cooldown) | `signal === 'SELL' && lastSignalType === 'BUY'` | Mevcut BUY pozisyonunu koruma amaçlı kapatmaya izin ver |
| **Time-Stop Bypass** | Gate 5 (simulateTrade içi) | `useTrailingStop && pnlPct > 0` | Kârdaki pozisyonun trend sonuna kadar tutunmasını sağla |

##### Debug Log Entegrasyonu

`config.debugLog` aktif edildiğinde, her bar için gate sonuçları `BacktestLogEntry[]` dizisine kaydedilir:

```typescript
// run-backtest.ts:907-922
if (!signal) {
    const parts: string[] = [];
    if (isSameDirectionAsActive) {
        parts.push('Blocked same-direction signal (pyramiding prevention)');
    } else if (isOppositeDirectionOnExitBar) {
        parts.push('Blocked entry on opposite exit bar (flat-only rule)');
    } else {
        if (requireCrossover && !anyFreshCross) parts.push('No fresh crossover');
        if (!cooldownOk) parts.push(`Cooldown active (${i - lastSignalBar}/${cd})`);
        if (indicatorSignals.length < 2) parts.push(`Only ${indicatorSignals.length} indicator(s) active`);
    }
    rejectionReason = parts.join('; ');
}
```

Bu log, `BacktestLogPanel` bileşeni tarafından görselleştirilir ve her bir sinyalin neden reddedildiğini bar bar izlemeye olanak tanır.

---

#### 2.5.4 Import/Export Zinciri (Dependency Graph)

Aşağıdaki grafik, sistemin kritik dosyaları arasındaki bağımlılık ilişkilerini gösterir. Oklar "import eder" anlamındadır.

```
app/(root)/ta/page.tsx (Server Component — entry point)
  │
  ├── import { computeIndicators, parseActiveIndicators, generateAllSignals }
  │     from '@/lib/ta'
  │     └── lib/ta/index.ts (barrel)
  │           ├── lib/ta/compute.ts (orchestrator)
  │           │     └── lib/indicators/*.ts (17 indikatör modülü)
  │           │           └── lib/indicators/_math.ts (SMA, EMA, SMMA, Dev)
  │           └── lib/ta/signals.ts (canlı sinyal paneli)
  │
  ├── import { runStrategyBacktest }
  │     from '@/lib/ta/strategy-optimizer/run-backtest'
  │     └── lib/ta/strategy-optimizer/run-backtest.ts
  │           ├── import { simulateTrade }
  │           │     from '../simulation/trade-simulator'
  │           │     └── lib/ta/simulation/trade-simulator.ts
  │           │           (pure function, hiçbir dış bağımlılığı yok)
  │           ├── import { classifyRegime }
  │           │     from '../regime-detector'
  │           │     └── lib/ta/regime-detector.ts
  │           ├── import { *Signal, signalToBBA, fuseAll, efficiencyRatio,
  │           │            computePSR, *Cross }
  │           │     from '../registry/signal-registry'
  │           │     └── lib/ta/registry/signal-registry.ts
  │           └── import { getDynamicCooldown, computeATR, PROFILE_CONFIGS }
  │                 (internal, same file)
  │
  ├── import { TAStrategiesButton, StrategyBacktestMonitor }
  │     from '@/components/...'
  │     └── Client Components (sadece tarayıcıda render edilir)
  │
  └── import { getCandlesForInterval }
        from '@/lib/actions/finnhub.actions'
        └── lib/actions/finnhub.actions.ts (delegating wrapper)
              └── lib/actions/finnhub/candles.ts (Finnhub REST API)

── Server Action Boundary (Client → Server) ──

StrategyBacktestMonitor (Client Component)
  │
  ├── import { runBacktestAction }
  │     from '@/lib/actions/backtest.actions'
  │     └── 'use server' directive
  │           └── lib/actions/backtest.actions.ts
  │                 ├── auth.api.getSession() → Better Auth
  │                 ├── getCandlesForInterval() → Finnhub
  │                 ├── computeIndicators() → indicator engine
  │                 ├── mapComputedToAllData() → data adapter
  │                 └── runStrategyBacktest() → backtest engine
  │
  └── import { optimizeStrategyAction }
        from '@/lib/actions/optimize-strategy.actions'
        └── 'use server' directive
              └── lib/actions/optimize-strategy.actions.ts
                    ├── auth.api.getSession() → Better Auth
                    ├── getCandlesForInterval() → Finnhub
                    ├── computeIndicators() → indicator engine
                    ├── mapComputedToAllData() → data adapter
                    └── optimizeStrategyParams() → brute-force optimizer
                          └── lib/ta/strategy-optimizer/optimize-params.ts
                                └── runStrategyBacktest() (her parametre için)

── Barrel Export Chain (lib/ta/strategy-optimizer.ts) ──

lib/ta/strategy-optimizer.ts (re-export wrapper)
  ├── re-exports from './strategy-optimizer/types'
  ├── re-exports from './strategy-optimizer/run-backtest'
  ├── re-exports from './strategy-optimizer/optimize-params'
  ├── re-exports from './strategy-optimizer/discover-strategy'
  └── re-exports from './registry/indicator-registry'
```

> **Mimari Not:** `runStrategyBacktest()` ve `simulateTrade()` fonksiyonları **pure function**'dır — hiçbir dış state'e bağımlı değildir, sadece parametrelerini okur ve sonuç döndürür. `activePosition` state'i, `runStrategyBacktest()`'in **içinde** bir closure değişkeni olarak tutulur — global state, module-level state veya React state yoktur. Bu sayede backtest motoru tamamen deterministic, side-effect-free ve birim test edilebilirdir.

---

## 3. Matematiksel ve Mantıksal Motor

### 3.1 Temel Matematik Altyapısı (`lib/indicators/_math.ts`)

Tüm indikatörlerin kullandığı merkezi matematik fonksiyonları:

| Fonksiyon | Formül | Açıklama |
|-----------|--------|----------|
| **createSMA** | Circular buffer, `sum / definedCount` | Pine Script uyumlu. **Faz 18 düzeltmesi:** `sum/period` → `sum/definedCount`. Warmup'taki undefined değerler artık ortalamayı zehirlemiyor. |
| **createEMA** | $EMA_t = V_t \cdot k + EMA_{t-1} \cdot (1-k)$, $k = 2/(period+1)$ | İki seed stratejisi: `'value'` (TradingView, MACD için) ve `'sma'` (standart) |
| **createSMMA** | $SMMA_t = (SMMA_{t-1} \cdot (period-1) + V_t) / period$ | Wilder's Smoothing. RSI, DMI, ADX için. |
| **createDev** | $\frac{1}{n}\sum_{i=t-n+1}^{t} \|V_i - SMA_t\|$ | Pine Script `ta.dev` uyumlu. CCI hesaplaması için. |

**Kaynak:** [lib/indicators/_math.ts](lib/indicators/_math.ts)

### 3.2 17 İndikatör — Güncel Hesaplama ve Sinyal Mantığı

> **Mimari Değişiklik (Faz 3):** Tüm `*Signal()` fonksiyonları **seviye tabanlıdan** (her bar BUY/SELL) **kesişim tabanlıya** (sadece crossover anında BUY/SELL, diğer barlarda `null`) geçirilmiştir. Bu değişiklik sinyal kalitesini artırırken toplam sinyal sayısını ~%80 azaltmıştır. `*Strength()` fonksiyonları canlı sinyal panelinde (`signals.ts`) görüntüleme amaçlı kullanılmaya devam eder.

| # | İndikatör | Eski Sinyal (Seviye Tabanlı) | Yeni Sinyal (Kesişim Tabanlı) | Kesişim Ekseni |
|---|-----------|------------------------------|-------------------------------|---------------|
| 1 | **RSI** | `rsi > rsiMa → BUY : SELL` | `prevRsi <= prevRsiMa && rsi > rsiMa → BUY` | RSI, MA'sını yukarı keser |
| 2 | **MACD** | `macd > signal → BUY : SELL` | `prevMacd <= prevSignal && macd > signal → BUY` | MACD, sinyal çizgisini yukarı keser |
| 3 | **CCI** | `cci > ma → BUY : SELL` | `prevCci <= prevMa && cci > ma → BUY` | CCI, MA'sını yukarı keser |
| 4 | **StochRSI** | `k > d → BUY : SELL` | `prevK <= prevD && k > d → BUY` | %K, %D'yi yukarı keser |
| 5 | **WaveTrend** | `wt1 > wt2 → BUY : SELL` | `prevWt1 <= prevWt2 && wt1 > wt2 → BUY` | WT1, WT2'yi yukarı keser |
| 6 | **DMI** | `plusDI > minusDI → BUY` | `prevPlus <= prevMinus && plus > minus → BUY` | +DI, -DI'yi yukarı keser |
| 7 | **SMI** | `smi > signal → BUY : SELL` | `prevSmi <= prevSig && smi > sig → BUY` | SMI, sinyal çizgisini keser |
| 8 | **AO** | Çoklu koşul (sıfır/artan/azalan) | `prevAo <= 0 && ao > 0 → BUY` | Sıfır çizgisi kesişimi |
| 9 | **MFI** | `cur > prev → BUY : SELL` (yön) | `prevMfi <= 50 && mfi > 50 → BUY` | 50 eşik kesişimi |
| 10 | **WPR** | `cur > prev → BUY : SELL` (yön) | `prevWpr >= -50 && wpr < -50 → BUY` | -50 eşik kesişimi |
| 11 | **DI** | `cur > 1.0 → BUY, cur < 1.0 → SELL` | `prevDi <= 1.0 && di > 1.0 → BUY` | 1.0 eşik kesişimi |
| 12 | **CMF** | `val > 0 → BUY : SELL` | `prevCmf <= 0 && cmf > 0 → BUY` | Sıfır çizgisi kesişimi |
| 13 | **A/D** | `cur > ma → BUY : SELL` | `prevAd <= prevMa && ad > ma → BUY` | AD, SMA'sını yukarı keser |
| 14 | **NetVol** | `cur > 0 → BUY : SELL` | `prevNv <= 0 && nv > 0 → BUY` | Sıfır çizgisi kesişimi |
| 15 | **MADR** | `cur > 0 → BUY : SELL` | `prevMadr <= 0 && madr > 0 → BUY` | Sıfır çizgisi kesişimi |
| 16 | **ALMA** | Fiyat-ALMA karşılaştırması | `prevC <= prevA && c > a → BUY` | Fiyat, ALMA'yı yukarı keser |
| 17 | **BB** | Bant konumu + fiyat | `prevC <= prevLower && c > lower → BUY` | Fiyat, alt bandı yukarı keser |

> **Not:** Tüm sinyal fonksiyonları artık `prev*` parametreleri alır. `prev*` değerleri `undefined` ise `null` döner (warmup koruması). `signals.ts`'teki `generateAllSignals()` ve `last-signal.ts`'teki `getLastSignal()` fonksiyonları buna göre güncellenmiştir (her indikatör için `>= 2` veri noktası şartı).

**Sinyal kaynak kodu:** [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts)

#### 3.2.1 Strength (Güç) Fonksiyonları

`*Strength()` fonksiyonları indikatör sinyalinin **gücünü** belirler. Backtest motoru (`calculateWinRate`) tarafından **kullanılmaz** — sadece canlı sinyal paneli (`signals.ts`) tarafından görüntüleme amaçlı kullanılır:

| İndikatör | STRONG_BUY Koşulu | STRONG_SELL Koşulu |
|-----------|------------------|-------------------|
| RSI | `rsi > rsiMa && rsi < 30` | `rsi < rsiMa && rsi > 70` |
| MACD | `macd > signal && hist > prevHist` | `macd < signal && hist < prevHist` |
| StochRSI | `k > d && k < 20` | `k < d && k > 80` |
| WaveTrend | `wt1 > wt2 && wt1 < -60` | `wt1 < wt2 && wt1 > 60` |
| DMI | `plus > minus && adx > 20` | `minus > plus && adx > 20` |
| MFI | `cur < 20` (eşik) | `cur > 80` (eşik) |
| WPR | `cur < -80` (eşik) | `cur > -20` (eşik) |
| DI | `cur > 1.0 && cur > prev` | `cur < 1.0 && cur < prev` |
| CMF | `val > 0.05` | `val < -0.05` |

### 3.3 Market Regime Sınıflandırması (`classifyRegime`)

**Dosya:** [lib/ta/regime-detector.ts](lib/ta/regime-detector.ts)

`classifyRegime()` fonksiyonu, bar `i` anında **sadece `i` ve öncesindeki verileri** okuyarak piyasa rejimini tespit eder. **Canlı sinyal için güvenlidir** (causal — geleceği okumaz).

#### Algoritma:
1. SMA(20) hesapla — kapanış fiyatı üzerinde
2. MA slope: 20-SMA'nın 10 bar önceki haline göre % değişimi
3. Volatilite oranı: currentATR / avgATR(20)
4. ADX yaklaşımı: 14-bar yönlü hareket oranı → 0-100 skalasında trend gücü

Sınıflandırma (causal, relaxed thresholds):
- `volRatio > 1.8` → VOLATILE
- `|maSlope| > 0.2` ve `adxApprox > 55` → TRENDING
    - `maSlope > 0` → UPTREND
    - `maSlope < 0` → DOWNTREND
- `|maSlope| < 0.15` ve `volRatio < 1.2` → RANGING
- Aksi halde → NEUTRAL

Hysteresis (fluttering önleme):
- Zayıf sinyal durumunda önceki rejim korunur.
- Volatile rejimler için hysteresis uygulanmaz.

#### `segmentRegimes()` — Analiz Amaçlı (Non-Causal)
Tüm fiyat serisini okuyarak (geleceği görerek) piyasa segmentlerine ayırır. **Canlı sinyalde ASLA kullanılamaz.** Sadece arşiv raporlaması ve analiz içindir. Zigzag/directional-change pivot tespiti + ATR tabanlı volatilite sınıflandırması kullanır.

### 3.4 Dempster-Shafer Theory (DST) Fusion

**Dosya:** [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts)

#### 3.4.1 Temel Kavramlar

- **BBA (Basic Belief Assignment):** Bir olaya atanan inanç kütlesi: `{ buy, sell, uncertainty }`
- **Conflict (Çatışma):** İki kaynak çeliştiğinde: `a.buy × b.sell + a.sell × b.buy`
- **Uncertainty (Belirsizlik):** Karar verilemeyen durumlar için ayrılan kütle.

#### 3.4.2 Dempster's Rule of Combination

$$combine(a, b) = \begin{cases} buy = \frac{a.buy \cdot b.buy + a.buy \cdot b.uncertainty + a.uncertainty \cdot b.buy}{1 - conflict} \\ sell = \frac{a.sell \cdot b.sell + a.sell \cdot b.uncertainty + a.uncertainty \cdot b.sell}{1 - conflict} \\ uncertainty = \frac{a.uncertainty \cdot b.uncertainty}{1 - conflict} \end{cases}$$

Eğer `conflict = 1` (tam çatışma) → `{ buy: 0, sell: 0, uncertainty: 1 }` (karar verilemez).

#### 3.4.3 Sinyal → BBA Dönüşümü (`signalToBBA`)

```
signalToBBA(signal, confidence=0.6, regime?):
  • Rejim adaptasyonu (uncertaintyBonus):
      - uptrend/downtrend: -0.1 (daha az belirsizlik, güçlü sinyal)
      - ranging/volatile:   +0.15 (daha fazla belirsizlik, zayıf sinyal)
  • adjustedConfidence = clamp(confidence + uncertaintyBonus, 0.1, 0.95)
  • BUY  → { buy: confidence, sell: 0, uncertainty: 1-confidence }
  • SELL → { buy: 0, sell: confidence, uncertainty: 1-confidence }
  • null → { buy: 0, sell: 0, uncertainty: 1 }
```

#### 3.4.4 Ticaret Sinyali Üretimi

```
fuseAll([bba₁, bba₂, ..., bbaₙ]):
  • İteratif pairwise dempsterCombine()
  • Dempster kuralı asosyatiftir → sıradan bağımsız

Karar:
  • fused.buy > TRADE_THRESHOLD && fused.buy > fused.sell → BUY
  • fused.sell > TRADE_THRESHOLD && fused.sell > fused.buy → SELL
  • Aksi halde → null (sinyal yok)
```

`TRADE_THRESHOLD` sinyal profiline göre değişir:
- **TrendFollower:** 0.25 (geniş spektrum, 200-350 trade)
- **SwingTrader:** 0.30 (orta eşik)
- **Aggressive:** 0.15 (düşük eşik, çok sinyal)

### 3.5 Kaufman Efficiency Ratio (ER)

**Dosya:** [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts)

$$ER = \frac{|close_t - close_{t-n}|}{\sum_{i=t-n+1}^{t} |close_i - close_{i-1}|}$$

- $ER \to 1$: Fiyat düz bir çizgide hareket ediyor (güçlü trend) → sinyal güveni yüksek.
- $ER \to 0$: Yüksek gürültü, net ilerleme yok → sinyal güveni düşük.

DST BBA'da **continuous multiplier** olarak kullanılır: trend-takipçisi indikatörlerin güvenini gürültülü piyasalarda düşürür.

### 3.6 Mutual Information (MI) — İndikatör-Fiyat İlişkisi

**Dosya:** [lib/ta/mutual-information.ts](lib/ta/mutual-information.ts)

$$I(X;Y) = H(X) + H(Y) - H(X,Y)$$

$$H(X) = -\sum_{i} p(x_i) \ln p(x_i) + \frac{m-1}{2N}$$

**Algoritma adımları:**
1. **Forward return hesapla:** $r_t = (close_{t+14} - close_t) / close_t$
2. **Return'leri 3 kategoride bin'le:** DOWN / FLAT / UP (equal-frequency, simetrik kuantiller)
3. **İndikatör değerlerini 10 kategoride bin'le:** Equal-frequency binning
4. **Joint histogram oluştur:** `counts[10 x 3]` matris
5. **MI hesapla:** $I(X;Y) = H(X) + H(Y) - H(X,Y)$
6. **Softmax normalize:** $P(i) = \exp((MI_i / \tau)^T) / \Sigma \exp$, $\tau = \max(MI)$

**Fallback koruması:** En az 4 indikatör non-zero prior ağırlık alır (`MIN_ACTIVE_INDICATORS = 4`). Düşük volatiliteli hisselerde tüm ağırlıklar sıfırlanırsa, top-4 zorla korunur.

### 3.7 Monte Carlo Tree Search (MCTS) — UCT Formülü

**Dosya:** [lib/ta/optimization/mcts-search.ts](lib/ta/optimization/mcts-search.ts)

#### 3.7.1 FlatMCTSTree — Sıfır GC Basınçlı Ağaç Yapısı

Tüm düğüm verileri **Int32Array / Float64Array** içinde saklanır — hot-loop sırasında hiçbir JS nesnesi oluşturulmaz. 2000 düğüm × 64 byte = **128KB (L2 cache'e sığar.)**

```
Düğüm Yapısı (64 byte):
┌──────────────────┬──────────┬─────────────────────────┐
│ Alan             │ Tip      │ Açıklama                │
├──────────────────┼──────────┼─────────────────────────┤
│ indicatorMask    │ Int32    │ 17-bit strateji maskesi │
│ parentIdx        │ Int32    │ -1 = root               │
│ childIdx         │ Int32    │ İlk çocuk, -1 = leaf    │
│ siblingIdx       │ Int32    │ Sonraki kardeş, -1 = son│
│ triedMask        │ Int32    │ Genişletilmiş aksiyonlar│
│ depth            │ Int32    │ 0..MAX_DEPTH (5)        │
│ visits           │ Float64  │ Ziyaret sayısı          │
│ wins             │ Float64  │ Kümülatif ödül          │
│ prior            │ Float64  │ MI-bazlı öncelik (0-1)  │
│ compositeScore   │ Float64  │ Cache'lenmiş en iyi skor│
└──────────────────┴──────────┴─────────────────────────┘
```

#### 3.7.2 UCT (Upper Confidence Bound for Trees)

$$UCT = \frac{wins}{visits} + C \cdot prior \cdot \sqrt{\frac{\ln(parentVisits)}{visits}}$$

- $C = \sqrt{2} \approx 1.414$ (exploration sabiti)
- $prior$: MI-bazlı öncelik ağırlığı — yüksek MI'lı indikatörler önce keşfedilir.
- Ziyaret edilmemiş düğümler `UCT = Infinity` döndürür (zorunlu keşif).

#### 3.7.3 MCTS Ana Döngüsü (100 simülasyon)

```
Her simülasyon:
  1. SELECTION:   Root'tan UCT ile leaf'e in
  2. EXPANSION:   MI-prior weighted yeni indikatör ekle
  3. SIMULATION:  runStrategyBacktest() → Composite Score hesapla
  4. BACKPROP:    Normalize win rate'i yukarı yay (0..1)

Composite Score:
  CS = WR_norm × (Sharpe + 1) × √PF × √signals
  WR_norm = max(winRate, 0) / 100
```

### 3.8 Composite Score (Strateji Sıralama Metriği)

**Dosya:** [lib/ta/optimization/mcts-search.ts](lib/ta/optimization/mcts-search.ts)

$$CS = \frac{\max(WR, 0)}{100} \times (\max(Sharpe, -1) + 1) \times \sqrt{\max(PF, 0)} \times \sqrt{\max(signals, 1)}$$

Dört boyutu dengeler:
- **WR (Win Rate):** Ham başarı oranı (birincil)
- **Sharpe:** Risk-ayarlı getiri (ikincil)
- **Profit Factor:** Ödül/risk oranı (üçüncül)
- **Signals:** İstatistiksel anlamlılık (düşük sinyalli stratejileri cezalandırır)

### 3.9 Triple Barrier Method (Fırsat Etiketleme)

**Dosya:** [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts)

Her bar için potansiyel giriş sinyali üç bariyerle değerlendirilir:

```
tripleBarrierLabel(candles, entryIndex, upperMult, lowerMult, maxBars, atrValues):
  • Upper Barrier: entryPrice + upperMult × ATR (TP, varsayılan: +2.0 ATR)
  • Lower Barrier: entryPrice - lowerMult × ATR (SL, varsayılan: -1.0 ATR)
  • Time Barrier:  maxBars (varsayılan: 20 bar)

  Bar bar ilerle:
    • High ≥ upperBarrier → label: 1 (POZİTİF fırsat)
    • Low  ≤ lowerBarrier → label: -1 (NEGATİF fırsat)
    • maxBars doldu      → label: 0 (NÖTR fırsat)
```

### 3.10 Probabilistic Sharpe Ratio (PSR)

**Dosya:** [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts)

Bailey & López de Prado (2012) formülü:

$$PSR = \Phi\left( \frac{(\hat{SR} - SR^*) \sqrt{T-1}}{\sqrt{1 - \hat{\gamma}_3 \cdot \hat{SR} + \frac{\hat{\gamma}_4 - 1}{4} \cdot \hat{SR}^2}} \right)$$

- $\Phi$: Standart normal CDF.
- $\hat{SR}$: Gözlemlenen Sharpe oranı.
- $SR^*$: Benchmark Sharpe.
- $T$: Bağımsız işlem sayısı.
- $\hat{\gamma}_3, \hat{\gamma}_4$: Çarpıklık ve basıklık.

### 3.11 Market Telemetry — Feature Engine

**Dosya:** [app/api/analysis/market-telemetry/route.ts](app/api/analysis/market-telemetry/route.ts)

Market Telemetry, **bir strateji motoru değil, Feature Engine (Özellik Motoru)** olarak çalışır.

Telemetry verileri, Deep Discovery (`deepDiscoveryJob`) pipeline'ına **Faz 1.5** olarak başarılı bir şekilde bağlanmıştır. Arka planda `indicatorConfidences` olarak DST fusion motoruna beslenir.

### 3.12 Transaction Cost Modeling (İşlem Maliyetleri)

Gerçekçi backtest sonuçları elde etmek için işlem maliyetleri strateji optimizasyon sürecine (Yol B) entegre edilmiştir.

- **Profil Yapılandırması:** Her strateji profili (`TrendFollower`, `SwingTrader`, vb.) `transactionCostPct` tanımlar. (Varsayılan %0.10: Giriş için %0.05 + Çıkış için %0.05).
- **Maliyet Düşülmesi:** `runStrategyBacktest()` sırasında simüle edilen her işlemin getirisinden `transactionCostPct` düşülür.

### 3.13 Negatif Fiyat Koruması (Faz 4)

**Dosyalar:** [lib/ta/simulation/trade-simulator.ts](lib/ta/simulation/trade-simulator.ts), [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts)

Yüzdelik getiri hesaplamalarında `Math.abs(entryPrice)` kullanılarak negatif fiyat senaryolarına (teorik ekstrem durumlar) karşı matematiksel güvenlik sağlanmıştır:

```
// trade-simulator.ts:125
const rawReturn = (exitPrice - entryPrice) / Math.abs(entryPrice);

// run-backtest.ts:942
rawReturn: (futurePrice - currentPrice) / Math.abs(currentPrice),
```

Bu, özellikle kaldıraçlı enstrümanlarda veya teorik negatif fiyat senaryolarında (örneğin petrol vadeli işlemleri 2020) işaret hatalarını önler.

---

## 4. Strateji Keşif ve Simülasyon Altyapısı

### 4.1 Algoritma Envanteri

| Algoritma | Yeni Konum | Amaç | Durum |
|-----------|------------|------|-------|
| **Dempster-Shafer Theory** | [signal-registry.ts](lib/ta/registry/signal-registry.ts) | Multi-indikatör soft-vote fusion | ✅ Aktif |
| **Monte Carlo Tree Search** | [mcts-search.ts](lib/ta/optimization/mcts-search.ts) | Kombinatoriyel strateji keşfi | ✅ Aktif |
| **Mutual Information** | [mutual-information.ts](lib/ta/mutual-information.ts) | İndikatör-fiyat ilişkisi ölçümü | ✅ Aktif |
| **Hyperband** | [hyperband-search.ts](lib/ta/optimization/hyperband-search.ts) | Multi-fidelity bracket evaluator | ✅ Aktif |
| **Differential Evolution** | [differential-evolution.ts](lib/ta/optimization/differential-evolution.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Bayesian Optimization (TPE)** | [bayesian-optimizer.ts](lib/ta/optimization/bayesian-optimizer.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Genetic Algorithm** | [ga-optimizer.ts](lib/ta/optimization/ga-optimizer.ts) | Joint indicator+param seçimi | ✅ Legacy |
| **Trade Simulator** | [trade-simulator.ts](lib/ta/simulation/trade-simulator.ts) | Path-aware SL/TP/trailing + Faz 4 kuralları | ✅ Aktif |
| **Portfolio Simulator** | [portfolio-simulator.ts](lib/ta/simulation/portfolio-simulator.ts) | Çoklu strateji portföy | ✅ Aktif |
| **Beta-Binomial Posterior** | [run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts) | Win rate güven aralığı | ✅ Aktif |
| **Fitness Sharing (Niching)** | [ga-optimizer.ts](lib/ta/optimization/ga-optimizer.ts) | GA popülasyon çeşitliliği | ✅ Aktif |
| **Diversity Ranker** | [diversity-ranker.ts](lib/ta/diversity-ranker.ts) | Strateji çeşitlilik sıralaması | ✅ Aktif |
| **Surrogate Optimizer** | [surrogate-optimizer.ts](lib/ta/optimization/surrogate-optimizer.ts) | Surrogate model optimizasyonu | ✅ Aktif |

### 4.2 Hyperband Multi-Fidelity Optimization

**Dosya:** [lib/ta/optimization/hyperband-search.ts](lib/ta/optimization/hyperband-search.ts)

**Kritik tasarım kuralı:** İndikatörler **her zaman TÜM seride hesaplanır.** Sadece DEĞERLENDİRME maskelenmiş alt kümelerde yapılır. Bu, path-dependent indikatörlerin (MACD, EMA, RSI) bütünlüğünü korur.

### 4.3 Trade Simülasyonu — Path-Aware

**Dosya:** [lib/ta/simulation/trade-simulator.ts](lib/ta/simulation/trade-simulator.ts)

```
simulateTrade(candles, entryIndex, signal, atrValues, riskConfig):
  entryPrice = candles[entryIndex].close
  stopDistance = currentATR × stopLossAtrMult
  tpDistance = stopDistance × takeProfitR

  Bar bar ilerle (max timeStopBars):
    1. High/Low ile SL kontrolü (veya trailing stop)
    2. High/Low ile TP kontrolü
    3. Opposite signal (callback ile)
    4. Time stop (max bar süresi) — Faz 4: kârda + trailing aktifken BYPASS
```

#### Risk Profilleri (`lib/ta/strategy-optimizer/run-backtest.ts`)

| Profil | SL (ATR×) | TP (R) | Trailing (ATR×) | Cooldown | Eşik |
|--------|----------|--------|-----------------|----------|------|
| **TrendFollower** | 3.0 | 4.0 | 2.5 | 5 | 0.25 |
| **SwingTrader** | 2.0 | 2.5 | 1.5 | 3 | 0.30 |
| **Aggressive** | 1.5 | 1.5 | 0.5 | 3 | 0.15 |
| **Balanced** | 2.0 | 2.0 | off | 5 | 0.40 |
| **Conservative** | 2.5 | 3.0 | off | 7 | 0.65 |

### 4.4 Dinamik Cooldown Mekanizması

Sinyal profiline göre adaptif cooldown hesaplanır:

```
getDynamicCooldown(atrValues, i, interval, profile):
  • Volatilite oranı: currentATR / avgATR(volatilityLookback)
  • Base cooldown: profile.baseCooldown
  • Cooldown = baseCooldown × (1 + γ × (volRatio - 1))
  • Clamp: [cooldownMin, cooldownMax]
```

### 4.5 İndikatör Keşif Havuzu

**Dosya:** [lib/ta/registry/indicator-registry.ts](lib/ta/registry/indicator-registry.ts)

Yeni bir indikatör eklendiğinde, `INDICATOR_TO_ALLDATA_FIELD` mapping'ine eklenmesi yeterlidir — `DISCOVERY_POOL` otomatik güncellenir.

### 4.6 Optimizasyon Sistemi (Tek İndikatör)

**Dosya:** [lib/ta/optimizer.ts](lib/ta/optimizer.ts)

```typescript
findBestParameter(indicatorName, candles, config):
  // Brute force: parametre aralığında HER DEĞERİ dene
  for (val = start; val <= end; val++):
    rawData = optimizer.compute(candles, val)
    formattedData = optimizer.formatData(rawData)
    result = calculateWinRate(indicatorName, candles, formattedData, config)
    if (result.winRate > bestWinRate): kaydet

  return { bestVal, bestWinRate }
```

**Optimize edilebilir parametreler (Faz 2 sonrası):**

| İndikatör | Parametre | Aralık | Sabitler |
|-----------|----------|--------|---------|
| RSI | `rsi_len` | [5, 40] | ma_len=14 |
| MACD | `macd_fast` | [5, 40] | slow=26, signal=9 (fast<slow guard) |
| StochRSI | `stoch_rsi_len` | [5, 40] | k=14, smoothK=3, smoothD=3 |
| WaveTrend | `wt_avg_len` | [5, 40] | ⚠️ Faz 3'te `wtChannelLen` ile swap edildi. Varsayılan: avgLen=21, channelLen=10 (eskiden avgLen=10, channelLen=21). `compute.ts` içinde argüman sırası da değişti. |
| DMI | `dmi_di_len` | [5, 40] | adx=14 |
| MFI | `mfi_period` | [5, 40] | — |
| SMI | `smi_long_len` | [5, 40] | short=5, signal=5 |
| CCI | `cci_len` | [5, 40] | ma=14 |
| WPR | `wpr_len` | [5, 40] | — |
| DI | `di_len` | [5, 40] | — |
| CMF | `cmf_len` | [5, 40] | — |
| A/D | `ad_len` | [5, 40] | Dual Series (`ad` ve `ma` SMA) |
| MADR | `madr_len` | [5, 40] | — |
| ALMA | `alma_len` | [5, 40] | offset=0.85, sigma=6 |
| BOLLINGER | `bb_len` | [5, 40] | stdDev=2 |

---

## 5. Trade Simulator Motoru — Faz 4 Mantıksal Güncellemeleri

Bu bölüm, Faz 4 kapsamında Trade Simulator motoruna eklenen dört kritik mantıksal kuralı belgeler. Bu güncellemeler, backtest motorunun gerçek bir trader gibi davranmasını sağlayarak aşırı işlem (overtrading), testere piyasası (whipsaw) ve erken çıkış (premature exit) sorunlarını çözer.

### 5.1 Pyramiding Prevention (Aşırı İşlem Engelleme)

**Dosya:** [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts) — satır 737-847

**Problem:** Eski sistemde, içeride aktif bir pozisyon varken aynı yönde gelen yeni sinyaller filtrelenmiyordu. Bu, aynı trendde üst üste pozisyon açılmasına (pyramiding) ve risk yönetiminin bozulmasına yol açıyordu.

**Çözüm:** `activePosition` state değişkeni eklendi:

```typescript
// run-backtest.ts:737-741
let activePosition: {
    type: 'BUY' | 'SELL';
    entryIndex: number;
    exitIndex: number;
} | null = null;
```

**Çalışma Mantığı:**
1. Bir pozisyon açıldığında `activePosition` set edilir (`entryIndex` ve `exitIndex` ile birlikte).
2. Her yeni bar'da, eğer aktif pozisyonun çıkış indeksi geçildiyse `activePosition` temizlenir (satır 828-830).
3. Yeni sinyal değerlendirilirken:
   - `isSameDirectionAsActive`: Aktif pozisyonla aynı yönde sinyal → **ENGELLENİR** (satır 841-847)
   - Bu, pyramiding'i tamamen önler — içeride pozisyon varken aynı yönde ek işlem açılamaz.

```
AKIŞ:
  Bar 50: BUY sinyali → Pozisyon AÇ (activePosition = { type: 'BUY', entryIndex: 50, exitIndex: 65 })
  Bar 55: BUY sinyali → ENGELLENDİ (Pyramiding Prevention: activePosition.type === 'BUY')
  Bar 60: SELL sinyali → ENGELLENDİ (Flat-Only kuralı — bkz. Bölüm 5.2)
  Bar 65: Pozisyon time-stop ile kapandı → activePosition = null
  Bar 68: BUY sinyali → Pozisyon AÇ (yeni pozisyon)
```

### 5.2 Flat-Only Kuralı (Testere Koruması)

**Dosya:** [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts) — satır 842-847

**Problem:** Bir pozisyon ters sinyalle kapandığında (opposite signal), aynı bar'da anında ters yönlü yeni bir pozisyon açılabiliyordu. Bu, özellikle testere (whipsaw) piyasalarında art arda zarar eden işlemlere yol açıyordu.

**Çözüm:** `isOppositeDirectionOnExitBar` kontrolü eklendi:

```typescript
// run-backtest.ts:842-847
const isOppositeDirectionOnExitBar =
    activePosition !== null &&
    i <= activePosition.exitIndex &&
    signal !== activePosition.type;

// Block same direction (pyramiding prevention) and
// opposite direction entry on exit bar (flat-only rule)
if (isSameDirectionAsActive || isOppositeDirectionOnExitBar) {
    signal = null;
}
```

**Çalışma Mantığı:**
- Bir pozisyon opposite signal ile kapatıldığında, çıkış bar'ından itibaren `exitIndex`'e kadar olan barlarda ters yönlü giriş sinyalleri engellenir.
- Sistem tamamen nakde (flat) geçer ve bir sonraki fırsat için bekler.
- `i > activePosition.exitIndex` olduğunda `activePosition` temizlenir ve yeni sinyaller değerlendirilmeye başlar.

### 5.3 Time-Stop Bypass — Trend Rider (Trende Tutunma)

**Dosya:** [lib/ta/simulation/trade-simulator.ts](lib/ta/simulation/trade-simulator.ts) — satır 223-228

**Problem:** Time-stop mekanizması, pozisyon kârda olsa ve trend devam etse bile belirli bir bar sayısı sonunda işlemi zorla kapatıyordu. Bu, güçlü trendlerde erken çıkışa ve potansiyel kârın büyük kısmının kaçırılmasına neden oluyordu.

**Çözüm:** Time-stop kontrolüne koşullu bypass eklendi:

```typescript
// trade-simulator.ts:223-228
// Time stop check (acts like lookForward/forced exit)
if (i >= entryIndex + riskConfig.timeStopBars) {
    const isTrailingStopActiveAndInProfit =
        riskConfig.useTrailingStop && pnlPct > 0;
    if (!isTrailingStopActiveAndInProfit) {
        return buildResult(i, 'time_stop');
    }
}
```

**Çalışma Mantığı:**
1. Time-stop süresi dolduğunda (`i >= entryIndex + timeStopBars`), sistem iki koşulu kontrol eder:
   - **Trailing stop aktif mi?** (`useTrailingStop === true`)
   - **Pozisyon kârda mı?** (`pnlPct > 0`)
2. Her iki koşul da sağlanıyorsa → Time-stop **BYPASS** edilir, işlem devam eder.
3. Pozisyon, trailing stop seviyesine gelene veya opposite signal oluşana kadar trende tutunur.
4. Koşullardan biri sağlanmıyorsa (trailing yok veya pozisyon zararda) → Time-stop normal şekilde çalışır.

**Hangi profillerde aktif:**
- ✅ TrendFollower (useTrailingStop: true)
- ✅ SwingTrader (useTrailingStop: true)
- ✅ Aggressive (useTrailingStop: true)
- ❌ Balanced (useTrailingStop: false)
- ❌ Conservative (useTrailingStop: false)

### 5.4 Negatif Fiyat Koruması (Matematiksel Güvenlik)

**Dosyalar:** [lib/ta/simulation/trade-simulator.ts:125](lib/ta/simulation/trade-simulator.ts#L125), [lib/ta/strategy-optimizer/run-backtest.ts:942](lib/ta/strategy-optimizer/run-backtest.ts#L942)

Yüzdelik getiri hesaplamaları `Math.abs(entryPrice)` ile korunmuştur:

```typescript
// trade-simulator.ts:125
const rawReturn = (exitPrice - entryPrice) / Math.abs(entryPrice);
const realizedReturnPct = isBuy ? rawReturn * 100 : -rawReturn * 100;

// run-backtest.ts:942
rawReturn: (futurePrice - currentPrice) / Math.abs(currentPrice),
```

Bu koruma, teorik olarak negatif fiyat senaryolarında (petrol vadeli işlemleri Nisan 2020 gibi) işaret hatalarını önler. Normal şartlarda (pozitif fiyatlar) `Math.abs()` bir değişiklik yapmaz — performans etkisi sıfırdır.

### 5.5 Faz 4 Backtest Motoru Özet Akışı

```
Her bar (i = startIndex → endIndex):
  │
  ├── 1. activePosition kontrolü
  │     • i > exitIndex ise → activePosition = null (pozisyon kapandı)
  │
  ├── 2. evaluateRawSignal(i) → ham sinyal (DST fusion / majority vote)
  │
  ├── 3. Pyramiding Prevention
  │     • signal === activePosition.type → ENGELLE (aynı yönde ek işlem yok)
  │
  ├── 4. Flat-Only Kuralı
  │     • i <= exitIndex && signal !== activePosition.type → ENGELLE (ters dönüş yok)
  │
  ├── 5. Cooldown kontrolü (adaptif)
  │
  ├── 6. simulateTrade() → Bar-bar simülasyon
  │     ├── SL kontrolü (fixed + trailing)
  │     ├── TP kontrolü
  │     ├── Opposite signal kontrolü
  │     └── Time-stop kontrolü → BYPASS (eğer trailing aktif + kârda)
  │
  └── 7. activePosition güncellemesi
        • type, entryIndex, exitIndex kaydedilir
```

---

## 6. Güncel UI ve UX Durumu

### 6.1 Sayfa Haritası

| Rota | Sayfa | Açıklama |
|------|-------|----------|
| `/` | [app/(root)/page.tsx](app/(root)/page.tsx) | Ana dashboard |
| `/ta` | [app/(root)/ta/page.tsx](app/(root)/ta/page.tsx) | Teknik Analiz sayfası |
| `/ai` | [app/(root)/ai/page.tsx](app/(root)/ai/page.tsx) | AI Chat sayfası |
| `/portfolio` | [app/(root)/portfolio/page.tsx](app/(root)/portfolio/page.tsx) | Sanal portföy |
| `/watchlist` | [app/(root)/watchlist/page.tsx](app/(root)/watchlist/page.tsx) | İzleme listesi |
| `/archive` | [app/(root)/archive/page.tsx](app/(root)/archive/page.tsx) | Arşiv / raporlar |
| `/stocks/[symbol]` | [app/(root)/stocks/[symbol]/page.tsx](app/(root)/stocks/%5Bsymbol%5D/page.tsx) | Hisse detay sayfası |

### 6.2 TA Sayfası Bileşen Yapısı (Modüler)

Bileşenler artık amaca yönelik alt klasörler altında gruplanmıştır:

#### 6.2.1 `components/panels/` (Dashboard ve Monitör Panelleri)
- **BacktestMonitor:** Tek indikatör backtest sonuçları + "Diagnostic Optimization" butonu. Faz 4: CSV export ve `scroll: false` router.push.
- **StrategyBacktestMonitor:** Strateji backtest sonuçları. Faz 4: CSV export, Popover optimized settings, Hybrid Profit Factor badge.
- **CustomStrategyPanel:** Kullanıcı strateji oluşturma arayüzü.
- **CustomStrategyModal:** Strateji kaydetme modalı.
- **StrategyDiscoveryDialog:** Keşif başlatma dialog'u.

#### 6.2.2 `components/ta/common/` (Paylaşılan UI)
- **StockLogo:** Şirket/Hisse logolarını SVG veya API üzerinden gösterir.
- **TAGlassDialog:** Arayüz için premium cam efekti (glassmorphism) sunan dialog şablonu.

#### 6.2.3 `components/ta/controls/` (Kullanıcı Kontrolleri)
- **TASearch:** Hisse sembolü arama.
- **TAIntervalButton:** Timeframe seçici (1d, 4h).
- **TAIndicatorsButton:** İndikatör seçici panel.
- **TAStrategiesButton:** Strateji seçici modal. Faz 4: `max-h-[60vh]` kaydırılabilir içerik + sabit footer.
- **MarketTelemetryButton:** Telemetry panelini açan tetikleyici buton.
- **ChartOverlayToggle:** Grafik üzerindeki overlay indikatörlerin (BB, ALMA) görünürlüğünü açıp kapatan göz ikonlu toggle.

#### 6.2.4 `components/ta/discovery/` (Keşif ve Simülasyon Grafikleri)
- **DeepDiscoveryProgress:** Keşif iş ilerleme çubuğu.
- **DeepDiscoveryResults:** Keşif sonuçları.
- **BacktestLogPanel:** Bar-bar debug log izleme alanı.
- **RegimeAccuracyTable:** Rejim bazlı doğruluk tablosu.
- **PortfolioSimChart:** Portföy simülasyon grafiği.

#### 6.2.5 `components/ta/panels/` (Yan Paneller)
- **IndicatorSection:** İndikatör panel grubu.
- **MarketTelemetryPanel:** Rejim analizi paneli.
- **TAIndicatorSettings:** İndikatör parametre ayarları.
- **TATimeframes:** Timeframe seçici.
- **TADataDepth:** Veri derinliği paneli.
- **CandleChartSection:** Candle chart + overlay toggle state'ini yöneten client wrapper.

#### 6.2.6 `components/strategies/` (Strateji Seçici ve CRUD Modülleri)
Bileşen monolitinden ayrıştırılan ve durum yönetimi modüler hale getirilen alt bileşenler:
- **BuiltInStrategiesSection:** Hazır stratejileri listeler.
- **MyStrategiesSection:** Kullanıcının kendi kaydettiği stratejileri gösterir.
- **DiscoveredStrategiesSection:** Keşif motorundan çıkan stratejileri listeler.
- **SavedStrategiesList:** Strateji kaydetme listesi.
- **IndicatorSelector:** Manuel strateji için indikatör seçme paneli.
- **DeleteConfirmDialog:** Strateji silme onay modalı.
- **SortButton:** Sıralama seçenekleri butonu.
- **StrategyActionButtons:** Aksiyon butonları.
- **hooks/useStrategyActions:** Pinleme, silme, kaydetme işlemleri için state hook'u.
- **hooks/useStrategyURL:** URL parametreleri ile strateji senkronizasyon hook'u.

### 6.3 AI Chat Bileşenleri

| Bileşen | Dosya | İşlev |
|---------|-------|-------|
| **ChatArea** | [components/ai/ChatArea.tsx](components/ai/ChatArea.tsx) | Ana chat arayüzü |
| **ModelSelector** | [components/ai/ModelSelector.tsx](components/ai/ModelSelector.tsx) | AI model/provider seçici |
| **GenerativeUI** | [components/ai/GenerativeUI.tsx](components/ai/GenerativeUI.tsx) | AI araç çağrısı sonuç render |

### 6.4 Canlı Sinyal Paneli (`signals.ts`)

**Dosya:** [lib/ta/signals.ts](lib/ta/signals.ts)

`generateAllSignals()` fonksiyonu, her aktif indikatörün **anlık durumunu** gösterir:
- Her indikatör için BUY/SELL/NEUTRAL + güç seviyesi (STRONG/WEAK).
- Tüm indikatörler için `>= 2` veri noktası ve `prev*` değerleri şarttır (kesişim tabanlı sinyal mimarisi).
- DST fusion içermez — her indikatör bağımsız değerlendirilir.

`extractTradeMarkers()` fonksiyonu: Tüm barları tarayıp aktif indikatörlerin kesişim noktalarını `TradeMarker[]` formatında döndürür. **Not:** Bu fonksiyon bireysel indikatör kesişimleri içindir. Strateji bazlı trade marker'lar için `runStrategyBacktest()` sonucu kullanılır.

### 6.5 Strateji Trade Marker'ları (Grafik Üzerinde Al/Sat Gösterimi)

Strateji backtest sonucu (`runStrategyBacktest().history`) fiyat grafiği üzerinde görsel oklar olarak gösterilir:

- **BUY:** Yeşil `▲` ok — bar altında (`belowBar`)
- **SELL:** Kırmızı `▼` ok — bar üstünde (`aboveBar`)
- **Veri akışı:** `page.tsx` (server) → `runStrategyBacktest()` → `TradeMarker[]` → `CandleChartSection` → `LightweightCandleChart` → `series.setMarkers()`
- **Kapsam:** `strategy=rsi_cci_wt` veya `strategy=temp&ind=...` parametreleriyle aktif edilen stratejiler
- **Mekanizma:** `series.setMarkers()` API'si, candle pattern marker'ları ile birleştirilir

### 6.6 Overlay İndikatör Toggle (Grafik Üzerinde Aç/Kapat)

Fiyat grafiği üzerine çizilen overlay indikatörlerin (Bollinger Bands, ALMA) görünürlüğü:
- **Toggle butonları:** Grafiğin sol üst köşesinde göz ikonlu (Eye/EyeOff) butonlar
- **Teknik:** `series.applyOptions({ visible: boolean })` — seri bellekte kalır, chart yeniden oluşturulmaz
- **State:** `CandleChartSection` client wrapper'ında `useState` ile yönetilir
- **Hesaplama:** Arkada devam eder, sadece görsel çizim gizlenir

---

## 7. UI/UX Terminal İyileştirmeleri — Faz 4

Bu bölüm, Faz 4 kapsamında kullanıcı arayüzüne eklenen beş kritik terminal iyileştirmesini belgeler. Bu iyileştirmeler, platformun profesyonel bir trading terminali gibi davranmasını sağlar.

### 7.1 CSV Trade History Export (Veri Dışa Aktarımı)

**Dosyalar:** [components/panels/StrategyBacktestMonitor.tsx](components/panels/StrategyBacktestMonitor.tsx) (satır 296-323), [components/panels/BacktestMonitor.tsx](components/panels/BacktestMonitor.tsx) (satır 87-113)

**Amaç:** Kullanıcıların işlem geçmişlerini detaylı bir şekilde Excel/Google Sheets'e aktarabilmesi ve indirilen dosyalarda işlem yapılan hisse, zaman dilimi ve strateji/indikatör bilgilerinin başlık olarak yer alması.

**Teknik Uygulama:**
- Tamamen **client-side, saf JavaScript** tabanlıdır — hiçbir sunucu isteği yapılmaz.
- İndirilen CSV dosyasının en üstüne (sütun başlıklarından hemen önceye), Excel ve diğer programlarda dosyanın kimliğini/bağlamını kolayca görebilmek adına **4 satırlık bir 'Metadata Header' (Bilgi Başlığı)** ve ardından 1 satır boşluk eklenir:
  ```
  Symbol: <SEMBOL>
  Timeframe: <ZAMAN DİLİMİ>
  Strategy/Indicator: <STRATEJİ veya İNDİKATÖR ADI>
  Generated: <OLUŞTURULMA TARİHİ>
  (boş satır)
  ```
- `StrategyBacktestMonitor` tarafında bu değerler bileşen props'ları (`symbol` ve `interval`) ile hesaplanan strateji adı üzerinden; `BacktestMonitor` tarafında ise URL parametreleri (`useSearchParams()` üzerinden `symbol` ve `currentInterval`) ve `indicatorName` üzerinden asenkron olarak çekilir.
- `Blob` API ve `URL.createObjectURL()` kullanılarak CSV dosyası oluşturulur.
- Geçici bir `<a>` elementi oluşturulup `click()` tetiklenir, ardından DOM'dan temizlenir.

**StrategyBacktestMonitor CSV Kolonları:**
| Kolon | İçerik |
|-------|--------|
| Date | İşlem tarihi (Unix timestamp → lokale tarih) |
| Signal | BUY / SELL |
| Entry Price | Giriş fiyatı (2 ondalık) |
| Exit Price | Çıkış fiyatı (2 ondalık) |
| Bars Held | Pozisyonda kalınan bar sayısı |
| Exit Reason | stop_loss / take_profit / trailing_stop / time_stop / opposite_signal |
| Outcome | HIT / MISS |

**BacktestMonitor CSV Kolonları:**
| Kolon | İçerik |
|-------|--------|
| Date | İşlem tarihi |
| Signal | BUY / SELL |
| Price | Giriş fiyatı |
| Target | Hedef fiyat (lookForward sonrası) |
| Result | HIT / MISS |

**Dosya adlandırma:**
- Strateji: `strategy_history_{symbol}_{strategyName}.csv`
- Diagnostik: `{indicatorName}_diagnostic_history.csv`

### 7.2 Scroll Zıplama Çözümü (`scroll: false`)

**Dosya:** [components/panels/BacktestMonitor.tsx](components/panels/BacktestMonitor.tsx) (satır 78, 151)

**Problem:** İndikatör panellerindeki "Diagnostic Optimize" ve "Reset" butonları, `router.push` ile URL parametrelerini güncellerken sayfanın en tepeye fırlamasına (scroll jump) neden oluyordu.

**Çözüm:** Tüm `router.push` çağrılarına `{ scroll: false }` seçeneği eklendi:

```typescript
// BacktestMonitor.tsx:78 — Optimize butonu
router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });

// BacktestMonitor.tsx:151 — Reset butonu
router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
```

Bu, Next.js App Router'ın varsayılan scroll-to-top davranışını devre dışı bırakır. Kullanıcı çalıştığı bölgede kalır, sayfa konumu korunur.

### 7.3 Popover Parameters (Optimized Settings)

**Dosya:** [components/panels/StrategyBacktestMonitor.tsx](components/panels/StrategyBacktestMonitor.tsx) (satır 390-411)

**Eski Davranış:** Optimize edilmiş parametreler, CSS tooltip ile hover durumunda gösteriliyordu. Bu, özellikle çok parametreli stratejilerde sayfayı taşıran ve okunması zor bir deneyim sunuyordu.

**Yeni Davranış:** Shadcn UI `Popover` bileşeni ile değiştirildi:

```tsx
<Popover>
    <PopoverTrigger asChild>
        <button className="...amber-500/10...">
            <Zap className="w-3 h-3 animate-pulse" />
            <span>Optimized Settings</span>
        </button>
    </PopoverTrigger>
    <PopoverContent className="w-60 bg-gray-950 border-gray-800 backdrop-blur-md">
        {/* Parametre listesi */}
    </PopoverContent>
</Popover>
```

**Özellikler:**
- **Glassmorphism:** `backdrop-blur-md` ile premium cam efekti
- **Scrollbar:** `max-h-48 overflow-y-auto scrollbar-thin` ile uzun parametre listeleri kaydırılabilir
- **Görsel Hiyerarşi:** Başlık (amber-300), parametre adı (gray-400), değer (amber-400 bold)
- **Tetkik:** Sarı şimşek ikonlu buton, `animate-pulse` ile dikkat çeker

### 7.4 Hybrid Profit Factor Badge

**Dosya:** [components/panels/StrategyBacktestMonitor.tsx](components/panels/StrategyBacktestMonitor.tsx) (satır 358-382)

**Amaç:** Win Rate'in yanında, sistemin gerçek kârlılığını tek bir bakışta gösteren dinamik renkli bir rozet.

**Teknik Uygulama:**

```tsx
{stats.profitFactor !== undefined && stats.profitFactor > 0 && (() => {
    const pf = stats.profitFactor;
    let pfColor = "bg-red-500/10 text-red-400 border-red-500/20";      // PF < 1.0
    if (pf >= 1.5) pfColor = "bg-emerald-500/10 text-emerald-400 ...";  // PF >= 1.5
    else if (pf >= 1.0) pfColor = "bg-amber-500/10 text-amber-400 ..."; // PF >= 1.0

    const rrRatio = stats.avgWin && stats.avgLoss && stats.avgLoss !== 0
        ? (stats.avgWin / stats.avgLoss).toFixed(1) : "1.0";
    const returnStr = stats.totalReturn !== undefined
        ? `${stats.totalReturn > 0 ? '+' : ''}${(stats.totalReturn * 100).toFixed(1)}%`
        : 'N/A';

    const titleText = `Total Return: ${returnStr} | R/R: 1:${rrRatio}`;

    return (
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border cursor-help", pfColor)}
              title={titleText}>
            PF: {pf.toFixed(2)}
        </span>
    );
})()}
```

**Renk Kodlaması:**
| Profit Factor | Renk | Anlam |
|---------------|------|-------|
| ≥ 1.50 | 🟢 Yeşil (emerald) | Güçlü kârlılık — her 1 birim risk için 1.5+ birim getiri |
| 1.00 – 1.49 | 🟡 Sarı (amber) | Marjinal kârlılık — başa baş noktasına yakın |
| < 1.00 | 🔴 Kırmızı (red) | Zarar — risk, getiriden fazla |

**Hover Detayı (title attribute):**
- **Total Return:** Kümülatif yüzdelik getiri (pozitif/negatif işaretli)
- **R/R Ratio:** Ortalama kazanç / ortalama kayıp oranı

### 7.5 Strategy Modal Scrolling & Sticky Footer Layout

**Dosya:** [components/ta/controls/TAStrategiesButton.tsx](components/ta/controls/TAStrategiesButton.tsx), [MyStrategiesSection.tsx](components/strategies/components/MyStrategiesSection.tsx), [DiscoveredStrategiesSection.tsx](components/strategies/components/DiscoveredStrategiesSection.tsx)

**Problem:** Strateji listesi uzadığında iç içe geçmiş (double-nested) scrollbar'lar çıkıyor, tarayıcının kalın ve çirkin varsayılan scrollbar'ları premium tasarımı bozuyor ve "Discover Strategy" / "Create Strategy" aksiyon butonları kaydırıldığında görünmez oluyordu.

**Çözüm:** Temiz bir yerleşim ve tek seviyeli scroll yapısı kuruldu:

1. **Aksiyon Butonlarının Yapışkan Yapılması (Sticky Footer):**
   `StrategyActionButtons` bileşeni, modal gövdesinin dışına taşınarak `TAGlassDialog` bileşeninin `footer` prop'una eklendi. Böylece hem strateji yönetimi butonları (Discover, Create) hem de seçilen stratejiyi uygulama butonları (Apply, Clear) modalın en altında kalıcı olarak sabitlendi.

2. **İç İçe Geçen Scrollbar'ların Kaldırılması:**
   Dışarıdaki `max-h-[60vh] overflow-y-auto` scroll sarmalayıcısı kaldırıldı. Bunun yerine strateji listelerinin kendileri (`My Strategies` ve `Discovered Strategies` bölümleri) `max-h-[240px] overflow-y-auto` ile sınırlandırıldı. Bu sayede listeler yaklaşık 4-5 strateji elemanına ulaştığında kendi içlerinde bağımsız olarak kaydırılır, tüm modal taşmaz.

3. **Premium Scrollbar Sınıfı (`.premium-scrollbar`):**
   `app/globals.css` dosyasında, koyu tema cam efektiyle tam uyumlu, ince (6px), hover durumunda hafif mor/mor-gri parlayan premium bir webkit/firefox scrollbar sınıfı tanımlandı ve tüm dialog gövdeleri ile strateji listelerine uygulandı:
   ```css
   .premium-scrollbar {
       scrollbar-width: thin;
       scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
   }
   /* webkit scrollbar kuralları... */
   ```

Bu yapı sayesinde modalın tüm yüksekliği kontrollü kalır, butonlar her zaman görünürdür ve arayüz premium dark-theme çizgisine tamamen kavuşmuştur.

---

## 8. Gerçekçi Yol Haritası (Next Steps)

### 8.1 Öncelik Sıralaması

| # | Görev | Öncelik | Efor | Bağımlılık |
|---|-------|---------|------|-----------|
| 1 | **Walk-Forward Validation Pipeline** | 🟠 Orta | 3-4 gün | Yok |
| 2 | **Dinamik Çıkış Stratejileri (Parabolic SAR, Chandelier Exit)** | 🟠 Orta | 2-3 gün | Faz 4 altyapısı hazır |
| 3 | **Çoklu Zaman Dilimi (MTF) Filtreleri** | 🔴 Yüksek | 4-5 gün | Test altyapısı |
| 4 | **Feature Redundancy Filtreleri** | 🟠 Orta | 2-3 gün | MI altyapısı var |
| 5 | **Haber Duygu Analizi → Strateji Sinyali** | 🟡 Düşük | 4-5 gün | AI entegrasyonu |

---

## 9. Gelecek Vizyonu ve İleri Düzey Geliştirme Önerileri

### 9.1 Çoklu Zaman Dilimi (Multi-Timeframe - MTF) Analizi Filtreleri
DST (Dempster-Shafer) sinyal birleştirme motoruna üst zaman dilimi (higher timeframe) filtreleri eklemek. Örneğin; Günlük (1d) grafikte MACD trendi negatifken, 4 Saatlik (4h) grafikteki "Al" sinyallerini reddetmek.

### 9.2 Dinamik Çıkış Stratejileri (Gelişmiş Trailing Stop)
Mevcut statik ATR tabanlı Stop-Loss ve Take-Profit seviyelerine ek olarak, trend takibi yapan dinamik çıkış mekanizmaları eklemek (*Chandelier Exit*, *Parabolic SAR*). Faz 4'te eklenen time-stop bypass altyapısı, bu yeni çıkış stratejileri için hazır bir temel oluşturmaktadır.

---

## Ek A: Kritik Dosya Referansları ve Yeni Dosya Hiyerarşisi

Aşağıdaki tablo, **Sistem Refaktörü (Faz 2)** sonrası dosya konumlarını gösterir:

| Eski Konum (Legacy Path) | Yeni Konum (New Refactored Path) | Açıklama |
|-------------------------|--------------------------------|----------|
| `lib/ta/strategy-optimizer.ts` | [lib/ta/strategy-optimizer.ts](lib/ta/strategy-optimizer.ts) | Delegating wrapper (Giriş) |
| (Monolit) | [lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts) | Backtest simülasyon motoru (Faz 4 güncel) |
| (Monolit) | [lib/ta/strategy-optimizer/optimize-params.ts](lib/ta/strategy-optimizer/optimize-params.ts) | Parametre optimizasyon modülü |
| (Monolit) | [lib/ta/strategy-optimizer/discover-strategy.ts](lib/ta/strategy-optimizer/discover-strategy.ts) | MCTS strateji keşif modülü |
| (Monolit) | [lib/ta/strategy-optimizer/types.ts](lib/ta/strategy-optimizer/types.ts) | Tip tanımları |
| `lib/ta/backtest.ts` | [lib/ta/simulation/backtest.ts](lib/ta/simulation/backtest.ts) | Yol A backtest motoru |
| `lib/ta/trade-simulator.ts` | [lib/ta/simulation/trade-simulator.ts](lib/ta/simulation/trade-simulator.ts) | Yol B işlem simülatörü (Faz 4 güncel) |
| `lib/ta/portfolio-simulator.ts`| [lib/ta/simulation/portfolio-simulator.ts](lib/ta/simulation/portfolio-simulator.ts) | Portföy simülatörü |
| `lib/ta/cross-validator.ts` | [lib/ta/simulation/cross-validator.ts](lib/ta/simulation/cross-validator.ts) | Validasyon modülü |
| `lib/ta/mcts-search.ts` | [lib/ta/optimization/mcts-search.ts](lib/ta/optimization/mcts-search.ts) | MCTS Arama algoritması |
| `lib/ta/hyperband-search.ts` | [lib/ta/optimization/hyperband-search.ts](lib/ta/optimization/hyperband-search.ts) | Hyperband Downsampling |
| `lib/ta/differential-evolution.ts` | [lib/ta/optimization/differential-evolution.ts](lib/ta/optimization/differential-evolution.ts) | DE algoritması |
| `lib/ta/ga-optimizer.ts` | [lib/ta/optimization/ga-optimizer.ts](lib/ta/optimization/ga-optimizer.ts) | GA algoritması |
| `lib/ta/signal-registry.ts` | [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts) | Sinyal kuralları ve DST |
| `lib/ta/indicator-registry.ts` | [lib/ta/registry/indicator-registry.ts](lib/ta/registry/indicator-registry.ts) | İndikatör tescil havuzu |
| `lib/actions/finnhub.actions.ts` | [lib/actions/finnhub.actions.ts](lib/actions/finnhub.actions.ts) | Delegating wrapper (Server actions) |
| (Monolit) | [lib/actions/finnhub/candles.ts](lib/actions/finnhub/candles.ts) | Mum verileri çekme |
| (Monolit) | [lib/actions/finnhub/news.ts](lib/actions/finnhub/news.ts) | Haber verileri çekme |
| (Monolit) | [lib/actions/finnhub/search.ts](lib/actions/finnhub/search.ts) | Sembol arama |
| (Monolit) | [lib/actions/finnhub/base.ts](lib/actions/finnhub/base.ts) | API taban isteği |
| `lib/indicators/*.test.ts` | [__tests__/indicators/](__tests__/indicators/) | 17 adet indikatör test dosyası |
| `lib/ta/*.test.ts` | [__tests__/ta/](__tests__/ta/) | 12 adet TA modülü test dosyası |

---

## Ek B: Faz 1-2 Kritik Düzeltme ve Refaktör Özeti

### Faz 1: Hata ve Kararlılık Düzeltmeleri (10.06.2026)
1. **Server Action Payload Optimizasyonu:** `runBacktestAction` ve `optimizeStrategyAction` sunucu eylemlerine devasa veri dizileri göndermek yerine sadece `symbol` ve `interval` gönderilmesi sağlandı. Veriler tamamen sunucu tarafında çekilerek `413 Payload Too Large` hataları önlendi.
2. **Defansif Parametre Koruma ve Normalizasyon:** `lib/ta/compute.ts` içerisine `normalizeParams` eklendi. Gelen parametrelerin eksik, snake_case veya string olması durumunda güvenli bir şekilde merkezi `DEFAULT_PARAMS` ile tamamlanması sağlandı.
3. **Crossover Fonksiyonları Mantık Hatası:** `rsiCross`, `macdCross` gibi tüm crossover fonksiyonlarında hareketli ortalama/eşik kesişimleri düzeltildi. `(prev <= prevSma && cur > curSma)` mantığı kuruldu.
4. **AD Çift Seri Yapısı ve Parametrik Optimizasyonu:** Accumulation/Distribution (AD) göstergesi `{ ad, ma }` dual seriye dönüştürüldü ve `adLen` parametresiyle optimize edilebilir hale getirildi.
5. **SMI Isınma Sınır Kontrolü:** `smi.ts` içerisindeki `rollingHighest` ve `rollingLowest` fonksiyonlarına sınır kontrolü (`i < period - 1`) eklenerek ısınma dönemindeki sahte osilasyonlar engellendi.
6. **Look-ahead Bars Giriş Alanı Serbestleştirilmesi:** Kullanıcı strateji oluştururken tek haneli rakam girmek istediğinde veya silme tuşuna bastığında tetiklenen clamp/instant reset bug'ı giderildi.

### Faz 2: Clean Architecture Yeniden Yapılandırma (10.06.2026)
1. **Flat Directory Bloat Temizliği:** `lib/ta/` altında bulunan 25+ flat dosya; `optimization/`, `registry/` ve `simulation/` alt klasörlerine taşındı.
2. **Büyük Monolitik Yapıların Bölünmesi:** `strategy-optimizer.ts` ve `finnhub.actions.ts` modülleri mantıksal alt dosyalara ayrıştırılarak, kök dosyalar Turbopack server action bütünlüğünü bozmayacak delegasyon wrapper'larına dönüştürüldü.
3. **Birim Testlerinin Merkezi Hiyerarşisi:** Kod dosyalarıyla aynı klasörde bulunan unit testler, root düzeyindeki `__tests__/indicators/` ve `__tests__/ta/` dizinlerine taşındı.
4. **God Component ve Arayüz Sadeleştirmesi:** `TAStrategiesButton.tsx` ve `CustomStrategyModal.tsx` devasa bileşenleri hooks ve küçük alt bileşenlere parçalandı. Optimize edilen ayarlar için premium CSS Tooltip rozeti yerleştirildi.

---

## Ek C: Faz 4 Trade Simulator ve UI/UX Güncelleme Özeti

### Faz 4: Trade Simulator Motoru + UI/UX Terminal İyileştirmeleri (11.06.2026)

#### Trade Simulator Mantıksal Güncellemeleri

1. **Pyramiding Prevention (Aşırı İşlem Engelleme):** `runStrategyBacktest()` fonksiyonuna `activePosition` state yönetimi eklendi. İçeride aktif bir pozisyon varken aynı yönde yeni sinyaller filtrelenerek pyramiding (üst üste pozisyon açma) tamamen engellendi. ([run-backtest.ts:737-847](lib/ta/strategy-optimizer/run-backtest.ts#L737-L847))

2. **Flat-Only Kuralı (Testere Koruması):** Bir pozisyon ters sinyalle (opposite signal) kapandığında, aynı bar üzerinde veya çıkış bar'ına kadar olan sürede anında ters yönlü yeni işlem açılması engellendi. Sistem tamamen nakde (flat) geçerek testere piyasalarında art arda zarar eden işlemlerin önüne geçildi. ([run-backtest.ts:842-847](lib/ta/strategy-optimizer/run-backtest.ts#L842-L847))

3. **Time-Stop Bypass — Trend Rider (Trende Tutunma):** Pozisyon kârdayken (`pnlPct > 0`) ve Trailing Stop aktifken (`useTrailingStop === true`), `timeStopBars` limiti ezilir (bypass edilir). Sistem, pozisyon trailing stop seviyesine gelene veya opposite signal oluşana kadar trendin sonuna kadar işleme tutunur. Bu özellik TrendFollower, SwingTrader ve Aggressive profillerinde aktiftir. ([trade-simulator.ts:223-228](lib/ta/simulation/trade-simulator.ts#L223-L228))

4. **Negatif Fiyat Koruması:** Tüm yüzdelik getiri hesaplamalarında `Math.abs(entryPrice)` kullanılarak teorik negatif fiyat senaryolarına karşı matematiksel güvenlik sağlandı. Normal şartlarda performans etkisi sıfırdır. ([trade-simulator.ts:125](lib/ta/simulation/trade-simulator.ts#L125), [run-backtest.ts:942](lib/ta/strategy-optimizer/run-backtest.ts#L942))

#### UI/UX Terminal İyileştirmeleri

5. **CSV Trade History Export (Veri Dışa Aktarımı):** Kullanıcıların işlem geçmişlerini Excel/Google Sheets'e aktarabilmesi için saf JavaScript (Blob API) tabanlı CSV indirme özelliği eklendi. İndirilen dosyanın en üstüne (sütun başlıklarından hemen önceye) sembol, zaman dilimi, indikatör/strateji adı ve oluşturulma tarihi bilgilerini içeren 4 satırlık bir 'Metadata Header' (Bilgi Başlığı) yerleştirildi. İki monitörde de (StrategyBacktestMonitor ve BacktestMonitor) Download butonu ve Trade History dialog'u içerisinde Export CSV butonu bulunur. ([StrategyBacktestMonitor.tsx:296-323](components/panels/StrategyBacktestMonitor.tsx#L296-L323), [BacktestMonitor.tsx:87-113](components/panels/BacktestMonitor.tsx#L87-L113))

6. **Scroll Zıplama Çözümü:** İndikatör panellerindeki Diagnostic Optimize ve Reset butonlarındaki `router.push` işlemleri `{ scroll: false }` seçeneği ile güncellenerek sayfanın tepeye fırlaması engellendi. Kullanıcı çalıştığı bölgede kalır. ([BacktestMonitor.tsx:78,151](components/panels/BacktestMonitor.tsx#L78))

7. **Popover Parameters (Optimized Settings):** Optimize edilmiş parametre ayarları, sayfayı taşıran CSS hover tooltip yerine Shadcn UI Popover bileşeni ile gösterilmeye başlandı. Glassmorphism (`backdrop-blur-md`), özel scrollbar (`scrollbar-thin`) ve amber renk teması ile premium bir görünüm sunar. ([StrategyBacktestMonitor.tsx:390-411](components/panels/StrategyBacktestMonitor.tsx#L390-L411))

8. **Hybrid Profit Factor Badge:** Win Rate'in yanına, sistemin gerçek kârlılığını tek bakışta gösteren dinamik renkli bir Profit Factor rozeti eklendi. PF ≥ 1.50 için yeşil, 1.00-1.49 için sarı, < 1.00 için kırmızı. Hover durumunda Total Return (%) ve R/R Ratio detayı gösterilir. ([StrategyBacktestMonitor.tsx:358-382](components/panels/StrategyBacktestMonitor.tsx#L358-L382))

9. **Strategy Modal Scrolling:** Strateji seçim ekranı (`TAStrategiesButton` → `TAGlassDialog`) `max-h-[60vh]` ile kaydırılabilir yapıldı. Aksiyon butonları (Apply, Clear, Create, Discover) dialog'un alt kısmına sabitlenerek her zaman erişilebilir kılındı. ([TAStrategiesButton.tsx:249,300-313](components/ta/controls/TAStrategiesButton.tsx#L249))

10. **Hafif Tanı Optimizasyonu ve Parametre Döngü Çözümü:** İndikatör panellerinde Diagnostic Optimization butonuna tıklandığında yaşanan donma ve re-render döngüleri çözüldü. Tarayıcıda brute-force arama yaparken 10 yıllık tüm veri yerine son 2 yıla ait 730 candle dilimlenerek kullanıldı (böylece işlem süresi ~2 saniyeden <200ms'ye indi). URL parametrelerini güncellerken ve sıfırlarken `optimize` bayrağı temizlenerek sunucu tarafındaki ağır, sayfa genelindeki optimizasyon döngüsünün tetiklenmesi engellendi. ([BacktestMonitor.tsx:69-82,157](components/panels/BacktestMonitor.tsx))

### Faz 4'te Değişen Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `lib/ta/simulation/trade-simulator.ts` | Time-stop bypass mantığı (satır 223-228), `Math.abs()` negatif fiyat koruması (satır 125) |
| `lib/ta/strategy-optimizer/run-backtest.ts` | `activePosition` state yönetimi (satır 737-741), pyramiding prevention + flat-only kuralı (satır 841-847), `Math.abs()` koruması (satır 942) |
| `lib/ta/optimizer.ts` | Harf duyarsızlığı koruması (`toUpperCase()`) optimizasyon aramasına eklendi (satır 270-280) |
| `lib/actions/optimize.actions.ts` | Sunucu tarafı optimizasyon telemetry sayaçları (`console.time`) eklendi (satır 23-80) |
| `components/panels/StrategyBacktestMonitor.tsx` | CSV export (satır 296-323), Popover optimized settings (satır 390-411), Hybrid Profit Factor badge (satır 358-382) |
| `components/panels/BacktestMonitor.tsx` | CSV export (satır 87-113), `scroll: false` router.push (satır 78, 151), optimize bayrağı temizliği ve 730-bar dilimleme (satır 69-82, 157) |
| `components/ta/controls/TAStrategiesButton.tsx` | `max-h-[60vh]` scrollable content (satır 249), sabit footer (satır 300-313) |
| `docs/SIGNALIST_MASTER_ARCHITECTURE.md` | Faz 4 güncellemesi: Bölüm 5, 7 ve Ek C eklendi |
| `docs/FEATURES_TODO_AND_DEBUG_REPORTS.md` | Faz 4 raporu eklendi |

## 5. BROAD MARKET FILTER (REGIME FILTER) ARCHITECTURE

Sistemin "Trend Following" karakteristiğini korumak ve "Ayı Piyasalarında (Bear Markets)" uzun yönlü (BUY) sinyallerin neden olduğu kayıpları engellemek amacıyla, genel borsa endeksi (Broad Market) filtresi mimariye entegre edilmiştir. Bu filtreleme, S&P 500 ETF'si (SPY) baz alınarak çalışır.

### 5.1 Veri Katmanı (Data Layer)
- `yahoo-finance2` npm paketi kullanılarak SPY ETF'sine ait geçmiş günlük kapanış verileri sunucu tarafında çekilir.
- Çekilen veriler üzerinden 200 Günlük Basit Hareketli Ortalama (200-SMA) hesaplanır.
- **Look-Ahead Bias Protection:** `[getBroadMarketRegime]` fonksiyonu hesaplamayı yaparken `i` günündeki kapanış ve SMA verisini, bir sonraki takvim günü `i+1` için mühürler. Böylece motor, yarınki işlemlerde bugünkü piyasa kapanış yönünü referans alır (Geleceği görme engellenir).
- Performans amacıyla bu sonuç, `unstable_cache` yardımıyla 24 saat süresince (TTL: 86400) önbelleğe alınır. İşlem süreleri <5ms seviyesine indirilmiştir. ([market.actions.ts:1-90](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/market.actions.ts))

### 5.2 Motor Katmanı (Engine Integration)
- `StrategyBacktestConfig` içerisine opsiyonel `marketRegimeMap: Map<string, boolean>` özelliği eklenmiştir.
- `runStrategyBacktest` döngüsü içerisinde, bir indikatör kombinasyonu `BUY` sinyali ürettiğinde, o günkü SPY rejimine (Bullish/Bearish) bakılır.
- Eğer SPY 200-SMA'sının altındaysa (`isBullish === false`), yeni `BUY` (Long Entry) sinyalleri Nötrlenir (`signal = null;`).
- Mevcut `SELL` sinyalleri (Zarar Kes, İzleyen Stop, Kâr Al) KESİNLİKLE engellenmez. Sistem riskten kaçınmayı agresifçe destekler.
- İptal edilen işlemler için log kayıtlarına `Blocked BUY due to Bear Market (SPY 200-SMA filter)` ifadesi eklenir. ([run-backtest.ts:846-860](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts))

### 5.3 Arayüz & Borulama Katmanı (UI & Plumbing)
- **Manuel Backtest:** Kullanıcılar TA paneli (`CustomStrategyPanel` / `StrategyBacktestMonitor.tsx`) üzerinden diledikleri stratejiyi test ederken, "Market Filter" Toggle (Switch) düğmesi ile bu filtreyi aktif/pasif hale getirebilir. Filtre default olarak kapalıdır.
- **Deep Discovery:** `StrategyDiscoveryDialog.tsx` üzerinde yer alan "Broad Market Filter" Toggle'ı, `applyMarketFilter` state'ini Inngest arka plan iş kuyruğuna (Payload) aktarır. 
- Inngest pipeline'ında `Phase 4.5: Full-Fidelity Unmasked Backtest` bloğu çalışırken, filtre istenmişse SPY haritası çekilir ve en iyi stratejilerin gerçek dünya (full-fidelity) simülasyonuna paslanır. Ayı piyasasında kârlılığını (PF < 1.0) kaybeden zayıf stratejiler anında elenir.

---

> **Hazırlayan:** Antigravity (Kıdemli Sistem Mimarı ve Kantitatif Yazılım Mühendisi)  
> **Son güncelleme:** 2026-06-11  
> **Bu belge, aşağıdaki eski dokümanların yerine geçer:**  
> `CONCEPT_ROADMAP.md`, `TECHNICAL_REPORT.md`, `indicator_audit_report.md`,  
> `PROGRESS_REPORT.md`, `system-architecture-reference.md`, `about_project.md`,  
> `INDICATOR_STRATEGY_DESIGN_PHILOSOPHY.md`
