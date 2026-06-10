# Signalist — Ana Sistem Mimarisi ve Teknik Referans

> **Versiyon:** 4.0 — Master (Clean Architecture & Modularization)  
> **Tarih:** 2026-06-10  
> **Amaç:** Signalist projesinin eksiksiz, güncel ve tek kaynak teknik dokümanı.  
> Bu belge, kod tabanının Faz 2 (Clean Architecture ve Modülerizasyon) sonrasındaki nihai halini yansıtır.  
> **Dil:** Türkçe  
> **Muhatap:** Projeye yeni başlayan herhangi bir geliştirici (insan veya AI).

---

## İçindekiler

1. [Proje Felsefesi ve Konsept](#1-proje-felsefesi-ve-konsept)
2. [Veri Akışı (Data Flow)](#2-veri-akışı-data-flow)
3. [Matematiksel ve Mantıksal Motor](#3-matematiksel-ve-mantıksal-motor)
4. [Strateji Keşif ve Simülasyon Altyapısı](#4-strateji-keşif-ve-simülasyon-altyapısı)
5. [Güncel UI ve UX Durumu](#5-güncel-ui-ve-ux-durumu)
6. [Gerçekçi Yol Haritası (Next Steps)](#6-gerçekçi-yol-haritası-next-steps)
7. [Gelecek Vizyonu ve İleri Düzey Geliştirme Önerileri](#7-gelecek-vizyonu-ve-ileri-düzey-geliştirme-önerileri)
8. [Ek A: Kritik Dosya Referansları ve Yeni Dosya Hiyerarşisi](#ek-a-kritik-dosya-referansları-ve-yeni-dosya-hiyerarşisi)
9. [Ek B: Faz 1-2 Kritik Düzeltme ve Refaktör Özeti](#ek-b-faz-1-2-kritik-düzeltme-ve-refaktör-özeti)

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
│             et" butonu         │   │   5. Trade simülasyonu (SL/TP)      │
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
| **Dosya** | [lib/ta/simulation/backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/backtest.ts) | [lib/ta/strategy-optimizer/run-backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts) |
| **Sinyal** | `*Signal()` doğrudan | `*Signal()` → BBA → DST Fusion |
| **Değerlendirme** | 5 bar lookForward | Path-aware trade simülasyonu |
| **Regime** | Kullanılmaz | `classifyRegime()` ile rejim-adaptif |
| **SL/TP** | Yok | Var (ATR tabanlı) |
| **Kullanıcı Aksiyonu** | "Optimize Et" butonu | "Strateji Keşfet" butonu |

İki yol aynı `signal-registry.ts`'teki `*Signal()` fonksiyonlarını paylaşır, ancak farklı şekilde kullanır. Birinde yapılan değişiklik diğerini etkilemez.

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
              │     • mctsSearch() — 200 simülasyon, UCT + MI prior
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

**Kaynak:** [lib/indicators/_math.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/_math.ts)

### 3.2 17 İndikatör — Güncel Hesaplama ve Sinyal Mantığı

Tüm sinyal fonksiyonları **Faz 1-2 düzeltmeleri sonrası** güncel halidir.

| # | İndikatör | Dosya | Sinyal Mantığı | Eşik/Koşul |
|---|-----------|-------|---------------|-----------|
| 1 | **RSI** | [rsi.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/rsi.ts) | `rsi > rsiMa → BUY : SELL` | Wilder seed, confidence tracking |
| 2 | **MACD** | [macd.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/macd.ts) | `macd > signal → BUY : SELL` | fast < slow guard (Faz 20.5 / Faz 1) |
| 3 | **CCI** | [cci.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/cci.ts) | `cci > ma → BUY : SELL` | `createDev` ile Pine uyumlu |
| 4 | **StochRSI** | [stochrsi.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/stochrsi.ts) | `k > d → BUY : SELL` | RSI üzerine Stokastik |
| 5 | **WaveTrend** | [wavetrend.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/wavetrend.ts) | `wt1 > wt2 → BUY : SELL` | LazyBear WT, confidence tracking |
| 6 | **DMI** | [dmi.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/dmi.ts) | `plusDI > minusDI → BUY : SELL` | Wilder smoothing, DX→ADX |
| 7 | **SMI** | [smi.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/smi.ts) | `smi > signal → BUY : SELL` | Ergodic, warmup bounds check ekli |
| 8 | **AO** | [ao.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/ao.ts) | `cur > prev → BUY : SELL` | Sıfır çizgisi crossover'ı dahil |
| 9 | **MFI** | [mfi.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/mfi.ts) | `cur > prev → BUY : SELL` | Eşikler kaldırıldı, sadece yön |
| 10 | **WPR** | [wpr.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/wpr.ts) | `cur > prev → BUY : SELL` | Eşikler kaldırıldı, sadece yön |
| 11 | **DI** | [demand_index.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/demand_index.ts) | `cur > 1.0 → BUY, cur < 1.0 → SELL` | Eşik 1.0 standardı |
| 12 | **CMF** | [cmf.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/cmf.ts) | `val > 0 → BUY : SELL` | `sumVol=0` durumunda undefined korumalı |
| 13 | **A/D** | [ad.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/ad.ts) | `cur > ma → BUY : SELL` | **Dual Series (ad + ma)**, dinamik `adLen` optimize edilebilir |
| 14 | **NetVol** | [net_volume.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/net_volume.ts) | `cur > 0 → BUY : SELL` | Bar bazında net hacim |
| 15 | **MADR** | [madr.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/madr.ts) | `cur > 0 → BUY : SELL` | $(close - SMA) / SMA \cdot 100$ |
| 16 | **ALMA** | [alma.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/alma.ts) | Fiyat-ALMA kesişimi | Gaussian ağırlıklı MA |
| 17 | **BB** | [bollinger.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/indicators/bollinger.ts) | Bant kesişimi + fiyat konumu | Popülasyon std (N) |

**Sinyal kaynak kodu:** [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts)

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

**Dosya:** [lib/ta/regime-detector.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/regime-detector.ts)

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

**Dosya:** [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts)

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

**Dosya:** [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts)

$$ER = \frac{|close_t - close_{t-n}|}{\sum_{i=t-n+1}^{t} |close_i - close_{i-1}|}$$

- $ER \to 1$: Fiyat düz bir çizgide hareket ediyor (güçlü trend) → sinyal güveni yüksek.
- $ER \to 0$: Yüksek gürültü, net ilerleme yok → sinyal güveni düşük.

DST BBA'da **continuous multiplier** olarak kullanılır: trend-takipçisi indikatörlerin güvenini gürültülü piyasalarda düşürür.

### 3.6 Mutual Information (MI) — İndikatör-Fiyat İlişkisi

**Dosya:** [lib/ta/mutual-information.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/mutual-information.ts)

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

**Dosya:** [lib/ta/optimization/mcts-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/mcts-search.ts)

#### 3.7.1 FlatMCTSTree — Sıfır GC Basınçlı Ağaç Yapısı

Tüm düğüm verileri **Int32Array / Float64Array** içinde saklanır — hot-loop sırasında hiçbir JS nesnesi oluşturulmaz. 2000 düğüm × 64 byte = **128KB (L2 cache'e sığar).**

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

#### 3.7.3 MCTS Ana Döngüsü (200 simülasyon)

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

**Dosya:** [lib/ta/optimization/mcts-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/mcts-search.ts)

$$CS = \frac{\max(WR, 0)}{100} \times (\max(Sharpe, -1) + 1) \times \sqrt{\max(PF, 0)} \times \sqrt{\max(signals, 1)}$$

Dört boyutu dengeler:
- **WR (Win Rate):** Ham başarı oranı (birincil)
- **Sharpe:** Risk-ayarlı getiri (ikincil)
- **Profit Factor:** Ödül/risk oranı (üçüncül)
- **Signals:** İstatistiksel anlamlılık (düşük sinyalli stratejileri cezalandırır)

### 3.9 Triple Barrier Method (Fırsat Etiketleme)

**Dosya:** [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts)

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

**Dosya:** [lib/ta/strategy-optimizer/run-backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts)

Bailey & López de Prado (2012) formülü:

$$PSR = \Phi\left( \frac{(\hat{SR} - SR^*) \sqrt{T-1}}{\sqrt{1 - \hat{\gamma}_3 \cdot \hat{SR} + \frac{\hat{\gamma}_4 - 1}{4} \cdot \hat{SR}^2}} \right)$$

- $\Phi$: Standart normal CDF.
- $\hat{SR}$: Gözlemlenen Sharpe oranı.
- $SR^*$: Benchmark Sharpe.
- $T$: Bağımsız işlem sayısı.
- $\hat{\gamma}_3, \hat{\gamma}_4$: Çarpıklık ve basıklık.

### 3.11 Market Telemetry — Feature Engine

**Dosya:** [app/api/analysis/market-telemetry/route.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/api/analysis/market-telemetry/route.ts)

Market Telemetry, **bir strateji motoru değil, Feature Engine (Özellik Motoru)** olarak çalışır.

Telemetry verileri, Deep Discovery (`deepDiscoveryJob`) pipeline'ına **Faz 1.5** olarak başarılı bir şekilde bağlanmıştır. Arka planda `indicatorConfidences` olarak DST fusion motoruna beslenir.

### 3.12 Transaction Cost Modeling (İşlem Maliyetleri)

Gerçekçi backtest sonuçları elde etmek için işlem maliyetleri strateji optimizasyon sürecine (Yol B) entegre edilmiştir.

- **Profil Yapılandırması:** Her strateji profili (`TrendFollower`, `SwingTrader`, vb.) `transactionCostPct` tanımlar. (Varsayılan %0.10: Giriş için %0.05 + Çıkış için %0.05).
- **Maliyet Düşülmesi:** `runStrategyBacktest()` sırasında simüle edilen her işlemin getirisinden `transactionCostPct` düşülür.

---

## 4. Strateji Keşif ve Simülasyon Altyapısı

### 4.1 Algoritma Envanteri

| Algoritma | Yeni Konum | Amaç | Durum |
|-----------|------------|------|-------|
| **Dempster-Shafer Theory** | [signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts) | Multi-indikatör soft-vote fusion | ✅ Aktif |
| **Monte Carlo Tree Search** | [mcts-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/mcts-search.ts) | Kombinatoriyel strateji keşfi | ✅ Aktif |
| **Mutual Information** | [mutual-information.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/mutual-information.ts) | İndikatör-fiyat ilişkisi ölçümü | ✅ Aktif |
| **Hyperband** | [hyperband-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/hyperband-search.ts) | Multi-fidelity bracket evaluator | ✅ Aktif |
| **Differential Evolution** | [differential-evolution.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/differential-evolution.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Bayesian Optimization (TPE)** | [bayesian-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/bayesian-optimizer.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Genetic Algorithm** | [ga-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/ga-optimizer.ts) | Joint indicator+param seçimi | ✅ Legacy |
| **Trade Simulator** | [trade-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/trade-simulator.ts) | Path-aware SL/TP/trailing | ✅ Aktif |
| **Portfolio Simulator** | [portfolio-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/portfolio-simulator.ts) | Çoklu strateji portföy | ✅ Aktif |
| **Beta-Binomial Posterior** | [run-backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts) | Win rate güven aralığı | ✅ Aktif |
| **Fitness Sharing (Niching)** | [ga-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/ga-optimizer.ts) | GA popülasyon çeşitliliği | ✅ Aktif |
| **Diversity Ranker** | [diversity-ranker.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/diversity-ranker.ts) | Strateji çeşitlilik sıralaması | ✅ Aktif |
| **Surrogate Optimizer** | [surrogate-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/surrogate-optimizer.ts) | Surrogate model optimizasyonu | ✅ Aktif |

### 4.2 Hyperband Multi-Fidelity Optimization

**Dosya:** [lib/ta/optimization/hyperband-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/hyperband-search.ts)

**Kritik tasarım kuralı:** İndikatörler **her zaman TÜM seride hesaplanır.** Sadece DEĞERLENDİRME maskelenmiş alt kümelerde yapılır. Bu, path-dependent indikatörlerin (MACD, EMA, RSI) bütünlüğünü korur.

### 4.3 Trade Simülasyonu — Path-Aware

**Dosya:** [lib/ta/simulation/trade-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/trade-simulator.ts)

```
simulateTrade(candles, entryIndex, signal, atrValues, riskConfig):
  entryPrice = candles[entryIndex].close
  stopDistance = currentATR × stopLossAtrMult
  tpDistance = stopDistance × takeProfitR

  Bar bar ilerle (max timeStopBars):
    1. High/Low ile SL kontrolü (veya trailing stop)
    2. High/Low ile TP kontrolü
    3. Opposite signal (callback ile)
    4. Time stop (max bar süresi)
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

**Dosya:** [lib/ta/registry/indicator-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/indicator-registry.ts)

Yeni bir indikatör eklendiğinde, `INDICATOR_TO_ALLDATA_FIELD` mapping'ine eklenmesi yeterlidir — `DISCOVERY_POOL` otomatik güncellenir.

### 4.6 Optimizasyon Sistemi (Tek İndikatör)

**Dosya:** [lib/ta/optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimizer.ts)

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
| WaveTrend | `wt_avg_len` | [5, 40] | n2 konumuna gönderilir |
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

## 5. Güncel UI ve UX Durumu

### 5.1 Sayfa Haritası

| Rota | Sayfa | Açıklama |
|------|-------|----------|
| `/` | [app/(root)/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/page.tsx) | Ana dashboard |
| `/ta` | [app/(root)/ta/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/ta/page.tsx) | Teknik Analiz sayfası |
| `/ai` | [app/(root)/ai/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/ai/page.tsx) | AI Chat sayfası |
| `/portfolio` | [app/(root)/portfolio/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/portfolio/page.tsx) | Sanal portföy |
| `/watchlist` | [app/(root)/watchlist/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/watchlist/page.tsx) | İzleme listesi |
| `/archive` | [app/(root)/archive/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/archive/page.tsx) | Arşiv / raporlar |
| `/stocks/[symbol]` | [app/(root)/stocks/[symbol]/page.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/app/(root)/stocks/%5Bsymbol%5D/page.tsx) | Hisse detay sayfası |

### 5.2 TA Sayfası Bileşen Yapısı (Modüler)

Bileşenler artık amaca yönelik alt klasörler altında gruplanmıştır:

#### 5.2.1 `components/panels/` (Dashboard ve Monitör Panelleri)
- **BacktestMonitor:** Tek indikatör backtest sonuçları + "Optimize Et" butonu.
- **StrategyBacktestMonitor:** Strateji backtest sonuçları.
- **CustomStrategyPanel:** Kullanıcı strateji oluşturma arayüzü.
- **CustomStrategyModal:** Strateji kaydetme modalı.
- **StrategyDiscoveryDialog:** Keşif başlatma dialog'u.

#### 5.2.2 `components/ta/common/` (Paylaşılan UI)
- **StockLogo:** Şirket/Hisse logolarını SVG veya API üzerinden gösterir.
- **TAGlassDialog:** Arayüz için premium cam efekti (glassmorphism) sunan dialog şablonu.

#### 5.2.3 `components/ta/controls/` (Kullanıcı Kontrolleri)
- **TASearch:** Hisse sembolü arama.
- **TAIntervalButton:** Timeframe seçici (1d, 4h).
- **TAIndicatorsButton:** İndikatör seçici panel.
- **TAStrategiesButton:** Strateji seçici modal.
- **MarketTelemetryButton:** Telemetry panelini açan tetikleyici buton.

#### 5.2.4 `components/ta/discovery/` (Keşif ve Simülasyon Grafikleri)
- **DeepDiscoveryProgress:** Keşif iş ilerleme çubuğu.
- **DeepDiscoveryResults:** Keşif sonuçları.
- **BacktestLogPanel:** Bar-bar debug log izleme alanı.
- **RegimeAccuracyTable:** Rejim bazlı doğruluk tablosu.
- **PortfolioSimChart:** Portföy simülasyon grafiği.

#### 5.2.5 `components/ta/panels/` (Yan Paneller)
- **IndicatorSection:** İndikatör panel grubu.
- **MarketTelemetryPanel:** Rejim analizi paneli.
- **TAIndicatorSettings:** İndikatör parametre ayarları.
- **TATimeframes:** Timeframe seçici.
- **TADataDepth:** Veri derinliği paneli.

#### 5.2.6 `components/strategies/` (Strateji Seçici ve CRUD Modülleri)
Bileşen monolitinden ayrıştırılan ve durum yönetimi modüler hale getirilen alt bileşenler:
- **components/BuiltInStrategiesSection:** Hazır stratejileri listeler.
- **components/MyStrategiesSection:** Kullanıcının kendi kaydettiği stratejileri gösterir.
- **components/DiscoveredStrategiesSection:** Keşif motorundan çıkan stratejileri listeler.
- **components/SavedStrategiesList:** Strateji kaydetme listesi.
- **components/IndicatorSelector:** Manuel strateji için indikatör seçme paneli.
- **components/DeleteConfirmDialog:** Strateji silme onay modalı.
- **components/SortButton:** Sıralama seçenekleri butonu.
- **components/StrategyActionButtons:** Aksiyon butonları.
- **hooks/useStrategyActions:** Pinleme, silme, kaydetme işlemleri için state hook'u.
- **hooks/useStrategyURL:** URL parametreleri ile strateji senkronizasyon hook'u.

### 5.3 AI Chat Bileşenleri

| Bileşen | Dosya | İşlev |
|---------|-------|-------|
| **ChatArea** | [components/ai/ChatArea.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/components/ai/ChatArea.tsx) | Ana chat arayüzü |
| **ModelSelector** | [components/ai/ModelSelector.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/components/ai/ModelSelector.tsx) | AI model/provider seçici |
| **GenerativeUI** | [components/ai/GenerativeUI.tsx](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/components/ai/GenerativeUI.tsx) | AI araç çağrısı sonuç render |

### 5.4 Canlı Sinyal Paneli (`signals.ts`)

**Dosya:** [lib/ta/signals.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/signals.ts)

`generateAllSignals()` fonksiyonu, her aktif indikatörün **anlık durumunu** gösterir:
- Her indikatör için BUY/SELL/NEUTRAL + güç seviyesi (STRONG/WEAK).
- DST fusion içermez — her indikatör bağımsız değerlendirilir.

---

## 6. Gerçekçi Yol Haritası (Next Steps)

### 6.1 Öncelik Sıralaması

| # | Görev | Öncelik | Efor | Bağımlılık |
|---|-------|---------|------|-----------|
| 1 | **Walk-Forward Validation Pipeline** | 🟠 Orta | 3-4 gün | Yok |
| 2 | **Dinamik Çıkış Stratejileri (Trailing Stop)** | 🟠 Orta | 2-3 gün | Yok |
| 3 | **Çoklu Zaman Dilimi (MTF) Filtreleri** | 🔴 Yüksek | 4-5 gün | Test altyapısı |
| 4 | **Feature Redundancy Filtreleri** | 🟠 Orta | 2-3 gün | MI altyapısı var |
| 5 | **Haber Duygu Analizi → Strateji Sinyali** | 🟡 Düşük | 4-5 gün | AI entegrasyonu |

---

## 7. Gelecek Vizyonu ve İleri Düzey Geliştirme Önerileri

### 7.1 Çoklu Zaman Dilimi (Multi-Timeframe - MTF) Analizi Filtreleri
DST (Dempster-Shafer) sinyal birleştirme motoruna üst zaman dilimi (higher timeframe) filtreleri eklemek. Örneğin; Günlük (1d) grafikte MACD trendi negatifken, 4 Saatlik (4h) grafikteki "Al" sinyallerini reddetmek.

### 7.2 Dinamik Çıkış Stratejileri (Gelişmiş Trailing Stop)
Mevcut statik ATR tabanlı Stop-Loss ve Take-Profit seviyelerine ek olarak, trend takibi yapan dinamik çıkış mekanizmaları eklemek (*Chandelier Exit*, *Parabolic SAR*).

---

## Ek A: Kritik Dosya Referansları ve Yeni Dosya Hiyerarşisi

Aşağıdaki tablo, **Sistem Refaktörü (Faz 2)** sonrası dosya konumlarını gösterir:

| Eski Konum (Legacy Path) | Yeni Konum (New Refactored Path) | Açıklama |
|-------------------------|--------------------------------|----------|
| `lib/ta/strategy-optimizer.ts` | [lib/ta/strategy-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer.ts) | Delegating wrapper (Giriş) |
| (Monolit) | [lib/ta/strategy-optimizer/run-backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts) | Backtest simülasyon motoru |
| (Monolit) | [lib/ta/strategy-optimizer/optimize-params.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/optimize-params.ts) | Parametre optimizasyon modülü |
| (Monolit) | [lib/ta/strategy-optimizer/discover-strategy.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/discover-strategy.ts) | MCTS strateji keşif modülü |
| (Monolit) | [lib/ta/strategy-optimizer/types.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/types.ts) | Tip tanımları |
| `lib/ta/backtest.ts` | [lib/ta/simulation/backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/backtest.ts) | Yol A backtest motoru |
| `lib/ta/trade-simulator.ts` | [lib/ta/simulation/trade-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/trade-simulator.ts) | Yol B işlem simülatörü |
| `lib/ta/portfolio-simulator.ts`| [lib/ta/simulation/portfolio-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/portfolio-simulator.ts) | Portföy simülatörü |
| `lib/ta/cross-validator.ts` | [lib/ta/simulation/cross-validator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/cross-validator.ts) | Validasyon modülü |
| `lib/ta/mcts-search.ts` | [lib/ta/optimization/mcts-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/mcts-search.ts) | MCTS Arama algoritması |
| `lib/ta/hyperband-search.ts` | [lib/ta/optimization/hyperband-search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/hyperband-search.ts) | Hyperband Downsampling |
| `lib/ta/differential-evolution.ts` | [lib/ta/optimization/differential-evolution.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/differential-evolution.ts) | DE algoritması |
| `lib/ta/ga-optimizer.ts` | [lib/ta/optimization/ga-optimizer.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/optimization/ga-optimizer.ts) | GA algoritması |
| `lib/ta/signal-registry.ts` | [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts) | Sinyal kuralları ve DST |
| `lib/ta/indicator-registry.ts` | [lib/ta/registry/indicator-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/indicator-registry.ts) | İndikatör tescil havuzu |
| `lib/actions/finnhub.actions.ts` | [lib/actions/finnhub.actions.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/finnhub.actions.ts) | Delegating wrapper (Server actions) |
| (Monolit) | [lib/actions/finnhub/candles.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/finnhub/candles.ts) | Mum verileri çekme |
| (Monolit) | [lib/actions/finnhub/news.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/finnhub/news.ts) | Haber verileri çekme |
| (Monolit) | [lib/actions/finnhub/search.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/finnhub/search.ts) | Sembol arama |
| (Monolit) | [lib/actions/finnhub/base.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/actions/finnhub/base.ts) | API taban isteği |
| `lib/indicators/*.test.ts` | [__tests__/indicators/](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/__tests__/indicators/) | 17 adet indikatör test dosyası |
| `lib/ta/*.test.ts` | [__tests__/ta/](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/__tests__/ta/) | 12 adet TA modülü test dosyası |

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

> **Hazırlayan:** Antigravity (Kıdemli Sistem Mimarı ve Kantitatif Yazılım Mühendisi)  
> **Son güncelleme:** 2026-06-10  
> **Bu belge, aşağıdaki eski dokümanların yerine geçer:**  
> `CONCEPT_ROADMAP.md`, `TECHNICAL_REPORT.md`, `indicator_audit_report.md`,  
> `PROGRESS_REPORT.md`, `system-architecture-reference.md`, `about_project.md`,  
> `INDICATOR_STRATEGY_DESIGN_PHILOSOPHY.md`
