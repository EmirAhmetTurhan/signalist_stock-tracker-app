# Signalist — Ana Sistem Mimarisi ve Teknik Referans

> **Versiyon:** 3.0 — Master (Birleştirilmiş)  
> **Tarih:** 2026-06-08  
> **Amaç:** Signalist projesinin eksiksiz, güncel ve tek kaynak teknik dokümanı.  
> Bu belge, kod tabanının 20 fazlık denetim ve düzeltme sonrasındaki nihai halini yansıtır.  
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
      │     └── *Signal() fonksiyonları → lib/ta/signal-registry.ts
      │
      ├── İnanca dönüştürülür (BBA — Basic Belief Assignment)
      │     └── signalToBBA(signal, confidence, regime) → lib/ta/signal-registry.ts:706
      │
      └── Tüm inançlar DST ile birleştirilir
            └── dempsterCombine() + fuseAll() → lib/ta/signal-registry.ts:669-698
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
│   components/ta/TAIntervalButton.tsx (1d veya 4h)                         │
│   components/ta/TASearch.tsx (sembol arama)                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ 2. Finnhub API'den OHLCV verisi çekilir ─────────────────────────────────┐
│                                                                            │
│   lib/actions/finnhub.actions.ts → getCandlesForInterval(symbol, interval, │
│   days)                                                                    │
│     • interval: "1d" veya "4h" (timeframe-guard.ts ile valide edilir)     │
│     • days: 365-3650 (1-10 yıl)                                            │
│     • Dönüş: Candle[] { time, open, high, low, close, volume }            │
│     • Optimizer 10 yıl (3650 gün) kullanır — lib/actions/optimize.actions │
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
│   lib/ta/strategy-optimizer.ts → mapComputedToAllData(computed)           │
│     • Dönüş: AllData { rsiData, macdData, cciData, mfiData, ... }        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─ 4a. TEK İNDİKATÖR BACKTEST ──┐   ┌─ 4b. STRATEJİ BACKTEST / KEŞİF ─────┐
│                                │   │                                       │
│ lib/ta/backtest.ts             │   │ lib/ta/strategy-optimizer.ts         │
│   calculateWinRate()           │   │   runStrategyBacktest()              │
│                                │   │                                       │
│ • Her bar bağımsız değerlendir │   │ • Her bar için:                      │
│ • *Signal() → BUY/SELL         │   │   1. classifyRegime() → rejim tespit │
│ • 5 bar sonraki fiyata bak     │   │   2. getIndicatorSignal() → sinyal   │
│ • Basit, zincirleme yok        │   │   3. signalToBBA() → inanç          │
│                                │   │   4. fuseAll() → DST konsensüs      │
│ Kullanıcı: "RSI'yı optimize    │   │   5. Trade simülasyonu (SL/TP)      │
│             et" butonu         │   │                                       │
│                                │   │ Kullanıcı: "Strateji Keşfet" butonu  │
└────────────────────────────────┘   └───────────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─ 5. Sonuçlar UI'da gösterilir ────────────────────────────────────────────┐
│                                                                            │
│   components/panels/BacktestMonitor.tsx (tek indikatör sonuçları)         │
│   components/panels/StrategyBacktestMonitor.tsx (strateji sonuçları)      │
│   components/ta/DeepDiscoveryResults.tsx (keşif sonuçları)                │
│   components/ta/MarketTelemetryPanel.tsx (rejim analizi)                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 İki Ayrı Backtest Yolu

Sistemde **birbirinden bağımsız iki backtest yolu** bulunur:

| Özellik | Yol A: Tek İndikatör | Yol B: Strateji (DST) |
|---------|---------------------|----------------------|
| **Fonksiyon** | `calculateWinRate()` | `runStrategyBacktest()` |
| **Dosya** | `lib/ta/backtest.ts:40` | `lib/ta/strategy-optimizer.ts` |
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
              ├── Phase 1.5: OPPORTUNITY LABELING (Triple Barrier Method)
              │     • TP: +2.0 × ATR, SL: -1.0 × ATR, Time: 20 bar
              │     • Her bar: TP'ye ulaşan → 1, SL'ye ulaşan → -1, zaman dolan → 0
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
| **createDev** | $\frac{1}{n}\sum_{i=t-n+1}^{t} |V_i - SMA_t|$ | Pine Script `ta.dev` uyumlu. CCI hesaplaması için. |

**Kaynak:** [lib/indicators/_math.ts](lib/indicators/_math.ts)

### 3.2 17 İndikatör — Güncel Hesaplama ve Sinyal Mantığı

Tüm sinyal fonksiyonları **Faz 20 düzeltmeleri sonrası** güncel halidir.

| # | İndikatör | Dosya | Sinyal Mantığı | Eşik/Koşul |
|---|-----------|-------|---------------|-----------|
| 1 | **RSI** | [rsi.ts](lib/indicators/rsi.ts) | `rsi > rsiMa → BUY : SELL` | Wilder seed, confidence tracking |
| 2 | **MACD** | [macd.ts](lib/indicators/macd.ts) | `macd > signal → BUY : SELL` | fast < slow guard (Faz 20.5) |
| 3 | **CCI** | [cci.ts](lib/indicators/cci.ts) | `cci > ma → BUY : SELL` | `createDev` ile Pine uyumlu |
| 4 | **StochRSI** | [stochrsi.ts](lib/indicators/stochrsi.ts) | `k > d → BUY : SELL` | RSI üzerine Stokastik |
| 5 | **WaveTrend** | [wavetrend.ts](lib/indicators/wavetrend.ts) | `wt1 > wt2 → BUY : SELL` | LazyBear WT, confidence tracking |
| 6 | **DMI** | [dmi.ts](lib/indicators/dmi.ts) | `plusDI > minusDI → BUY : SELL` | Wilder smoothing, DX→ADX |
| 7 | **SMI** | [smi.ts](lib/indicators/smi.ts) | `smi > signal → BUY : SELL` | Ergodic, rolling high/low EMA |
| 8 | **AO** | [ao.ts](lib/indicators/ao.ts) | `cur > prev → BUY : SELL` | Sıfır çizgisi crossover'ı dahil |
| 9 | **MFI** | [mfi.ts](lib/indicators/mfi.ts) | `cur > prev → BUY : SELL` | **Faz 20.1:** Eşikler kaldırıldı, sadece yön |
| 10 | **WPR** | [wpr.ts](lib/indicators/wpr.ts) | `cur > prev → BUY : SELL` | **Faz 20.2:** Eşikler kaldırıldı, sadece yön |
| 11 | **DI** | [demand_index.ts](lib/indicators/demand_index.ts) | `cur > 1.0 → BUY, cur < 1.0 → SELL` | **Faz 20.3:** Eşik 0→1.0, DI≥0 her zaman BUY'dı |
| 12 | **CMF** | [cmf.ts](lib/indicators/cmf.ts) | `val > 0 → BUY : SELL` | **Faz 20.4:** sumVol=0 → undefined |
| 13 | **A/D** | [ad.ts](lib/indicators/ad.ts) | `cur > sma(20) → BUY : SELL` | Kümülatif MFV, **Faz 20.8:** SMA cur hariç |
| 14 | **NetVol** | [net_volume.ts](lib/indicators/net_volume.ts) | `cur > 0 → BUY : SELL` | Bar bazında net hacim |
| 15 | **MADR** | [madr.ts](lib/indicators/madr.ts) | `cur > 0 → BUY : SELL` | $(close - SMA) / SMA \cdot 100$ |
| 16 | **ALMA** | [alma.ts](lib/indicators/alma.ts) | Fiyat-ALMA kesişimi | Gaussian ağırlıklı MA |
| 17 | **BB** | [bollinger.ts](lib/indicators/bollinger.ts) | Bant kesişimi + fiyat konumu | Popülasyon std (N), offset kullanılmıyor |

**Sinyal kaynak kodu:** [lib/ta/signal-registry.ts](lib/ta/signal-registry.ts)

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

**Dosya:** [lib/ta/regime-detector.ts:123-202](lib/ta/regime-detector.ts#L123)

`classifyRegime()` fonksiyonu, bar `i` anında **sadece `i` ve öncesindeki verileri** okuyarak piyasa rejimini tespit eder. **Canlı sinyal için güvenlidir** (causal — geleceği okumaz).

#### Algoritma:

```
classifyRegime(candles, i, atrValues, prevRegime?):
  1. SMA(20) hesapla — kapanış fiyatı üzerinde
  2. MA slope: 20-SMA'nın 10 bar önceki haline göre % değişimi
  3. Volatilite oranı: currentATR / avgATR(20)
  4. ADX yaklaşımı: 14-bar yönlü hareket oranı → 0-100 skalasında trend gücü

  Sınıflandırma (causal, relaxed thresholds):
  • volRatio > 1.8 → VOLATILE
  • |maSlope| > 0.2 ve adxApprox > 55 → TRENDING
      - maSlope > 0 → UPTREND
      - maSlope < 0 → DOWNTREND
  • |maSlope| < 0.15 ve volRatio < 1.2 → RANGING
  • Aksi halde → NEUTRAL

  Hysteresis (fluttering önleme):
  • Zayıf sinyal durumunda önceki rejim korunur
  • Volatile rejimler için hysteresis uygulanmaz
```

#### `segmentRegimes()` — Analiz Amaçlı (Non-Causal)

**Dosya:** [lib/ta/regime-detector.ts:229](lib/ta/regime-detector.ts#L229)

Tüm fiyat serisini okuyarak (geleceği görerek) piyasa segmentlerine ayırır. **Canlı sinyalde ASLA kullanılamaz.** Sadece arşiv raporlaması ve analiz içindir. Zigzag/directional-change pivot tespiti + ATR tabanlı volatilite sınıflandırması kullanır.

### 3.4 Dempster-Shafer Theory (DST) Fusion

**Dosya:** [lib/ta/signal-registry.ts:669-730](lib/ta/signal-registry.ts#L669)

#### 3.4.1 Temel Kavramlar

| Terim | Açıklama |
|-------|----------|
| **BBA (Basic Belief Assignment)** | Bir olaya atanan inanç kütlesi: `{ buy, sell, uncertainty }` |
| **Conflict (Çatışma)** | İki kaynak çeliştiğinde: `a.buy × b.sell + a.sell × b.buy` |
| **Uncertainty (Belirsizlik)** | Karar verilemeyen durumlar için ayrılan kütle |

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

**Dosya:** [lib/ta/signal-registry.ts:393-402](lib/ta/signal-registry.ts#L393)

$$ER = \frac{|close_t - close_{t-n}|}{\sum_{i=t-n+1}^{t} |close_i - close_{i-1}|}$$

- $ER \to 1$: Fiyat düz bir çizgide hareket ediyor (güçlü trend) → sinyal güveni yüksek
- $ER \to 0$: Yüksek gürültü, net ilerleme yok → sinyal güveni düşük

DST BBA'da **continuous multiplier** olarak kullanılır: trend-takipçisi indikatörlerin güvenini gürültülü piyasalarda düşürür.

### 3.6 Mutual Information (MI) — İndikatör-Fiyat İlişkisi

**Dosya:** [lib/ta/mutual-information.ts](lib/ta/mutual-information.ts)

$$I(X;Y) = H(X) + H(Y) - H(X,Y)$$

$$H(X) = -\sum_{i} p(x_i) \ln p(x_i) + \underbrace{\frac{m-1}{2N}}_{\text{Miller-Madow düzeltmesi}}$$

**Algoritma adımları:**
1. **Forward return hesapla:** $r_t = (close_{t+14} - close_t) / close_t$
2. **Return'leri 3 kategoride bin'le:** DOWN / FLAT / UP (equal-frequency, simetrik kuantiller)
3. **İndikatör değerlerini 10 kategoride bin'le:** Equal-frequency binning
4. **Joint histogram oluştur:** $counts[10 \times 3]$ matris
5. **MI hesapla:** $I(X;Y) = H(X) + H(Y) - H(X,Y)$
6. **Softmax normalize:** $P(i) = \exp((MI_i / \tau)^T) / \Sigma \exp$, $\tau = \max(MI)$

**Fallback koruması:** En az 4 indikatör non-zero prior ağırlık alır (`MIN_ACTIVE_INDICATORS = 4`). Düşük volatiliteli hisselerde tüm ağırlıklar sıfırlanırsa, top-4 zorla korunur.

### 3.7 Monte Carlo Tree Search (MCTS) — UCT Formülü

**Dosya:** [lib/ta/mcts-search.ts](lib/ta/mcts-search.ts)

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
- $prior$: MI-bazlı öncelik ağırlığı — yüksek MI'lı indikatörler önce keşfedilir
- Ziyaret edilmemiş düğümler `UCT = Infinity` döndürür (zorunlu keşif)

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

**Dosya:** [lib/ta/mcts-search.ts:299-310](lib/ta/mcts-search.ts#L299)

$$CS = \frac{\max(WR, 0)}{100} \times (\max(Sharpe, -1) + 1) \times \sqrt{\max(PF, 0)} \times \sqrt{\max(signals, 1)}$$

Dört boyutu dengeler:
- **WR (Win Rate):** Ham başarı oranı (birincil)
- **Sharpe:** Risk-ayarlı getiri (ikincil)
- **Profit Factor:** Ödül/risk oranı (üçüncül)
- **Signals:** İstatistiksel anlamlılık (düşük sinyalli stratejileri cezalandırır)

### 3.9 Triple Barrier Method (Fırsat Etiketleme)

**Dosya:** [lib/ta/signal-registry.ts:638-658](lib/ta/signal-registry.ts#L638)

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

**Dosya:** [lib/ta/signal-registry.ts:582-622](lib/ta/signal-registry.ts#L582)

Bailey & López de Prado (2012) formülü. "Bu Sharpe oranı gerçek yeteneği mi yoksa şansı mı yansıtıyor?" sorusunu yanıtlar:

$$PSR = \Phi\left( \frac{(\hat{SR} - SR^*) \sqrt{T-1}}{\sqrt{1 - \hat{\gamma}_3 \cdot \hat{SR} + \frac{\hat{\gamma}_4 - 1}{4} \cdot \hat{SR}^2}} \right)$$

- $\Phi$: Standart normal CDF (Abramowitz & Stegun yaklaşımı)
- $\hat{SR}$: Gözlemlenen Sharpe oranı
- $SR^*$: Benchmark Sharpe (genellikle 0)
- $T$: Bağımsız işlem sayısı
- $\hat{\gamma}_3, \hat{\gamma}_4$: Çarpıklık ve basıklık

**PSR ≥ 0.95 → %95 olasılıkla gerçek yetenek.**

### 3.11 Market Telemetry — Feature Engine

**Dosya:** [app/api/analysis/market-telemetry/route.ts](app/api/analysis/market-telemetry/route.ts)

Market Telemetry, **bir strateji motoru değil, Feature Engine (Özellik Motoru)** olarak çalışır:

```
POST /api/analysis/market-telemetry { symbol, interval, years }
  │
  ├── getCandlesForInterval() → MAX 2000 mum (guard: Vercel timeout)
  ├── computeIndicators(all 17 keys, DEFAULT_PARAMS)
  ├── classifyRegime() → HER BAR için causal rejim (causal, güvenli)
  ├── evaluateIndicators(candles, dataMap, regimeMap)
  │     └── Her rejim × her indikatör: Beta-Binomial posterior hit rate + %95 CI
  ├── buildRegimeStrategies(performances) → optimal strateji önerileri
  │
  └── JSON response → MarketTelemetryPanel.tsx'te gösterilir
```

**Mevcut durum:** Telemetry verisi keşif motoruna **henüz bağlanmamıştır.** Panel bağımsız bilgi amaçlı çalışır.

---

## 4. Strateji Keşif ve Simülasyon Altyapısı

### 4.1 Algoritma Envanteri

| Algoritma | Dosya | Amaç | Durum |
|-----------|-------|------|-------|
| **Dempster-Shafer Theory** | [signal-registry.ts:669](lib/ta/signal-registry.ts#L669) | Multi-indikatör soft-vote fusion | ✅ Aktif |
| **Monte Carlo Tree Search** | [mcts-search.ts](lib/ta/mcts-search.ts) | Kombinatoriyel strateji keşfi | ✅ Aktif |
| **Mutual Information** | [mutual-information.ts](lib/ta/mutual-information.ts) | İndikatör-fiyat ilişkisi ölçümü | ✅ Aktif |
| **Hyperband** | [hyperband-search.ts](lib/ta/hyperband-search.ts) | Multi-fidelity bracket evaluator | ✅ Aktif |
| **Differential Evolution** | [differential-evolution.ts](lib/ta/differential-evolution.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Bayesian Optimization (TPE)** | [bayesian-optimizer.ts](lib/ta/bayesian-optimizer.ts) | Parametre optimizasyonu | ✅ Aktif |
| **Genetic Algorithm** | [ga-optimizer.ts](lib/ta/ga-optimizer.ts) | Joint indicator+param seçimi | ✅ Legacy (hala aktif) |
| **Trade Simulator** | [trade-simulator.ts](lib/ta/trade-simulator.ts) | Path-aware SL/TP/trailing | ✅ Aktif |
| **Portfolio Simulator** | [portfolio-simulator.ts](lib/ta/portfolio-simulator.ts) | Çoklu strateji portföy | ✅ Aktif |
| **Beta-Binomial Posterior** | strategy-optimizer.ts:914 | Win rate güven aralığı | ✅ Aktif |
| **Fitness Sharing (Niching)** | ga-optimizer.ts:738 | GA popülasyon çeşitliliği | ✅ Aktif |
| **Walk-Forward Split** | ga-optimizer.ts:182 | 70/30 train/test validasyonu | ✅ Kısmi |
| **Cross-Validator** | [cross-validator.ts](lib/ta/cross-validator.ts) | Cross-validation yardımcıları | ✅ Kısmi |
| **Diversity Ranker** | [diversity-ranker.ts](lib/ta/diversity-ranker.ts) | Strateji çeşitlilik sıralaması | ✅ Aktif |
| **Surrogate Optimizer** | [surrogate-optimizer.ts](lib/ta/surrogate-optimizer.ts) | Surrogate model optimizasyonu | ✅ Aktif |

### 4.2 Hyperband Multi-Fidelity Optimization

**Dosya:** [lib/ta/hyperband-search.ts](lib/ta/hyperband-search.ts)

**Kritik tasarım kuralı:** İndikatörler **her zaman TÜM seride hesaplanır.** Sadece DEĞERLENDİRME maskelenmiş alt kümelerde yapılır. Bu, path-dependent indikatörlerin (MACD, EMA, RSI) bütünlüğünü korur.

```
Parametreler:
  • η (eta) = 3 (downsampling rate)
  • R (max resource) = 500 bar
  • min resource = 50 bar

Bracket'ler:
  Bracket 0: %25 mask (en düşük fidelity, en hızlı)
    └── promoteCombos() → top 1/3 devam eder
  Bracket 1: %50 mask (orta fidelity)
    └── promoteCombos() → top 1/3 devam eder
  Bracket 2: %100 mask (tam değerlendirme) + DE parametre optimizasyonu
    └── Final sıralama: compositeScore DESC

Index Masking:
  • Fiziksel slicing YERİNE Uint8Array maske kullanılır
  • StratifiedIndexMask: veri yoğunluğunu korur, zamansal dağılımı bozmaz
```

### 4.3 Trade Simülasyonu — Path-Aware

**Dosya:** [lib/ta/trade-simulator.ts](lib/ta/trade-simulator.ts)

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

  Dönüş: { realizedReturnPct, mfe, mae, intraTradeMaxDD, exitReason, barsHeld,
  exitPrice }
```

#### Risk Profilleri ([strategy-optimizer.ts:540](lib/ta/strategy-optimizer.ts#L540))

| Profil | SL (ATR×) | TP (R) | Trailing (ATR×) | Cooldown | Eşik |
|--------|----------|--------|-----------------|----------|------|
| **TrendFollower** | 3.0 | 4.0 | 2.5 | 5 | 0.25 |
| **SwingTrader** | 2.0 | 2.5 | 1.5 | 3 | 0.30 |
| **Aggressive** (legacy) | 1.5 | 1.5 | 0.5 | 3 | 0.15 |
| **Balanced** (legacy) | 2.0 | 2.0 | off | 5 | 0.40 |
| **Conservative** (legacy) | 2.5 | 3.0 | off | 7 | 0.65 |

### 4.4 Dinamik Cooldown Mekanizması

Sinyal profiline göre adaptif cooldown hesaplanır:

```
getDynamicCooldown(atrValues, i, interval, profile):
  • Volatilite oranı: currentATR / avgATR(volatilityLookback)
  • Base cooldown: profile.baseCooldown
  • Cooldown = baseCooldown × (1 + γ × (volRatio - 1))
  • Clamp: [cooldownMin, cooldownMax]

Yönlü bypass: SELL sinyali, BUY pozisyonundayken cooldown'u aşabilir
(trende ters dönüşü kaçırmamak için).
```

### 4.5 İndikatör Keşif Havuzu

**Dosya:** [lib/ta/indicator-registry.ts](lib/ta/indicator-registry.ts)

```typescript
// Dinamik olarak INDICATOR_TO_ALLDATA_FIELD mapping'inden üretilir
export const DISCOVERY_POOL = detectAvailableIndicators();
// → ['ad', 'alma', 'ao', 'bb', 'cci', 'cmf', 'di', 'dmi', 'macd',
//    'madr', 'mfi', 'netvol', 'rsi', 'smi', 'stochrsi', 'wavetrend', 'wpr']
```

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

**Optimize edilebilir parametreler (Faz 19 sonrası):**

| İndikatör | Parametre | Aralık | Sabitler |
|-----------|----------|--------|---------|
| RSI | `rsi_len` | [5, 40] | ma_len=14 |
| MACD | `macd_fast` | [5, 40] | slow=26, signal=9 (fast<slow guard) |
| StochRSI | `stoch_rsi_len` | [5, 40] | k=14, smoothK=3, smoothD=3 |
| WaveTrend | `wt_avg_len` | [5, 40] | channel=21, ma=4 (**Faz 20.6:** n2 konumuna gönderiliyor) |
| DMI | `dmi_di_len` | [5, 40] | adx=14 |
| MFI | `mfi_period` | [5, 40] | — |
| SMI | `smi_long_len` | [5, 40] | short=5, signal=5 |
| CCI | `cci_len` | [5, 40] | ma=14 |
| WPR | `wpr_len` | [5, 40] | — |
| DI | `di_len` | [5, 40] | — |
| CMF | `cmf_len` | [5, 40] | — |
| MADR | `madr_len` | [5, 40] | — |
| ALMA | `alma_len` | [5, 40] | offset=0.85, sigma=6 |
| BOLLINGER | `bb_len` | [5, 40] | stdDev=2 |

**Not:** Her indikatör sadece 1 parametresini optimize eder. Bu kasıtlı bir basitleştirmedir. Çok parametreli optimizasyon DE/GA optimizer'ları tarafından strateji bağlamında yapılır.

### 4.7 Event Loop Yielding (Nefes Alma Noktaları)

Node.js single-threaded olduğu için ağır döngüler Event Loop'u bloke eder. Aşağıdaki noktalara `await new Promise(r => setTimeout(r, 0))` eklenmiştir:

| Konum | Frekans |
|-------|---------|
| [mcts-search.ts:450](lib/ta/mcts-search.ts#L450) | Her 20 MCTS simülasyonda bir |
| [hyperband-search.ts:256](lib/ta/hyperband-search.ts#L256) | Her 10 combo'da bir (bracket içi) |
| hyperband-search.ts:440 | Bracket'lar arası geçişte |
| ga-optimizer.ts:670 | Her 2 GA jenerasyonunda bir |
| functions.ts:493 | Her 5 indikatör hesaplamasında bir |

---

## 5. Güncel UI ve UX Durumu

### 5.1 Sayfa Haritası

| Rota | Sayfa | Açıklama |
|------|-------|----------|
| `/` | [app/(root)/page.tsx](app/(root)/page.tsx) | Ana dashboard |
| `/ta` | [app/(root)/ta/page.tsx](app/(root)/ta/page.tsx) | Teknik Analiz sayfası (390 satır) |
| `/ai` | [app/(root)/ai/page.tsx](app/(root)/ai/page.tsx) | AI Chat sayfası (279 satır) |
| `/portfolio` | [app/(root)/portfolio/page.tsx](app/(root)/portfolio/page.tsx) | Sanal portföy |
| `/watchlist` | [app/(root)/watchlist/page.tsx](app/(root)/watchlist/page.tsx) | İzleme listesi |
| `/archive` | [app/(root)/archive/page.tsx](app/(root)/archive/page.tsx) | Arşiv / raporlar |
| `/stocks/[symbol]` | [app/(root)/stocks/[symbol]/page.tsx](app/(root)/stocks/%5Bsymbol%5D/page.tsx) | Hisse detay sayfası |
| `/alerts/create` | [app/(root)/alerts/create/page.tsx](app/(root)/alerts/create/page.tsx) | Fiyat alarmı oluşturma |

### 5.2 TA Sayfası Bileşenleri

| Bileşen | Dosya | İşlev |
|---------|-------|-------|
| **BacktestMonitor** | [components/panels/BacktestMonitor.tsx](components/panels/BacktestMonitor.tsx) | Tek indikatör backtest sonuçları + "Optimize Et" butonu |
| **StrategyBacktestMonitor** | [components/panels/StrategyBacktestMonitor.tsx](components/panels/StrategyBacktestMonitor.tsx) | Strateji backtest sonuçları |
| **CustomStrategyPanel** | [components/panels/CustomStrategyPanel.tsx](components/panels/CustomStrategyPanel.tsx) | Kullanıcı strateji oluşturma (196 satır) |
| **CustomStrategyModal** | [components/panels/CustomStrategyModal.tsx](components/panels/CustomStrategyModal.tsx) | Strateji kaydetme modalı |
| **StrategyDiscoveryDialog** | [components/panels/StrategyDiscoveryDialog.tsx](components/panels/StrategyDiscoveryDialog.tsx) | Keşif başlatma dialog'u |
| **DeepDiscoveryProgress** | [components/ta/DeepDiscoveryProgress.tsx](components/ta/DeepDiscoveryProgress.tsx) | Keşif iş ilerleme çubuğu |
| **DeepDiscoveryResults** | [components/ta/DeepDiscoveryResults.tsx](components/ta/DeepDiscoveryResults.tsx) | Keşif sonuçları |
| **MarketTelemetryPanel** | [components/ta/MarketTelemetryPanel.tsx](components/ta/MarketTelemetryPanel.tsx) | Rejim analizi paneli |
| **MarketTelemetryButton** | [components/ta/MarketTelemetryButton.tsx](components/ta/MarketTelemetryButton.tsx) | Telemetry panelini açan buton |
| **TATimeframes** | [components/ta/TATimeframes.tsx](components/ta/TATimeframes.tsx) | Timeframe seçici (1d, 4h) |
| **TAIndicatorsButton** | [components/ta/TAIndicatorsButton.tsx](components/ta/TAIndicatorsButton.tsx) | İndikatör seçici |
| **TAStrategiesButton** | [components/ta/TAStrategiesButton.tsx](components/ta/TAStrategiesButton.tsx) | Strateji seçici |
| **TAIndicatorSettings** | [components/ta/TAIndicatorSettings.tsx](components/ta/TAIndicatorSettings.tsx) | İndikatör parametre ayarları |
| **TASearch** | [components/ta/TASearch.tsx](components/ta/TASearch.tsx) | Hisse sembolü arama |
| **IndicatorSection** | [components/ta/IndicatorSection.tsx](components/ta/IndicatorSection.tsx) | İndikatör panel grubu |
| **BacktestLogPanel** | [components/ta/BacktestLogPanel.tsx](components/ta/BacktestLogPanel.tsx) | Bar-bar debug log |
| **RegimeAccuracyTable** | [components/ta/RegimeAccuracyTable.tsx](components/ta/RegimeAccuracyTable.tsx) | Rejim bazlı doğruluk tablosu |
| **PortfolioSimChart** | [components/ta/PortfolioSimChart.tsx](components/ta/PortfolioSimChart.tsx) | Portföy simülasyon grafiği |

### 5.3 AI Chat Bileşenleri

| Bileşen | Dosya | İşlev |
|---------|-------|-------|
| **ChatArea** | [components/ai/ChatArea.tsx](components/ai/ChatArea.tsx) | Ana chat arayüzü (174 satır) |
| **FloatingChatButton** | [components/ai/FloatingChatButton.tsx](components/ai/FloatingChatButton.tsx) | Sayfa altı floating buton |
| **ModelSelector** | [components/ai/ModelSelector.tsx](components/ai/ModelSelector.tsx) | AI model/provider seçici |
| **GenerativeUI** | [components/ai/GenerativeUI.tsx](components/ai/GenerativeUI.tsx) | AI araç çağrısı sonuç render |
| **TradeConfirmationCard** | [components/ai/TradeConfirmationCard.tsx](components/ai/TradeConfirmationCard.tsx) | Trade onay kartı |
| **PortfolioStatusCard** | [components/ai/PortfolioStatusCard.tsx](components/ai/PortfolioStatusCard.tsx) | Portföy durum kartı |
| **IndicatorSignalsCard** | [components/ai/IndicatorSignalsCard.tsx](components/ai/IndicatorSignalsCard.tsx) | İndikatör sinyal kartı |
| **LiveAnalysisCard** | [components/ai/LiveAnalysisCard.tsx](components/ai/LiveAnalysisCard.tsx) | Canlı analiz kartı |
| **BacktestResultCard** | [components/ai/BacktestResultCard.tsx](components/ai/BacktestResultCard.tsx) | Backtest sonuç kartı |
| **IndicatorRankingCard** | [components/ai/IndicatorRankingCard.tsx](components/ai/IndicatorRankingCard.tsx) | MI sıralama kartı |
| **PriceSnapshotCard** | [components/ai/PriceSnapshotCard.tsx](components/ai/PriceSnapshotCard.tsx) | Fiyat anlık görüntü |
| **WatchlistSummaryCard** | [components/ai/WatchlistSummaryCard.tsx](components/ai/WatchlistSummaryCard.tsx) | İzleme listesi özeti |
| **NewsListCard** | [components/ai/NewsListCard.tsx](components/ai/NewsListCard.tsx) | Haber listesi |
| **AlertListCard** | [components/ai/AlertListCard.tsx](components/ai/AlertListCard.tsx) | Alarm listesi |
| **SearchResultsCard** | [components/ai/SearchResultsCard.tsx](components/ai/SearchResultsCard.tsx) | Arama sonuçları |
| **ThinkingSkeleton** | [components/ai/ThinkingSkeleton.tsx](components/ai/ThinkingSkeleton.tsx) | Yükleniyor iskeleti |
| **ToolProgress** | [components/ai/ToolProgress.tsx](components/ai/ToolProgress.tsx) | Araç ilerleme göstergesi |
| **MarkdownRenderer** | [components/ai/MarkdownRenderer.tsx](components/ai/MarkdownRenderer.tsx) | Markdown render |
| **ErrorCard** | [components/ai/ErrorCard.tsx](components/ai/ErrorCard.tsx) | Hata kartı |
| **ClarificationForm** | [components/ai/ClarificationForm.tsx](components/ai/ClarificationForm.tsx) | Açıklama formu |
| **ActionConfirmCard** | [components/ai/ActionConfirmCard.tsx](components/ai/ActionConfirmCard.tsx) | Aksiyon onay kartı |

### 5.4 "Optimize Et" Butonu — Güncel Durum

**Konum:** [components/panels/BacktestMonitor.tsx](components/panels/BacktestMonitor.tsx)

"Optimize Et" butonu `findBestParameter()` fonksiyonunu çağırarak seçili indikatörün parametresini brute-force optimize eder:

1. İndikatör parametresi [5, 40] aralığında taranır (örn: RSI periyodu 5'ten 40'a)
2. Her değer için `computeIndicator() → calculateWinRate()` çalıştırılır
3. En yüksek win rate'i veren parametre URL'ye yazılır → sayfa yeniden render

**Tasarım notu:** Bu butonun ürettiği `calculateWinRate()` değeri kavramsal olarak sınırlı anlam taşır — tek indikatörün her bar sinyal üretip 5 bar sonraki fiyata bakması, piyasanın yarı-etkin doğası gereği %50-55 aralığında sonuç verir. Asıl anlamlı optimizasyon, strateji keşif motoru (MCTS + Hyperband + DE) tarafından çoklu indikatör bağlamında yapılır.

### 5.5 Canlı Sinyal Paneli (`signals.ts`)

**Dosya:** [lib/ta/signals.ts](lib/ta/signals.ts)

`generateAllSignals()` fonksiyonu, her aktif indikatörün **anlık durumunu** gösterir:

- Her indikatör için BUY/SELL/NEUTRAL + güç seviyesi (STRONG/WEAK)
- Kullanıcıya "şu an bu indikatör ne söylüyor?" sorusunu yanıtlar
- DST fusion içermez — her indikatör bağımsız değerlendirilir

### 5.6 Ölü Kod (Hayalet Fonksiyonlar)

Kodda tanımlı ancak gerçek pipeline tarafından referans edilmeyen 9 fonksiyon:

| Fonksiyon | Konum | Açıklama |
|-----------|-------|----------|
| `isSqueezed()` | [signal-registry.ts:417](lib/ta/signal-registry.ts#L417) | BB/KC squeeze tespiti |
| `keltnerChannel()` | [signal-registry.ts:435](lib/ta/signal-registry.ts#L435) | Keltner Kanalı hesaplama |
| `volumeConfirms()` | [signal-registry.ts:456](lib/ta/signal-registry.ts#L456) | Hacim onayı |
| `obvBearishDivergence()` | [signal-registry.ts:500](lib/ta/signal-registry.ts#L500) | OBV bearish uyumsuzluk |
| `isVolumeClimax()` | [signal-registry.ts:546](lib/ta/signal-registry.ts#L546) | Hacim climax tespiti |
| `computePSR()` | [signal-registry.ts:582](lib/ta/signal-registry.ts#L582) | PSR hesaplama |
| `tripleBarrierLabel()` | [signal-registry.ts:638](lib/ta/signal-registry.ts#L638) | Triple barrier — `discovery-deep-search.ts`'den kullanılıyor olabilir |
| `checkSignal()` | [signal-registry.ts:738](lib/ta/signal-registry.ts#L738) | Unified dispatcher — gerçek pipeline `*Signal()` doğrudan çağırıyor |
| `calculateSMA()` | [backtest.ts:33](lib/ta/backtest.ts#L33) | Dosya içinde kullanılmıyor |

Bu fonksiyonlar planlanmış ancak bağlanmamış özelliklerdir. Kullanıcıya aktif çalıştıkları izlenimi verilmemelidir.

### 5.7 API Rotaları

| Rota | Dosya | Açıklama |
|------|-------|----------|
| `POST /api/chat` | [app/api/chat/route.ts](app/api/chat/route.ts) | AI Chat endpoint |
| `POST /api/analysis/market-telemetry` | [app/api/analysis/market-telemetry/route.ts](app/api/analysis/market-telemetry/route.ts) | Market Telemetry raporu |
| `POST /api/discovery/deep-search` | [app/api/discovery/deep-search/route.ts](app/api/discovery/deep-search/route.ts) | Deep Discovery başlatma |
| `GET /api/jobs/[jobId]` | [app/api/jobs/[jobId]/route.ts](app/api/jobs/%5BjobId%5D/route.ts) | Job durum sorgulama |
| `POST /api/portfolio/refresh-prices` | [app/api/portfolio/refresh-prices/route.ts](app/api/portfolio/refresh-prices/route.ts) | Portföy fiyat güncelleme |
| `GET /api/stock/logo` | [app/api/stock/logo/route.ts](app/api/stock/logo/route.ts) | Hisse logosu |
| `POST /api/inngest` | [app/api/inngest/route.ts](app/api/inngest/route.ts) | Inngest webhook |

### 5.8 Veritabanı Modelleri

| Model | Dosya | Açıklama |
|-------|-------|----------|
| **User** | Better Auth managed | Kullanıcı hesabı |
| **Watchlist** | [watchlist.model.ts](database/models/watchlist.model.ts) | Kullanıcı izleme listesi |
| **Trade** | [trade.model.ts](database/models/trade.model.ts) | Paper trading işlem kaydı |
| **Wallet** | [wallet.model.ts](database/models/wallet.model.ts) | Sanal cüzdan/bakiye |
| **Position** | [position.model.ts](database/models/position.model.ts) | Açık pozisyonlar |
| **PendingOrder** | [pending-order.model.ts](database/models/pending-order.model.ts) | Bekleyen emirler |
| **SavedStrategy** | [saved-strategy.model.ts](database/models/saved-strategy.model.ts) | Kaydedilmiş stratejiler |
| **ForwardTestStrategy** | [forward-test-strategy.model.ts](database/models/forward-test-strategy.model.ts) | İleri test stratejileri |
| **StrategyMeta** | [strategy-meta.model.ts](database/models/strategy-meta.model.ts) | Strateji meta verisi |
| **Report** | [report.model.ts](database/models/report.model.ts) | Analiz raporları |
| **SmartAlert** | [smart-alert.model.ts](database/models/smart-alert.model.ts) | Akıllı fiyat alarmı |
| **PriceAlert** | [price-alert.model.ts](database/models/price-alert.model.ts) | Fiyat alarmı |
| **AIJob** | [ai-job.model.ts](database/models/ai-job.model.ts) | Arka plan iş durumu |
| **Conversation** | [conversation.model.ts](database/models/conversation.model.ts) | AI sohbet geçmişi |
| **Message** | [message.model.ts](database/models/message.model.ts) | AI sohbet mesajı |
| **AnalysisNote** | [analysis-note.model.ts](database/models/analysis-note.model.ts) | Analiz notu |
| **Notification** | [notification.model.ts](database/models/notification.model.ts) | Kullanıcı bildirimi |

---

## 6. Gerçekçi Yol Haritası (Next Steps)

### 6.1 Öncelik Sıralaması

| # | Görev | Öncelik | Efor | Bağımlılık |
|---|-------|---------|------|-----------|
| 1 | **Market Telemetry → Keşif Motoru Entegrasyonu** | 🔴 Yüksek | 2-3 gün | Yok (altyapı hazır) |
| 2 | **Rejim-Adaptif Strateji Seçimi** | 🔴 Yüksek | 2-3 gün | #1 |
| 3 | **Walk-Forward Validation Pipeline** | 🟠 Orta | 3-4 gün | Yok |
| 4 | **Feature Redundancy Filtreleri** | 🟠 Orta | 2-3 gün | MI altyapısı var |
| 5 | **Haber Duygu Analizi → Strateji Sinyali** | 🟡 Düşük | 4-5 gün | AI entegrasyonu |
| 6 | **BIST Endeksi Entegrasyonu** | 🟡 Düşük | 1 hafta | Veri kaynağı araştırması |
| 7 | **Ölü Kod Temizliği (9 fonksiyon)** | 🟢 Kolay | 1 gün | Yok |

### 6.2 Detaylar

#### 6.2.1 Market Telemetry → Keşif Motoru

**Mevcut durum:** Market Telemetry API'si bağımsız çalışıyor. Ürettiği rejim bazlı indikatör performans verisi keşif motoru tarafından kullanılmıyor.

**Yapılacaklar:**
1. `indicator-evaluator.ts`, Telemetry API'den rejim verisini alacak
2. `runStrategyBacktest` içinde `evaluationMode: 'regime'` tam implemente edilecek
3. DST fusion'da rejime göre ağırlıklandırma aktif edilecek

**İlgili dosyalar:** [indicator-evaluator.ts](lib/ta/indicator-evaluator.ts), [strategy-optimizer.ts](lib/ta/strategy-optimizer.ts), [market-telemetry/route.ts](app/api/analysis/market-telemetry/route.ts)

#### 6.2.2 Rejim-Adaptif Strateji

**Hedef:** Piyasa rejimine göre otomatik strateji değiştirme:
- Trend piyasası → trend takipçileri (MACD, ADX, AO)
- Yatay piyasa → osilatörler (RSI, StochRSI, MFI, WPR)
- Volatil piyasa → volatilite indikatörleri + daha geniş stoplar

**Altyapı:** `classifyRegime()` (hazır), `indicator-evaluator.ts` (hazır), rejim bazlı güven skorları (hazır).

#### 6.2.3 Walk-Forward Validation

**Mevcut durum:** `cross-validator.ts` kısmi cross-validation yapıyor. `ga-optimizer.ts:182` 70/30 train/test split var. Tam walk-forward pipeline yok.

**Hedef:**
1. Veriyi N pencereye böl (örn: 10 yıl → 5×2 yıllık pencereler)
2. Her pencerede: optimize et → sonraki pencerede test et
3. Tüm pencerelerin ortalama performansını raporla
4. Aşırı uyum (overfitting) tespiti için out-of-sample metrikler

**Yeni dosya:** `lib/ta/walk-forward.ts`

#### 6.2.4 Feature Redundancy Filtreleri

**Hedef:** MCTS keşfi sırasında yüksek korelasyonlu indikatörlerin aynı stratejide bulunmasını engelle:
- RSI + StochRSI (her ikisi de momentum osilatörü)
- MFI + CMF (her ikisi de hacim bazlı)
- MACD + AO (her ikisi de momentum)

**Yaklaşım:** `diversity-ranker.ts` genişletilecek, MI bazlı redundancy skoru eklenecek.

#### 6.2.5 Haber Duygu Analizi

**Mevcut durum:** [lib/actions/finnhub.actions.ts](lib/actions/finnhub.actions.ts) içinde `getNews()` ile Finnhub haberleri çekiliyor. AI Chat bu haberleri okuyabiliyor ancak sayısal strateji sinyaline dönüşmüyor.

**Hedef:** Haber duygu skorunu (-1, +1) normalize edip DST fusion'a ek BBA olarak beslemek.

#### 6.2.6 BIST Entegrasyonu

**Mevcut durum:** Proje sadece ABD hisseleri (Finnhub/Yahoo Finance) destekliyor.

**Yaklaşım:** Yahoo Finance BIST sembolleri (`THYAO.IS`, `GARAN.IS` formatı) denenebilir. Finnhub BIST desteği araştırılacak.

#### 6.2.7 Mevcut Teknik Borçlar

| Borç | Açıklama | Öncelik |
|------|----------|---------|
| `lookForward` timeframe-agnostic | 5 bar hem 1d hem 4h için aynı | Düşük |
| MACD sadece fast optimize | slow ve signal parametreleri optimize edilmiyor | Düşük |
| BB offset kullanılmıyor | Parametre var ama implementasyon yok | Düşük |
| E2E testleri yok | Playwright altyapı kurulumu gerek | Orta |
| `country-data-list` paketi | Kullanılmıyor, silinebilir | Kolay |

---

## 7. Gelecek Vizyonu ve İleri Düzey Geliştirme Önerileri (Yeni Feature'lar)

Bu bölüm, kantitatif analiz ve sistem mimarisi perspektifinden projenin potansiyelini maksimize etmek için önerilen ileri düzey geliştirmeleri içerir.

### 7.1 Eksik Bağlantıyı Kurmak: Market Telemetry → Keşif Motoru Entegrasyonu
- **Konsept:** Piyasa rejimlerine göre hangi indikatörlerin işe yaradığını bulan Market Telemetry (Beta-Binomial hit rate) modülünün çıktılarını, MCTS (Monte Carlo Tree Search) algoritmasının `prior` (öncelik) ağırlıklarına doğrudan bağlamak.
- **Değer:** AI, strateji ararken körlemesine değil, o anki piyasa rejiminde istatistiksel olarak işe yarayan indikatörleri önceliklendirerek çok daha hızlı ve karlı stratejiler bulur.

### 7.2 Çoklu Zaman Dilimi (Multi-Timeframe - MTF) Analizi Filtreleri
- **Konsept:** DST (Dempster-Shafer) sinyal birleştirme motoruna üst zaman dilimi (higher timeframe) filtreleri eklemek. Örneğin; Günlük (1d) grafikte MACD trendi negatifken, 4 Saatlik (4h) grafikteki "Al" sinyallerini reddetmek.
- **Değer:** Sadece ana trend yönünde işlem yapılmasını sağlayarak (Trend Filter) zararlı trade'lerin ve gürültü kaynaklı kayıpların ("whipsaw") büyük bir kısmını otomatik olarak eler.

### 7.3 Dinamik Çıkış Stratejileri (Gelişmiş Trailing Stop)
- **Konsept:** Mevcut statik ATR tabanlı Stop-Loss ve Take-Profit seviyelerine ek olarak, trend takibi yapan dinamik çıkış mekanizmaları eklemek (*Chandelier Exit*, *Parabolic SAR*, *Supertrend*).
- **Değer:** "Piyasada asıl para girişte değil, çıkışta kazanılır" kuralı gereğince, "Aggressive" ve "TrendFollower" profillerinde kazanan pozisyonların kârının erken kesilmesini engeller ve trend bitene kadar taşınmasını sağlar.

### 7.4 Otonom Walk-Forward Optimizasyonu (Kayan Pencere Testi)
- **Konsept:** Mevcut optimizasyon motoruna dinamik bir "Walk-Forward" döngüsü eklemek. Modeli sürekli olarak eski verinin bir penceresinde eğitip (örn: 2 yıl), hemen ardındaki görünmeyen veride (out-of-sample, örn: 6 ay) test ederek pencereyi zaman içinde ileri kaydırmak.
- **Değer:** Bulunan stratejilerin aşırı uyumlu (overfit) olup olmadığını kanıtlar. Bu testten başarıyla çıkan stratejiler, gelecekte gerçek parayla işlem yapıldığında kârlı olma ihtimali en yüksek, gerçek dünyada en sağlam çalışacak modellerdir.

---

## Ek A: Kritik Dosya Referansları

| Dosya | Satır | İçerik |
|-------|-------|--------|
| [lib/indicators/_math.ts:149](lib/indicators/_math.ts#L149) | SMA `definedCount` bölme düzeltmesi |
| [lib/ta/signal-registry.ts:63-68](lib/ta/signal-registry.ts#L63) | `macdSignal()` |
| [lib/ta/signal-registry.ts:81-83](lib/ta/signal-registry.ts#L81) | `rsiSignal()` |
| [lib/ta/signal-registry.ts:150-152](lib/ta/signal-registry.ts#L150) | `mfiSignal()` — Faz 20.1 düzeltmesi |
| [lib/ta/signal-registry.ts:230-232](lib/ta/signal-registry.ts#L230) | `wprSignal()` — Faz 20.2 düzeltmesi |
| [lib/ta/signal-registry.ts:246-250](lib/ta/signal-registry.ts#L246) | `diSignal()` — Faz 20.3 düzeltmesi (eşik 1.0) |
| [lib/ta/signal-registry.ts:669-683](lib/ta/signal-registry.ts#L669) | `dempsterCombine()` |
| [lib/ta/signal-registry.ts:689-698](lib/ta/signal-registry.ts#L689) | `fuseAll()` |
| [lib/ta/signal-registry.ts:706-730](lib/ta/signal-registry.ts#L706) | `signalToBBA()` |
| [lib/ta/regime-detector.ts:123-202](lib/ta/regime-detector.ts#L123) | `classifyRegime()` |
| [lib/ta/regime-detector.ts:229](lib/ta/regime-detector.ts#L229) | `segmentRegimes()` (non-causal) |
| [lib/ta/mcts-search.ts:68-284](lib/ta/mcts-search.ts#L68) | `FlatMCTSTree` sınıfı |
| [lib/ta/mcts-search.ts:233-243](lib/ta/mcts-search.ts#L233) | `uct()` — UCT formülü |
| [lib/ta/mcts-search.ts:299-310](lib/ta/mcts-search.ts#L299) | `computeCompositeScore()` |
| [lib/ta/mcts-search.ts:411-584](lib/ta/mcts-search.ts#L411) | `mctsSearch()` ana döngü |
| [lib/ta/mutual-information.ts:376-553](lib/ta/mutual-information.ts#L376) | `computeMIPriorWeights()` |
| [lib/ta/hyperband-search.ts:100](lib/ta/hyperband-search.ts#L100) | Hyperband parametreleri |
| [lib/ta/trade-simulator.ts:83](lib/ta/trade-simulator.ts#L83) | `simulateTrade()` |
| [lib/ta/strategy-optimizer.ts:540](lib/ta/strategy-optimizer.ts#L540) | `PROFILE_CONFIGS` |
| [lib/ta/backtest.ts:40](lib/ta/backtest.ts#L40) | `calculateWinRate()` |

## Ek B: Faz 18-20 Kritik Düzeltme Özeti

| Faz | Tarih | Düzeltme | Etki |
|-----|-------|----------|------|
| 18.1 | 2026-06-07 | SMA `sum/period` → `sum/definedCount` | Tüm MA tabanlı indikatörler düzeldi |
| 18.2 | 2026-06-07 | Optimizer years `?? 1` → `?? 10` | Optimizer artık 10 yıl veri kullanıyor |
| 18.3 | 2026-06-07 | AO below-zero sinyal yönü düzeltildi | Backtest-ekran tutarlılığı |
| 19.1 | 2026-06-07 | Optimizer range'ler [5,40]'a genişletildi | Eski dar aralıklar düzeltildi |
| 20.1 | 2026-06-08 | MFI sinyalinden eşikler kaldırıldı | Güçlü trendde yanlış SELL düzeldi |
| 20.2 | 2026-06-08 | WPR sinyalinden eşikler kaldırıldı | Güçlü trendde yanlış SELL düzeldi |
| 20.3 | 2026-06-08 | DI eşiği `>0` → `>1.0` | DI her zaman BUY hatası düzeldi |
| 20.4 | 2026-06-08 | CMF `sumVol=0` → `value: undefined` | CMF sinyal gürültüsü azaldı |
| 20.5 | 2026-06-08 | MACD `fast ≥ slow` guard eklendi | Optimizer çakıştırıcı parametre düzeldi |
| 20.6 | 2026-06-08 | WaveTrend param n2 konumuna gönderildi | Doğru parametre optimize ediliyor |
| 20.7 | 2026-06-08 | BB offset `_offset` olarak işaretlendi | Kullanılmayan parametre belgelendi |
| 20.8 | 2026-06-08 | AD SMA cur hariç hesaplanıyor | Backtest ile canlı sinyal tutarlı |

---

> **Hazırlayan:** Claude (Kıdemli Sistem Mimarı ve Kantitatif Yazılım Mühendisi)  
> **Son güncelleme:** 2026-06-08  
> **Bu belge, aşağıdaki eski dokümanların yerine geçer:**  
> `CONCEPT_ROADMAP.md`, `TECHNICAL_REPORT.md`, `indicator_audit_report.md`,  
> `PROGRESS_REPORT.md`, `system-architecture-reference.md`, `about_project.md`,  
> `INDICATOR_STRATEGY_DESIGN_PHILOSOPHY.md`
