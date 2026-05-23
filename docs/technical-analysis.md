# Teknik Analiz Sistemi

> **Amaç:** Tüm teknik indikatörler, sinyal üretim mantığı, backtesting motoru, parametre optimizasyonu, strateji sistemi, mum formasyonları, fraktallar ve destek/direnç tespiti için eksiksiz referans.
> **Kapsam:** `lib/indicators/`, `lib/ta/` (compute, signals, backtest, optimizer, types), `app/(root)/ta/page.tsx`, `lib/constants/indicators.ts`
> **Ayrıca bakınız:** [[architecture#TA Sayfası Veri Akışı]], [[frontend]], [[backend]]
> **Son güncelleme:** 2026-05-22 (INDICATOR_REGISTRY merkezi sabit + lib/ta/ dosya yolu güncellemesi)

---

## İndikatör Kütüphanesi (`lib/indicators/`)

Tüm indikatörler **pure function**'dır — mum verilerini ve parametreleri alan, hesaplanmış seriler döndüren, yan etkisiz matematiksel fonksiyonlardır.
Veritabanı erişimi, API çağrısı veya mutasyon yapılmaz.

### Tüm Analiz Araçları (20 adet)

| # | Dosya | Araç | Tip | Girdiler |
|---|-------|------|-----|----------|
| 1 | `ad.ts` | Accumulation/Distribution | İndikatör | H, L, C, V |
| 2 | `alma.ts` | Arnaud Legoux Moving Average | İndikatör | C |
| 3 | `ao.ts` | Awesome Oscillator | İndikatör | H, L |
| 4 | `bollinger.ts` | Bollinger Bands | İndikatör | C |
| 5 | `cci.ts` | Commodity Channel Index | İndikatör | H, L, C |
| 6 | `cmf.ts` | Chaikin Money Flow | İndikatör | H, L, C, V |
| 7 | `demand_index.ts` | Demand Index | İndikatör | O, H, L, C, V |
| 8 | `dmi.ts` | Directional Movement Index | İndikatör | H, L, C |
| 9 | `macd.ts` | MACD | İndikatör | C |
| 10 | `madr.ts` | Moving Average Deviation Rate | İndikatör | C |
| 11 | `mfi.ts` | Money Flow Index | İndikatör | H, L, C, V |
| 12 | `net_volume.ts` | Net Volume | İndikatör | O, C, V |
| 13 | `rsi.ts` | Relative Strength Index | İndikatör | C |
| 14 | `smi.ts` | SMI Ergodic Indicator | İndikatör | C |
| 15 | `stochrsi.ts` | Stochastic RSI | İndikatör | C |
| 16 | `wavetrend.ts` | WaveTrend | İndikatör | H, L, C |
| 17 | `wpr.ts` | Williams %R | İndikatör | H, L, C |
| 18 | `candlePatterns.ts` | Candle Pattern Recognition | Formasyon | O, H, L, C |
| 19 | `historicalFractals.ts` | Historical Fractal Matching | Formasyon | O, H, L, C |
| 20 | `supportResistance.ts` | Support/Resistance Detection | Formasyon | H, L, C |

*Kısaltmalar: O=Open, H=High, L=Low, C=Close, V=Volume*

**Toplam:** 17 teknik indikatör + 3 formasyon/desen tanıma aracı = 20 analiz aracı.

---

## Sinyal Mantığı (indikatör başına)

Sinyaller `lib/ta/signals.ts` içinde `addSignal()` yardımcısı ile üretilir. TA sayfası ve AI Agent aynı sinyal motorunu paylaşır.

### Sinyal Seviyeleri
- **STRONG BUY** = +2
- **WEAK BUY** = +1
- **NEUTRAL** = 0
- **WEAK SELL** = -1
- **STRONG SELL** = -2

### Sinyal Koşulları (17 indikatörün tamamı)

| # | İndikatör | BUY Sinyali | SELL Sinyali |
|---|-----------|-------------|-------------|
| 1 | **MACD** | MACD çizgisi > Signal çizgisi (histogram yükseliyor → STRONG) | MACD çizgisi < Signal çizgisi (histogram düşüyor → STRONG) |
| 2 | **RSI** | RSI > MA (RSI < 30 → STRONG BUY) | RSI < MA (RSI > 70 → STRONG SELL) |
| 3 | **Stoch RSI** | K > D (K < 20 → STRONG BUY) | K < D (K > 80 → STRONG SELL) |
| 4 | **WaveTrend** | WT1 > WT2 (WT1 < -60 → STRONG BUY) | WT1 < WT2 (WT1 > 60 → STRONG SELL) |
| 5 | **DMI** | +DI > -DI (ADX > 20 → STRONG) | -DI > +DI (ADX > 20 → STRONG) |
| 6 | **MFI** | MFI < 20 (STRONG) veya yükseliyor (WEAK) | MFI > 80 (STRONG) veya düşüyor (WEAK) |
| 7 | **SMI** | SMI > Signal (histogram yükseliyor → STRONG BUY) | SMI < Signal (histogram düşüyor → STRONG SELL) |
| 8 | **AO** | Değer > 0 ve yükseliyor → STRONG BUY; Değer < 0 ve yükseliyor → WEAK BUY | Değer < 0 ve düşüyor → STRONG SELL; Değer > 0 ve düşüyor → WEAK SELL |
| 9 | **CCI** | CCI > MA (CCI < -100 → STRONG) | CCI < MA (CCI > 100 → STRONG) |
| 10 | **WPR** | < -80 (STRONG BUY) | > -20 (STRONG SELL), aksi halde yön karşılaştırması |
| 11 | **DI** | Değer > 0 ve yükseliyor → STRONG BUY; Değer > 0 ve düşüyor → WEAK BUY | Değer < 0 ve düşüyor → STRONG SELL; Değer < 0 ve yükseliyor → WEAK SELL |
| 12 | **CMF** | > 0.05 → STRONG BUY; 0 ile 0.05 arası → WEAK BUY | < -0.05 → STRONG SELL; -0.05 ile 0 arası → WEAK SELL |
| 13 | **A/D** | Fiyat, SMA(AD, 21)'in üstüne çıkar | Fiyat, SMA(AD, 21)'in altına düşer |
| 14 | **Net Volume** | > 0 ve yükseliyor | < 0 ve düşüyor |
| 15 | **MADR** | Negatiften pozitife geçer (STRONG) | Pozitiften negatife geçer (STRONG) |
| 16 | **ALMA** | Fiyat ALMA'nın üstüne çıkar | Fiyat ALMA'nın altına düşer |
| 17 | **Bollinger** | Alt bandın üstüne çıkar (STRONG) | Üst bandın altına düşer (STRONG) |

### Genel Sinyal Hesaplaması

```
totalScore = tüm sinyal skorlarının toplamı
avg = totalScore / signalCount

avg >= 1.5  → STRONG BUY   (yeşil glow)
avg >= 0.5  → WEAK BUY     (yeşil)
avg <= -1.5 → STRONG SELL  (kırmızı glow)
avg <= -0.5 → WEAK SELL    (kırmızı)
diğer       → NEUTRAL       (gri)
```

---

## Backtesting Motoru (`lib/ta/backtest.ts`)

### calculateWinRate()

Bir indikatörün sinyal doğruluğunu, sinyalden sonraki `lookForward` (varsayılan: 5 bar) mumda fiyatın tahmin edilen yönde hareket edip etmediğini kontrol ederek değerlendirir.

```
Her mum i için (bar 50'den length - lookForward'a):
  1. i barındaki indikatör durumuna göre sinyali belirle (BUY/SELL)
  2. close[i] ile close[i + lookForward]'ı karşılaştır
  3. BUY kazanır → futurePrice > currentPrice ise
  4. SELL kazanır → futurePrice < currentPrice ise
```

Dönüş: `{ winRate, totalSignals, wins, history: BacktestHistoryItem[] }`

> **Düzeltme 2026-05-21:** AD backtest'inde 21 günlük SMA hesaplanırken mevcut günün değeri yanlışlıkla SMA'ya dahil ediliyordu (veri sızıntısı). `for (let s = 0; s < 21; s++)` → `for (let s = 1; s <= 21; s++)` olarak düzeltildi. SMA artık yalnızca geçmiş veriden oluşur.

### Backtest'teki İndikatör Sinyal Mantığı

Backtest, TA sayfasındaki STRONG/WEAK ayrımı olmadan ikili (BUY/SELL) sınıflandırma kullanır.
Bazı indikatörler için backtest sinyal mantığı, sinyal üretim mantığından basitleştirilmiş farklara sahiptir:

| İndikatör | Backtest Sinyali | TA Sayfası Sinyali |
|-----------|-----------------|-------------------|
| DI | `cur > 0 → BUY, else → SELL` | 4 durumlu (işaret × yön) |
| AO | `curr > 0: rising → BUY, !rising → SELL; curr < 0: !rising → SELL, rising → BUY` | Aynı mantık + STRONG/WEAK |
| CMF | `val > 0 → BUY, else → SELL` | 3 eşikli (0.05/-0.05) |

**Desteklenen indikatörler (15):** MACD, RSI, STOCHRSI, WAVETREND, DMI, MFI, SMI, AO, CCI, WPR, DI, CMF, AD, NETVOL, MADR.

**Backtest kapsamı dışında olanlar (5):** ALMA, Bollinger, Candle Patterns, Fractals, Support/Resistance.

---

## Parametre Optimizasyonu (`lib/ta/optimizer.ts`)

### findBestParameter()

Brute-force optimizasyon: bir parametre aralığını tarar, her değer için indikatörü hesaplar, backtest çalıştırır, en yüksek win rate'e sahip parametreyi döndürür.

**Optimize edilebilir indikatörler (12):** RSI, MACD, STOCHRSI, WAVETREND, DMI, MFI, SMI, CCI, WPR, DI, CMF, MADR.

Her biri için:
- `param` — Query string parametre adı
- `range` — Test edilecek [min, max] aralığı
- `compute` — Deneme değeri ile çalıştırılacak fonksiyon
- `formatData` — Backtest tüketimi için çıktıyı normalize eder

---

## Strateji Sistemi

### Hazır Strateji: RSI + CCI + WaveTrend

URL parametrelerinde `strategy=rsi_cci_wt` ayarlandığında:
- RSI, CCI ve WaveTrend indikatörlerini otomatik aktive eder
- Bireysel sinyalleri hesaplar
- Strateji kararı: ÜÇÜ de aynı fikirde olmalıdır (hepsi BUY veya hepsi SELL)
- Bireysel sinyal dökümünü içeren birleşik strateji paneli görüntüler
- `StrategyBacktestMonitor` birleşik win rate'i hesaplar

### Özel Strateji (`CustomStrategyPanel` / `CustomStrategyModal`)

Kullanıcıların AND/OR mantığı ile herhangi bir indikatör kombinasyonunu seçerek özel stratejiler oluşturmasını sağlar.
Hesaplanan tüm indikatörlerden gelen veriler panele iletilir.

---

## Mum Formasyonu Tespiti (`lib/indicators/candlePatterns.ts`)

OHLC verilerinden klasik Japon mum formasyonlarını tespit eder (14KB).
Tespit edilen formasyonlar: doji, hammer, shooting star, engulfing (bullish/bearish),
morning star, evening star, harami, piercing line, dark cloud cover, ve diğerleri.

`ind` query parametresine `patterns` eklenerek aktive edilir.

Sonuçlar `CandlePatternPanel` bileşeninde görüntülenir.

---

## Tarihsel Fraktallar (`lib/indicators/historicalFractals.ts`)

Son N mumdaki fiyat desenine benzer tarihsel desenleri arar.
Yapılandırılabilir lookback ve benzerlik eşiği kullanır.
Benzer tarihsel desenlerden sonra ne olduğuna dayanarak ileriye yönelik bir "fraktal çizgisi" projekte eder.

Parametreler: `{ lookback: 30, similarityThreshold: 15, minPattern: 5 }`

`ind` query parametresine `fractals` eklenerek aktive edilir.

Sonuçlar `HistoricalFractalsPanel` bileşeninde görüntülenir.

---

## Destek & Direnç (`lib/indicators/supportResistance.ts`)

Swing high/low tespiti ve seviye kümeleme kullanarak anahtar destek ve direnç seviyelerini tespit eder.

`ind` query parametresine `sr` eklenerek aktive edilir.

Sonuçlar `SRPanel` bileşeninde görüntülenir.
