# Signalist Strateji Analizi & Evrim Planı — Tam Teşekküllü Rapor

> **Hazırlanma Amacı:** Bu rapor, Signalist uygulamasının mevcut strateji/backtest motorunun A'dan Z'ye nasıl çalıştığını, neden yetersiz kaldığını ve kullanıcının istediği yeni algoritma vizyonunu, başka yapay zeka modellerinin de eksiksiz anlayabileceği şekilde, soru-cevap formatında anlatmak için hazırlanmıştır.

---

## İçindekiler

1. [Mevcut Sistemin Tam Çalışma Prensibi](#1-mevcut-sistemin-tam-çalışma-prensibi)
2. [Mevcut Sistemin Matematiksel Detayları](#2-mevcut-sistemin-matematiksel-detayları)
3. [Mevcut Sistemin Limitasyonları — Neden Değişmeli?](#3-mevcut-sistemin-limitasyonları--neden-değişmeli)
4. [Kullanıcının Yeni Algoritma Vizyonu](#4-kullanıcının-yeni-algoritma-vizyonu)
5. [Soru-Cevap Bölümü](#5-soru-cevap-bölümü)
6. [Uygulama Yol Haritası](#6-uygulama-yol-haritası)
7. [Teknik Ek: Kod Referansları](#7-teknik-ek-kod-referansları)

---

## 1. Mevcut Sistemin Tam Çalışma Prensibi

### 1.1 Veri Akışı (Data Pipeline)

**Adım 1 — Veri Çekme:**
Kullanıcı bir hisse sembolü (ör. `AAPL`) ve zaman aralığı (`1d`, `4h`, `1wk`) seçer. Sistem, Finnhub API üzerinden (`lib/actions/finnhub.actions.ts`) OHLCV (Open, High, Low, Close, Volume) mum verilerini çeker. Örneğin 10 yıllık günlük veri → yaklaşık 2520 mum.

**Adım 2 — İndikatör Hesaplama:**
`lib/ta/compute.ts` → `computeIndicators()` fonksiyonu, çekilen OHLCV verisi üzerinde **17 adet teknik indikatörü** hesaplar. Bunlar:

| # | İndikatör | Kısaltma | Sinyal Mantığı |
|---|-----------|----------|----------------|
| 1 | RSI (Relative Strength Index) | `rsi` | RSI değeri ile MA'sının kesişimi |
| 2 | MACD | `macd` | MACD çizgisi ile sinyal çizgisinin kesişimi |
| 3 | WaveTrend (LazyBear) | `wavetrend` | wt1 ile wt2 çizgilerinin kesişimi |
| 4 | StochRSI | `stochrsi` | %K ile %D çizgilerinin kesişimi |
| 5 | DMI (Directional Movement Index) | `dmi` | +DI ile -DI çizgilerinin kesişimi |
| 6 | MFI (Money Flow Index) | `mfi` | Aşırı alım/satım bölgeleri (±20, ±80) |
| 7 | SMI (Stochastic Momentum Index) | `smi` | SMI ile sinyal çizgisinin kesişimi |
| 8 | AO (Awesome Oscillator) | `ao` | Sıfır çizgisi kesişimi + yön |
| 9 | CCI (Commodity Channel Index) | `cci` | CCI ile MA'sının kesişimi |
| 10 | WPR (Williams %R) | `wpr` | Aşırı alım/satım bölgeleri (-20, -80) |
| 11 | DI (Demand Index) | `di` | Sıfır çizgisi kesişimi |
| 12 | CMF (Chaikin Money Flow) | `cmf` | Sıfır çizgisi kesişimi |
| 13 | AD (Accumulation/Distribution) | `ad` | AD çizgisi ile SMA'sının kesişimi |
| 14 | Net Volume | `netvol` | Pozitif/negatif değer |
| 15 | MADR (Moving Average Deviation Ratio) | `madr` | Sıfır çizgisi kesişimi |
| 16 | ALMA (Arnaud Legoux MA) | `alma` | Fiyatın ALMA'yı kesişi |
| 17 | Bollinger Bands | `bb` | Alt/üst banttan dönüş |

Her indikatörün hesaplama kodu `lib/indicators/` altındadır. Ortak matematik fonksiyonları (EMA, SMA, SMMA) `lib/indicators/_math.ts` içindedir.

**Adım 3 — Sinyal Üretimi:**
`lib/ta/signal-registry.ts`, her indikatör için **3 seviyeli sinyal fonksiyonu** içerir:

- `*Signal()` → Basit yön: `"BUY"` | `"SELL"` | `null`
- `*Strength()` → Güç seviyesi: `"STRONG_BUY"` | `"WEAK_BUY"` | `"NEUTRAL"` | `"WEAK_SELL"` | `"STRONG_SELL"`
- `*Cross()` → Taze kesişim kontrolü: `boolean`

Örnek RSI sinyal mantığı (`signal-registry.ts:64-75`):
```
rsiSignal(rsi, rsiMa): rsi > rsiMa → BUY, değilse SELL
rsiStrength(rsi, rsiMa): rsi > rsiMa VE rsi < 30 → STRONG_BUY
                         rsi > rsiMa VE rsi >= 30 → WEAK_BUY
                         rsi < rsiMa VE rsi > 70 → STRONG_SELL
                         rsi < rsiMa VE rsi <= 70 → WEAK_SELL
```

### 1.2 Strateji Backtest Motoru (runStrategyBacktest)

`lib/ta/strategy-optimizer.ts:844-1236` — Sistemin kalbi buradadır. `runStrategyBacktest()` fonksiyonu şu adımları izler:

**A. Isınma (Warmup) Aşaması:**
İlk 50-55 mum (gün) atlanır. Bu, indikatörlerin yeterli veriyle hesaplanabilmesi içindir.

**B. Ana Döngü (Loop):**
Her mum (`i`) için, `startIndex` ile `candles.length - lookForward` arasında döngü çalışır:

1. **O anki fiyat:** `currentPrice = candles[i].close`
2. **Look-forward fiyatı:** `futurePrice = candles[i + lookForward].close` (ör. 14 gün sonraki kapanış)
3. **Piyasa Rejimi Tespiti:** `detectRegime()` ile o anki piyasa durumu belirlenir:
   - `uptrend` (yükseliş trendi)
   - `downtrend` (düşüş trendi)
   - `ranging` (yatay/konsolidasyon)
   - `volatile` (yüksek volatilite kırılımı)
   - `neutral` (nötr)
4. **Dinamik Cooldown:** `getDynamicCooldown()` ile ATR tabanlı oynaklığa duyarlı bekleme süresi hesaplanır.
5. **Sinyal Kararı:** İki farklı modda sinyal üretilir:

#### Mod A: Built-in Strateji (RSI_CCI_WT)

Sadece RSI, CCI ve WaveTrend indikatörleri kullanılır. **AND-chain (hepsi aynı fikirde) mantığı** ile çalışır:

```
buyVotes  = (RSI BUY mu?) + (CCI BUY mu?) + (WaveTrend BUY mu?)
sellVotes = (RSI SELL mi?) + (CCI SELL mi?) + (WaveTrend SELL mi?)
totalVoters = 3 (veya WaveTrend yoksa 2)

allAgree = (buyVotes === totalVoters) VEYA (sellVotes === totalVoters)
```

Eğer `allAgree = true` VE `anyFreshCross = true` ise sinyal üretilir. Bu **çok katı** bir filtredir — tüm indikatörlerin aynı anda aynı yönde sinyal vermesi gerekir.

#### Mod B: CUSTOM Strateji (Kombinatoryal Keşif)

Kullanıcının seçtiği herhangi bir indikatör kombinasyonu için **Dempster-Shafer Theory (DST) füzyon** mantığı ile çalışır (`signal-registry.ts:357-425`):

1. Her indikatörün sinyali → `signalToBBA()` ile **Basic Belief Assignment (BBA)**'a dönüştürülür:
   ```
   BUY sinyali → { buy: 0.6, sell: 0, uncertainty: 0.4 }
   SELL sinyali → { buy: 0, sell: 0.6, uncertainty: 0.4 }
   null → { buy: 0, sell: 0, uncertainty: 1.0 }
   ```
   (Belirsizlik, piyasa rejimine göre ±0.1-0.15 ayarlanır)

2. Tüm BBA'lar **Dempster's Rule of Combination** ile birleştirilir:
   ```
   conflict = a.buy × b.sell + a.sell × b.buy
   norm = 1 - conflict
   fused.buy = (a.buy × b.buy + a.buy × b.uncertainty + a.uncertainty × b.buy) / norm
   fused.sell = (a.sell × b.sell + a.sell × b.uncertainty + a.uncertainty × b.sell) / norm
   fused.uncertainty = (a.uncertainty × b.uncertainty) / norm
   ```

3. Birleşik inanç, **TRADE_THRESHOLD** eşiğini aşarsa sinyal üretilir:
   - `Aggressive`: eşik = 0.15 (düşük, çok sinyal)
   - `Balanced`: eşik = 0.40 (orta)
   - `Conservative`: eşik = 0.65 (yüksek, az sinyal)

4. Opsiyonel **taze kesişim (fresh crossover)** filtresi: Balanced/Conservative modda, son 7 barda en az bir indikatörün kesişim yapmış olması şarttır. Aggressive modda bu filtre kapalıdır.

**C. Cooldown (Bekleme Süresi) Kontrolü:**
Bir sinyal üretildikten sonra, `cooldownBars` kadar bar boyunca yeni sinyal üretilmez. Bu değer **dinamiktir** — ATR oynaklığına göre ayarlanır:
- Yüksek oynaklık → kısa cooldown (piyasa hızlı hareket ediyor)
- Düşük oynaklık → uzun cooldown (piyasa stabil, az sinyal)
- İstisna: BUY sinyalinden sonra SELL gelirse, cooldown **bypass** edilir (panik çıkış).

**D. Win/Loss Kararı (KRİTİK — Eleştirilen Kısım):**
```typescript
const isWin = (signal === "BUY" && futurePrice > currentPrice) 
           || (signal === "SELL" && futurePrice < currentPrice);
```

Yani:
- BUY sinyali → sadece `lookForward` gün sonraki fiyat > bugünkü fiyat ise WIN
- SELL sinyali → sadece `lookForward` gün sonraki fiyat < bugünkü fiyat ise WIN

**Aradaki hiçbir güne bakılmaz.** Fiyat %50 düşüp geri gelse, sistem bunu görmez.

**E. Çoklu Metrik Hesaplama:**
Backtest sonucunda sadece Win Rate değil, şu metrikler de hesaplanır:
- **Profit Factor:** Toplam kâr / Toplam zarar
- **Sharpe Ratio:** Yıllıklandırılmış (Welford online algoritması ile)
- **Avg Win / Avg Loss:** Ortalama kazanan/kaybeden işlem getirisi
- **Max Drawdown:** En yüksek tepeden en düşük vadiye düşüş
- **Total Return:** Kümülatif net getiri
- **Regime Breakdown:** Her piyasa rejimi için ayrı ayrı Win Rate

### 1.3 Discovery (Keşif) Motoru

Sistem, "en iyi indikatör kombinasyonunu" bulmak için iki ayrı keşif motoruna sahiptir:

#### Legacy discoverStrategy() — 4 Aşamalı Keşif

`strategy-optimizer.ts:1511-1638`:

1. **Phase 1 — Kombinasyon Üretimi:** 17 indikatörden 2'li, 3'lü, ..., 17'li tüm kombinasyonlar (`C(n,k)`). Toplam = 131.054 kombinasyon.
2. **Phase 2 — Hızlı Tarama:** Her kombinasyon 3 farklı lookForward (7, 14, 21) ile test edilir. En iyi sonucu veren lookForward saklanır. **MAX 500 kombinasyon** taranır (zaman sınırı: 5 saniye). En iyi 50'si bir üst tura geçer.
3. **Phase 3 — Genetik Algoritma (GA):** 150 bireylik popülasyon, 100 nesil boyunca evrimleşir. Hem indikatör seçimi hem parametreler birlikte optimize edilir.
4. **Phase 4 — Yerel İyileştirme (Local Refinement):** En iyi 5 GA sonucu, hill-climbing ile daha da iyileştirilir.

#### Yeni Deep Discovery Pipeline — 5 Aşamalı Keşif

`discovery-types.ts` ve Inngest job'ları üzerinden çalışan yeni pipeline:

1. **Phase 1 — Data Preparation:** Veri çekme ve indikatör hesaplama
2. **Phase 2 — MI Filter + MCTS Search:** Mutual Information ile en bilgi taşıyan indikatörler filtrelenir, Monte Carlo Tree Search ile kombinasyonlar aranır
3. **Phase 3 — Hyperband + DE Optimization:** Hyperband ile low-fidelity'de hızlı eleme, Differential Evolution ile parametre optimizasyonu
4. **Phase 4 — Strategy Portfolio Building:** Diversity ranking ile farklı büyüklükteki stratejiler dengeli şekilde seçilir
5. **Phase 5 — Cross-Validation + Kaydetme:** 5-fold cross-validation ile overfitting testi, risk badge ataması (🟢 Düşük, 🟡 Orta, 🔴 Yüksek)

### 1.4 Cross-Validation (Çapraz Doğrulama)

`cross-validator.ts:41-172`:

- Veri **5 eşit parçaya (fold)** bölünür
- Her fold için: 4 parça train, 1 parça test olarak kullanılır
- Train ve test Win Rate'leri hesaplanır
- **Overfitting Riski** = `1.0 - (avgTestWR / avgTrainWR)`
- Risk sınıflandırması:
  - `< %10` → 🟢 Düşük risk
  - `%10-25` → 🟡 Orta risk
  - `> %25` → 🔴 Yüksek risk

---

## 2. Mevcut Sistemin Matematiksel Detayları

### 2.1 Win Rate Formülü

```
WinRate = (Wins / TotalSignals) × 100

İşlem başına:
  BUY için:  isWin = (Close[t + lookForward] > Close[t])
  SELL için: isWin = (Close[t + lookForward] < Close[t])
```

Bu **binary (ikili) kayıp fonksiyonu**, regresyon problemine sınıflandırma gibi yaklaşır. Gerçekteki getiri büyüklüğünü tamamen göz ardı eder.

### 2.2 Dempster-Shafer Füzyon Matematiği

İki bağımsız kanıt kaynağı (indikatör A ve B) için birleştirme:

```
K (çatışma) = m₁(BUY) × m₂(SELL) + m₁(SELL) × m₂(BUY)

m₁₂(BUY) = [m₁(BUY)×m₂(BUY) + m₁(BUY)×m₂(Θ) + m₁(Θ)×m₂(BUY)] / (1-K)
m₁₂(SELL) = [m₁(SELL)×m₂(SELL) + m₁(SELL)×m₂(Θ) + m₁(Θ)×m₂(SELL)] / (1-K)
m₁₂(Θ) = [m₁(Θ) × m₂(Θ)] / (1-K)
```

Burada `Θ` (theta) belirsizliği temsil eder. Dempster kuralı **asimptotik olarak belirsizliği azaltır** — ne kadar çok indikatör birleşirse, kalan belirsizlik o kadar düşer. Ancak çatışma (`K`) yüksekse, sonuç güvenilmez olur.

### 2.3 Composite Score (Kombinasyon Sıralama)

```
CompositeScore = WinRate × √(TotalSignals)
```

Bu formül, hem yüksek başarı oranını hem de yeterli sinyal sıklığını ödüllendirir. Sadece 3 sinyalle %100 başarı → düşük skor. 500 sinyalle %65 başarı → yüksek skor.

### 2.4 Dinamik Cooldown Formülü

```
CD = ceil( baseCD × (avgATR / currentATR)^gamma )

baseCD: Profil baz cooldown (Aggressive: 3, Balanced: 5, Conservative: 7)
avgATR: Son 30 barın ortalama ATR'si
currentATR: O anki barın ATR'si
gamma: Oynaklık hassasiyeti (Aggressive: 1.0, Balanced: 0.7, Conservative: 0.5)

Clamp aralığı: Aggressive [1, 8], Balanced [2, 14], Conservative [3, 20]
```

### 2.5 Piyasa Rejimi Tespit Formülü

```
MA Slope = (SMA20[t] - SMA20[t-10]) / SMA20[t-10] × 100
Vol Ratio = CurrentATR / AvgATR(20 bar)
ADX Approx = (UpSum / (UpSum + DownSum)) × 100

Sınıflandırma:
  volatile:  VolRatio > 1.8
  uptrend:   |MA Slope| > 0.3% VE ADX > 60 VE Slope > 0
  downtrend: |MA Slope| > 0.3% VE ADX > 60 VE Slope < 0
  ranging:   |MA Slope| < 0.15% VE VolRatio < 1.2
  neutral:   diğer tüm durumlar
```

---

## 3. Mevcut Sistemin Limitasyonları — Neden Değişmeli?

### 3.1 "Look-Forward" Felaketi

Bu, sistemin **en büyük tasarım hatasıdır.** Backtest motoru (`runStrategyBacktest`, satır 1141-1145):

```typescript
const rawReturn = (futurePrice - currentPrice) / currentPrice;
const tradeReturn = signal === 'BUY' ? rawReturn : -rawReturn;
const isWin = tradeReturn > 0;
```

**Sadece 2 noktaya bakar:** `candles[i].close` ve `candles[i + lookForward].close`.

**Gerçek dünya senaryosu:**
```
Gün 1:  Fiyat = 100 TL → BUY sinyali
Gün 2:  Fiyat = 80 TL  (-%20 düşüş — margin call!)
Gün 3:  Fiyat = 75 TL  (-%25 düşüş)
...
Gün 14: Fiyat = 101 TL (+%1 artış)

Sistem Kararı: WIN ✅ (çünkü 101 > 100)
Gerçek Sonuç:  Portföy -%25 drawdown yaşadı, trader margin call yedi.
```

### 3.2 Aşırı Düşük Sinyal Sıklığı

"And-chain" (All Agree) mantığıyla:
- 3 indikatör aynı anda aynı yönü göstermeli
- Taze kesişim şartı (son 7 barda)
- Cooldown süresi (3-20 bar)

Sonuç: **Ayda 1-2 sinyal.** 10 yıllık veride belki 100-150 sinyal. Bu, swing trade için kabul edilemez.

Dempster-Shafer füzyonu bunu iyileştirir (Aggressive modda daha fazla sinyal), ancak temel "Look-Forward" problemi devam eder.

### 3.3 Piyasa Anatomisini Görmezden Gelme

Mevcut sistem, bir indikatörün sinyal üretme mekanizmasını, piyasanın gerçek hareketinden bağımsız olarak değerlendirir. Örneğin:

- RSI 30'un altına düştü → BUY sinyali
- Ama piyasa gerçekten yükselişe geçti mi? Bunu sadece 14 gün sonraki fiyata bakarak anlamaya çalışır.

Oysa indikatörlerin asıl değeri, **piyasanın farklı rejimlerinde farklı performans göstermeleridir:**
- RSI, yatay piyasada oversold/overbought dönüşlerinde iyidir
- MACD, trendli piyasada kesişimlerde iyidir
- WaveTrend, volatil kırılımlarda erken uyarı verir
- Bollinger, sıkışma ve genişlemede iyidir

Mevcut sistem, bu rejim-indikatör eşleşmesini **modellememektedir.**

### 3.4 Overfitting Riski (Filtrelenmeye Çalışılsa da)

Cross-validation ile overfitting filtrelense de, temeldeki "sadece 2 noktaya bakma" problemi, modelin gerçek dünyada işe yaramayan stratejileri "başarılı" olarak etiketlemesine yol açar. Overfitting filtresi, zaten hatalı bir ground truth üzerinde çalışmaktadır.

### 3.5 Fırsat Maliyeti

10 yıllık veride, "All Agree" filtresiyle:
- Belki 120 sinyal
- Her biri 14 günlük look-forward penceresinde değerlendiriliyor
- Yılda ortalama 12 işlem

Oysa piyasada:
- 10 yılda onlarca yükseliş trendi
- Onlarca düşüş trendi
- Yüzlerce konsolidasyon bölgesi
- Onlarca volatil kırılım

Bu fırsatların %95'i kaçırılıyor.

---

## 4. Kullanıcının Yeni Algoritma Vizyonu

### 4.1 Temel Felsefe Değişikliği

| Eski Yaklaşım | Yeni Yaklaşım |
|---|---|
| **Predictive (Tahmine Dayalı):** "İndikatörler sinyal verdi, geleceğe bakalım." | **Descriptive → Prescriptive (Betimleyici → Kuralcı):** "Fiyat nerede ne yapmış? Hangi indikatörler o noktada doğru çalışmış?" |
| Sinyal → Look-Forward Pencere → Win/Loss | Fiyat Anatomisi → Tersine Mühendislik → İndikatör Performans Haritası |
| Binary sınıflandırma (Win/Loss) | Çoklu rejim sınıflandırması (Trend tipleri) |
| İndikatör-merkezli | Fiyat-merkezli |

### 4.2 Aşama A: Fiyat Hareketlerinin Matematiksel Tespiti (Price Regime Detection)

**Amaç:** 10 yıllık OHLCV verisini tarayarak, piyasanın "gerçekten hareket ettiği" bölgeleri otomatik olarak tespit etmek.

**Tespit Edilecek 4 Temel Rejim:**

#### 1. Yükseliş Trendi (Uptrend)
**Matematiksel tanım:**
- Ardışık higher highs (HH) ve higher lows (HL) formasyonu
- 20 barlık SMA eğimi > X° (pozitif)
- Fiyat, 50 barlık MA'nın üzerinde
- Minimum süre: N bar
- Minimum fiyat değişimi: %Y

**Soru:** *"Bu hisse, bu tarih aralığında gerçekten yükselmiş mi? Ne kadar sürmüş? Ne kadar kazandırmış?"*

#### 2. Düşüş Trendi (Downtrend)
**Matematiksel tanım:**
- Ardışık lower highs (LH) ve lower lows (LL) formasyonu
- 20 barlık SMA eğimi < -X° (negatif)
- Fiyat, 50 barlık MA'nın altında
- Minimum süre: N bar
- Minimum fiyat değişimi: %Y

**Soru:** *"Bu düşüş ne zaman başlamış? Hangi seviyeye kadar inmiş? Ne kadar sürmüş?"*

#### 3. Konsolidasyon (Ranging / Yatay Piyasa)
**Matematiksel tanım:**
- Fiyat, belirli bir bant aralığında (ör. %5) sıkışmış
- SMA eğimi ≈ 0 (|eğim| < Z°)
- ATR düşük (ortalamanın altında)
- Minimum süre: N bar

**Soru:** *"Fiyat nerede sıkışmış? Bu sıkışma ne kadar sürmüş? Hangi yöne kırılmış?"*

#### 4. Ani Patlama / Çöküş (Volatile Breakout/Breakdown)
**Matematiksel tanım:**
- ATR, 20 barlık ortalamanın 2 katından fazla
- Tek bir barda %X'ten fazla hareket
- Ardından trend devamı veya tersi

**Soru:** *"Bu ani hareket neydi? Haber kaynaklı mı? Öncesinde hangi indikatörler uyarı verdi?"*

### 4.3 Aşama B: Tersine Mühendislik (Reverse Engineering)

Fiyat rejimleri tespit edildikten sonra, **her rejim başlangıç noktası için** şu analiz yapılacak:

#### Adım 1: Rejim Başlangıç Noktasını İşaretle
Örnek: 15 Mart 2020'de bir yükseliş trendi başlamış. Bu tarih `T0` olarak işaretlenir.

#### Adım 2: T0'dan Önceki İndikatör Durumunu Analiz Et
`T0 - N` ile `T0` arasındaki barlarda (ör. 5-10 bar öncesi):
- RSI ne durumdaydı? (Aşırı satımda mıydı? Yukarı dönüyor muydu?)
- MACD kesişim yapmış mıydı?
- WaveTrend wt1/wt2 kesişimi var mıydı?
- Bollinger alt bandına değip dönmüş müydü?
- DMI'da +DI, -DI'nin üzerine çıkmış mıydı?
- ... (tüm 17 indikatör için)

#### Adım 3: Başarılı Kombinasyonları Kaydet
Her rejim başlangıcı için, hangi indikatörlerin doğru sinyal verdiği bir **performans matrisine** kaydedilir:

| Rejim | Başlangıç Tarihi | RSI | MACD | WaveTrend | CCI | DMI | ... |
|-------|-----------------|-----|------|-----------|-----|-----|-----|
| Uptrend | 2020-03-15 | ✅ BUY | ✅ BUY | ❌ | ✅ BUY | ✅ BUY | ... |
| Uptrend | 2021-05-20 | ❌ | ✅ BUY | ✅ BUY | ❌ | ✅ BUY | ... |
| Downtrend | 2022-01-10 | ✅ SELL | ✅ SELL | ✅ SELL | ❌ | ✅ SELL | ... |
| Ranging | 2023-06-01 | ❌ | ❌ | ❌ | ❌ | ❌ | ... |

#### Adım 4: İstatistiksel Analiz
Bu matris üzerinden:
- **Hangi indikatör, hangi rejimde en başarılı?**
  - Ör: RSI → Uptrend başlangıçlarında %75 doğruluk, Downtrend'de %60
  - Ör: WaveTrend → Volatil kırılımlarda %85 doğruluk
- **Hangi indikatör kombinasyonu, hangi rejim için optimal?**
  - Ör: Uptrend için → RSI + MACD + DMI = %90 doğruluk
  - Ör: Ranging için → Bollinger + RSI = %70 doğruluk
- **Hangi rejimde hiçbir indikatör işe yaramıyor?**
  - Ör: Konsolidasyon bölgelerinde tüm indikatörler rastgele → bu bölgelerde işlem yapma!

### 4.4 Beklenen Çıktı Formatı

Sistem şu formatta bir rapor/JSON üretecek:

```json
{
  "symbol": "AAPL",
  "interval": "1d",
  "analysisPeriod": "2015-01-01 → 2025-01-01",
  "regimeMap": {
    "uptrends": [
      {
        "startDate": "2020-03-23",
        "endDate": "2020-09-02",
        "durationBars": 113,
        "priceChange": 0.82,
        "indicatorsAtStart": {
          "rsi": { "signal": "BUY", "correct": true, "barsBeforeSignal": 3 },
          "macd": { "signal": "BUY", "correct": true, "barsBeforeSignal": 1 },
          "wavetrend": { "signal": null, "correct": false },
          "dmi": { "signal": "BUY", "correct": true, "barsBeforeSignal": 0 }
        },
        "bestCombination": ["rsi", "macd", "dmi"],
        "bestCombinationAccuracy": 0.90
      }
    ],
    "downtrends": [...],
    "rangingZones": [...],
    "volatileBreakouts": [...]
  },
  "indicatorPerformanceByRegime": {
    "uptrend": { "rsi": 0.75, "macd": 0.70, "wavetrend": 0.55, "dmi": 0.80, ... },
    "downtrend": { "rsi": 0.60, "macd": 0.72, "wavetrend": 0.68, "dmi": 0.75, ... },
    "ranging": { "rsi": 0.45, "bollinger": 0.62, ... },
    "volatile": { "wavetrend": 0.85, "bb": 0.70, ... }
  },
  "optimalStrategies": [
    {
      "regime": "uptrend",
      "indicators": ["rsi", "macd", "dmi"],
      "accuracy": 0.90,
      "signalFrequency": "her 8 günde 1"
    },
    {
      "regime": "volatile",
      "indicators": ["wavetrend", "bb", "ao"],
      "accuracy": 0.85,
      "signalFrequency": "her 15 günde 1"
    }
  ]
}
```

### 4.5 Yeni Sistemin Avantajları

1. **Ground Truth Gerçek Fiyat Hareketleridir:** "14 gün sonra fiyat arttı mı?" değil, "Gerçekten bir yükseliş trendi mi başlamış?" sorusu sorulur.
2. **Rejim-Aware (Piyasa Durumuna Duyarlı):** Her indikatörün her rejimde farklı çalıştığı gerçeği modellenir.
3. **Fırsatları Kaçırmaz:** Tüm rejim başlangıçları taranır, sadece "indikatörlerin aynı anda sinyal verdiği" anlar değil.
4. **Yanlış Pozitifleri Azaltır:** Konsolidasyon bölgelerinde "işlem yapma" diyebilir.
5. **Açıklanabilir (Explainable):** "Bu strateji neden çalışıyor?" sorusuna cevap: "Çünkü yükseliş trendlerinin %90'ında RSI + MACD + DMI kombinasyonu doğru sinyal vermiş."

---

## 5. Soru-Cevap Bölümü

> Bu bölüm, raporu okuyan diğer yapay zeka modellerinin ve geliştiricilerin sistemi tam olarak anlaması için hazırlanmıştır.

### S: Mevcut sistem tam olarak nasıl çalışıyor?

**C:** Sistem, her mum (gün) için 17 indikatörden sinyal üretir. İki mod vardır:
1. **Built-in (RSI_CCI_WT):** AND-chain mantığı — tüm indikatörler aynı yönde sinyal vermeli. En katı mod.
2. **CUSTOM:** Dempster-Shafer Theory ile soft-voting. İndikatör sinyalleri Basic Belief Assignment'a dönüştürülür, Dempster kuralı ile birleştirilir. Eşik değerini aşarsa sinyal üretilir.

Sinyal üretildikten sonra, `lookForward` (varsayılan 14) gün sonraki fiyata bakılır. BUY sinyali için `futurePrice > currentPrice` ise WIN, değilse LOSS. **Aradaki günlerde ne olduğuna bakılmaz.**

### S: "Look-Forward" problemi tam olarak nedir?

**C:** Backtest motoru (`runStrategyBacktest`, `strategy-optimizer.ts:1141-1145`) sadece iki fiyat noktasını karşılaştırır:
```typescript
const isWin = tradeReturn > 0;
// tradeReturn = (Close[t+lookForward] - Close[t]) / Close[t]  (BUY için)
```

Bu, **path-independent (yoldan bağımsız)** bir değerlendirmedir. Oysa gerçek trading'de yol (path) her şeydir. Fiyatın %50 düşüp geri gelmesi, portföyü yok eder ama sistem bunu "WIN" sayar.

### S: Kullanıcı neden mevcut sistemden memnun değil?

**C:** Üç temel sebep:

1. **Az sinyal:** "All Agree" mantığıyla ayda 1-2 sinyal alınıyor. Swing trade stratejisi için bu kabul edilemez derecede düşük.
2. **Yanıltıcı başarı oranı:** Look-forward mantığı, aslında başarısız olan stratejileri "başarılı" gösterebiliyor (sahte pozitif).
3. **Gerçek piyasa dinamiğine uymuyor:** İndikatörlerin farklı piyasa koşullarında farklı çalıştığı gerçeği modellenmiyor.

### S: Kullanıcının istediği yeni sistem nasıl çalışacak?

**C:** İki aşamalı bir tersine mühendislik yaklaşımı:

**Aşama 1 — Fiyat Rejimi Tespiti:** 10 yıllık OHLCV verisi taranarak, fiyatın gerçekten nerede yükseldiği, düştüğü, yatay kaldığı veya ani hareket ettiği matematiksel olarak tespit edilecek. Bu bir "piyasa anatomisi haritası" oluşturacak.

**Aşama 2 — İndikatör Performans Analizi:** Her rejim başlangıç noktasında, geriye dönük olarak "hangi indikatörler bu hareketi önceden haber verdi?" sorusu sorulacak. Bu sayede her rejim için en iyi indikatör kombinasyonu istatistiksel olarak belirlenecek.

### S: Bu yeni yaklaşımın mevcut yaklaşımdan farkı nedir?

**C:** Temel fark, **ground truth'un (doğruluk referansının) değişmesidir:**

- **Eski:** Ground truth = `Close[t+14] > Close[t]` (binary, path-independent)
- **Yeni:** Ground truth = "Bu noktada gerçekten bir uptrend başlamış mı?" (rejim tabanlı, path-aware)

Bu, problemi bir **binary classification** probleminden **regime detection + indicator evaluation** problemine dönüştürür.

### S: Mevcut sistemdeki Dempster-Shafer füzyonu nedir?

**C:** Dempster-Shafer Theory (DST), belirsizlik altında kanıt birleştirme teorisidir. Bayes teoreminden farkı, **belirsizliği (uncertainty) açıkça modellemesidir.** Sistemde şöyle çalışır:

1. Her indikatör sinyali → `{buy: inanç, sell: inanç, uncertainty: 1-inanç}` formatına dönüşür.
2. Tüm BBA'lar pairwise olarak Dempster kuralı ile birleştirilir.
3. Birleşik inanç, eşik değerini aşarsa (Aggressive: 0.15, Balanced: 0.40, Conservative: 0.65) sinyal üretilir.

DST'nin avantajı: İndikatörler çatıştığında (biri BUY, diğeri SELL), sistem "kararsızım" diyebilir. Bu, salt majority voting'den daha güvenlidir.

### S: Yeni sistemde cross-validation ve overfitting koruması nasıl olacak?

**C:** Mevcut 5-fold cross-validation korunacak, ancak ground truth değişeceği için çok daha anlamlı hale gelecek:
- Eski: "5 fold'da da Win Rate tutarlı mı?" (ama Win Rate zaten hatalı ölçülüyor)
- Yeni: "5 fold'da da rejim tespitleri ve indikatör performansları tutarlı mı?"

Bu, overfitting'i çok daha gerçekçi şekilde ölçecek.

### S: Bu değişiklik kod tabanında ne kadar değişiklik gerektirir?

**C:** Köklü bir değişikliktir. Etkilenecek modüller:

| Modül | Değişiklik |
|-------|-----------|
| `lib/ta/strategy-optimizer.ts` | `runStrategyBacktest` fonksiyonu komple değişecek — Win/Loss mantığı yerine rejim eşleştirme |
| `lib/ta/backtest.ts` | `calculateWinRate` fonksiyonu kullanımdan kalkabilir veya tamamen yeniden yazılabilir |
| `lib/ta/combinatorial-search.ts` | Arama mantığı değişecek — artık kombinasyonlar rejim bazında değerlendirilecek |
| `lib/ta/cross-validator.ts` | Ground truth değişeceği için validation mantığı güncellenecek |
| **YENİ:** `lib/ta/regime-detector.ts` | Fiyat rejimlerini tespit edecek yeni modül |
| **YENİ:** `lib/ta/indicator-evaluator.ts` | Her rejim başlangıcında indikatör performansını ölçecek yeni modül |
| **YENİ:** `lib/ta/regime-strategy-builder.ts` | Rejim bazında optimal strateji inşa edecek yeni modül |
| `lib/ta/signal-registry.ts` | Büyük ölçüde aynı kalabilir (sinyal üretim mantığı değişmiyor) |
| `lib/ta/compute.ts` | Büyük ölçüde aynı kalabilir (indikatör hesaplama değişmiyor) |
| `lib/indicators/*` | Hiç değişmeyebilir (indikatör formülleri aynı) |

### S: Yeni sistemin hesaplama maliyeti ne olur?

**C:** İki aşamalı:

**Aşama 1 (Rejim Tespiti):** O(n) — tek geçişte tüm rejimler tespit edilebilir. 10 yıllık günlük veri (~2500 bar) için milisaniyeler.

**Aşama 2 (İndikatör Analizi):** Her rejim başlangıcı için N bar geriye bakılır. Tipik olarak 50-200 rejim başlangıcı × 5-10 bar × 17 indikatör. Hesaplama maliyeti düşük.

Toplam: Mevcut exhaustive combinatorial search'ten (131 bin kombinasyon) çok daha hızlı olacaktır.

### S: Yeni sistem, mevcut "Discovery" motorunun yerini mi alacak?

**C:** Evet, ancak kademeli olarak. Mevcut Discovery motoru (genetik algoritma, combinatorial search) tamamen kaldırılmayacak, ancak **ground truth değişecek.** Yani:

- Eski: "En iyi Win Rate'i veren kombinasyonu bul"
- Yeni: "Her rejim için en iyi indikatör kombinasyonunu bul"

Mevcut GA, Hyperband, DE gibi optimizasyon altyapıları, yeni ground truth ile beslenerek kullanılmaya devam edebilir.

### S: Kullanıcı bu yeni sistemden ne bekliyor?

**C:** Kullanıcının temel beklentisi:

1. **Daha fazla sinyal:** Ayda 1-2 değil, rejim başlangıçlarında güvenilir sinyaller.
2. **Daha gerçekçi backtest:** "14 gün sonra fiyat arttı mı?" değil, "Gerçekten kârlı bir trend yakalandı mı?"
3. **Rejim-aware stratejiler:** Yükselişte başka, düşüşte başka, yatayda başka strateji.
4. **Açıklanabilirlik:** "Bu strateji neden iyi?" → "Çünkü geçmiş 50 uptrend'in 45'inde doğru sinyal vermiş."

---

## 6. Uygulama Yol Haritası

### Faz 1: Rejim Tespit Motoru (Regime Detector)

**Hedef:** OHLCV verisinden 4 rejimi (uptrend, downtrend, ranging, volatile) otomatik tespit eden saf fonksiyon.

**Çıktı:**
```typescript
interface RegimePoint {
  startIndex: number;
  endIndex: number;
  startDate: string;
  endDate: string;
  type: 'uptrend' | 'downtrend' | 'ranging' | 'volatile';
  priceChange: number;     // % değişim
  durationBars: number;    // kaç bar sürdü
  confidence: number;      // 0-1 arası güven skoru
}
```

**Matematiksel yaklaşım:**
- Zigzag göstergesi benzeri pivot noktası tespiti
- Minimum % değişim ve minimum bar sayısı filtreleri
- MA slope, ATR ratio, ADX approximation ile doğrulama

### Faz 2: İndikatör Performans Değerlendiricisi

**Hedef:** Her rejim başlangıcında, N bar öncesindeki tüm indikatör sinyallerini analiz eden modül.

**Çıktı:**
```typescript
interface IndicatorPerformance {
  indicator: string;
  regime: string;
  accuracy: number;        // doğru sinyal / toplam rejim başlangıcı
  avgBarsBefore: number;   // sinyal rejim başlangıcından kaç bar önce geldi
  precision: number;       // true positive / (true positive + false positive)
  recall: number;          // true positive / tüm rejim başlangıçları
}
```

### Faz 3: Optimal Strateji İnşacısı

**Hedef:** Her rejim için en iyi N indikatörlü kombinasyonu belirleyen modül.

**Yaklaşım:**
- Her rejim için indikatörleri accuracy'ye göre sırala
- Top-N kombinasyonları test et
- Precision/recall dengesi ile en uygun kombinasyonu seç

### Faz 4: Mevcut Sisteme Entegrasyon

**Hedef:** Yeni rejim tabanlı strateji motorunu mevcut `runStrategyBacktest` ve Discovery pipeline'a entegre etmek.

**Strateji:**
- `runStrategyBacktest` fonksiyonuna yeni bir mod ekle: `evaluationMode: 'lookforward' | 'regime'`
- Discovery pipeline'da yeni ground truth kullan
- UI'da rejim bazlı strateji sonuçlarını göster

### Faz 5: Test ve Doğrulama

**Hedef:** Yeni sistemin mevcut sistemden daha iyi olduğunu kanıtlamak.

**Metrikler:**
- Rejim tespit doğruluğu (manuel etiketlenmiş veri ile karşılaştır)
- Yeni vs eski sinyal sıklığı
- Yeni vs eski strateji kârlılığı (walk-forward test)

---

## 7. Teknik Ek: Kod Referansları

### Temel Dosyalar ve Sorumlulukları

| Dosya | Sorumluluk |
|-------|-----------|
| `lib/ta/compute.ts` | 17 indikatörün hesaplanması (orkestratör) |
| `lib/ta/signal-registry.ts` | Her indikatör için sinyal/strength/cross fonksiyonları + DST füzyon |
| `lib/ta/signals.ts` | İndikatör sinyallerinden overall skor hesaplama |
| `lib/ta/backtest.ts` | Tek indikatör için basit backtest (`calculateWinRate`) |
| `lib/ta/strategy-optimizer.ts` | Ana backtest motoru (`runStrategyBacktest`) + keşif motoru (`discoverStrategy`) + parametre optimizasyonu (`optimizeStrategyParams`) |
| `lib/ta/combinatorial-search.ts` | Tüm kombinasyonları üretme ve paralel test etme |
| `lib/ta/cross-validator.ts` | 5-fold cross-validation ile overfitting tespiti |
| `lib/ta/ga-optimizer.ts` | Genetik algoritma ile joint optimization |
| `lib/ta/bayesian-optimizer.ts` | Bayesian TPE ile parametre optimizasyonu |
| `lib/ta/differential-evolution.ts` | Differential Evolution optimizasyonu |
| `lib/ta/mcts-search.ts` | Monte Carlo Tree Search |
| `lib/ta/mutual-information.ts` | Mutual Information filtresi |
| `lib/ta/discovery-types.ts` | Deep Discovery pipeline tip tanımları |
| `lib/ta/indicator-registry.ts` | Dinamik indikatör havuzu (DISCOVERY_POOL) |
| `lib/ta/types.ts` | Temel tip tanımları (ComputedIndicators, vb.) |
| `lib/ta/optimizer.ts` | Optimize edilebilir indikatörler ve zaman dilimi aralıkları |
| `lib/indicators/_math.ts` | EMA, SMA, SMMA temel matematik fonksiyonları |
| `lib/indicators/rsi.ts` | RSI hesaplama (Wilder's smoothing + confidence tracking) |
| `lib/indicators/macd.ts` | MACD hesaplama |
| `lib/indicators/wavetrend.ts` | WaveTrend (LazyBear) hesaplama + crossover tespiti |

### Ana Backtest Döngüsü (Pseudo-code)

```
function runStrategyBacktest(candles, strategyName, allData, config):
  wins = 0, totalSignals = 0, history = []
  lookForward = config.lookForward (varsayılan: 14)
  
  atrValues = computeATR(candles, 14)  // dinamik cooldown için
  
  for i = warmupStart to candles.length - lookForward:
    currentPrice = candles[i].close
    futurePrice = candles[i + lookForward].close
    
    regime = detectRegime(candles, i, atrValues)
    cooldown = getDynamicCooldown(atrValues, i, config)
    
    signal = null
    
    if strategyName == 'RSI_CCI_WT':
      // AND-chain: RSI + CCI + WaveTrend hepsi aynı yönde olmalı
      // artı taze crossover şartı
      signal = andChainVote(rsiSig, cciSig, wtSig, requireCrossover)
    
    else if strategyName == 'CUSTOM':
      // DST fusion: tüm seçili indikatörlerden BBA üret, Dempster ile birleştir
      bbas = []
      for each selectedIndicator:
        sig = getIndicatorSignal(indicator, i, data)
        bba = signalToBBA(sig, confidence=0.6, regime)
        bbas.push(bba)
      
      fused = fuseAll(bbas)  // Dempster's Rule of Combination
      
      if fused.buy > TRADE_THRESHOLD: signal = 'BUY'
      else if fused.sell > TRADE_THRESHOLD: signal = 'SELL'
    
    if signal AND cooldownOK:
      totalSignals++
      tradeReturn = signal == 'BUY' ? (futurePrice/currentPrice - 1) : (currentPrice/futurePrice - 1)
      isWin = tradeReturn > 0  // ← PROBLEM BURADA: sadece iki noktaya bakıyor
      if isWin: wins++
      history.push({ signal, price, futurePrice, isWin })
  
  winRate = (wins / totalSignals) * 100
  return { winRate, totalSignals, wins, history, profitFactor, sharpeRatio, ... }
```

---

> **Bu rapor, Signalist strateji motorunun mevcut durumunu, sorunlarını ve gelecek vizyonunu eksiksiz olarak belgelemek için hazırlanmıştır. Herhangi bir yapay zeka modeli, bu raporu okuyarak projenin strateji mimarisini, kullanıcının şikayetlerini ve istenen yeni sistemi tam olarak anlayabilir.**