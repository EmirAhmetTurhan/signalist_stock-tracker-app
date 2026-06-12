# İleri Düzey Geliştirmeler, Yapılacaklar (To-Do) ve Hata Düzeltme Raporu

Bu doküman, sistemin ileri düzey geliştirmeleri (Market Telemetry, MTF, Dinamik Çıkışlar, Walk-Forward Optimizasyon) uygulanırken dikkat edilmesi gereken riskleri, implementasyon önceliklerini ve en son giderilen kritik matematiksel/mantıksal hata raporlarını içerir.

---

## Mevcut Sistemde Dikkat Gerektiren Kısımlar (İyileştirmeler)

- [x] ~~**MFI ve WPR Sinyalleri:**~~ Faz 3'te kesişim tabanlıya geçildi. MFI: 50 eşik kesişimi, WPR: -50 eşik kesişimi. Yön tabanlı gürültü giderildi.
- [ ] **Deep Discovery Regresyonu (KRİTİK):** Faz 3 sinyal mimarisi sonrası keşif 8-10 stratejiden 1 stratejiye düştü. Sinyal sayıları 450-700'den ~116'ya geriledi. Bkz. Bölüm 10.
- [ ] **WaveTrend Parametre Swap'i:** `wtAvgLen`=21, `wtChannelLen`=10 (eskiden tam tersi). Bu değişikliğin WT1/WT2 kesişim sıklığına etkisi analiz edilmeli.
- [ ] **RSI STRONG_BUY Koşulu:** Kesişim tabanlı sinyale geçildiği için eski STRONG_BUY koşulları (`rsi > rsiMa && rsi < 30`) artık daha da nadir tetikleniyor. Gözden geçirilmeli.
- [ ] **5-Bar Lookforward (calculateWinRate):** Hem 1d hem 4h için aynı olması teknik borç olarak belgelenmiştir. Bu yolun (Yol A) kavramsal olarak sınırlı anlam taşıdığı kullanıcıya net iletilmelidir.
- [ ] **Sinyal Semantiği İkiliği:** Seviye tabanlı sinyaller (trend takibi) ve kesişim tabanlı sinyaller (giriş zamanlaması) farklı amaçlara hizmet eder. Backtest motorunun her iki sinyal tipini de kullanabilmesi için mimari değerlendirme gerekli.

---

## 1. Market Telemetry → MCTS Prior Entegrasyonu (Feature 7.1)
**Durum:** ✅ Tamamlandı (Faz 1.5 olarak Deep Discovery'ye eklendi ve DST `indicatorConfidences` üzerinden entegre edildi).

### Çözüm Özeti:
- Telemetry, doğrudan MCTS `prior` değerine çarpılmak yerine, DST fusion motoruna (`runStrategyBacktest`) özel bir `indicatorConfidences` map'i olarak aktarıldı.
- Böylece çift-prior çakışması veya exploration-exploitation dengesinin bozulması riski ortadan kaldırıldı.

---

## 2. Çoklu Zaman Dilimi (MTF) Filtreleri (Feature 7.2)
**Risk Seviyesi:** Yüksek (Lookahead Bias Riski) | **Bağımsız Başlanabilir mi?:** Hayır (Önce test altyapısı değişmeli)

### Yapılacaklar ve Riskler:
- [ ] **Lookahead Bias'ı (Geleceği Görme) Engellemek:** 4h verisinde saat 14:00 barını değerlendirirken gün sonu (1d) kapanışını kullanmak geleceği görmektir. **Çözüm:** En son tamamlanmış 1d barı (örneğin dünün kapanışı) kullanılmalıdır. Bu gecikme yaratır ama hileyi önler. Bu karar açıkça kod içine belgelenmelidir.
- [ ] **Timestamp Hizalaması (Alignment):** Finnhub verisinde 4h barının hangi 1d barına karşılık geldiği map edilmeli. Timezone (UTC vs Yerel saat) hatalarına karşı testler yazılmalı.
- [ ] **Backtest Altyapısını Güncellemek:** `runStrategyBacktest()` fonksiyonu ([lib/ta/strategy-optimizer/run-backtest.ts](lib/ta/strategy-optimizer/run-backtest.ts)) tek timeframe alıyor. Bunun `candles1d` ve `candles4h` alacak şekilde güncellenmesi ve Hyperband ile MCTS pipeline'ına yansıtılması gerekir. Bu feature **en sona bırakılmalıdır**.

---

## 3. Dinamik Çıkış Stratejileri (Feature 7.3)
**Risk Seviyesi:** Düşük | **Bağımsız Başlanabilir mi?:** Evet (Geriye dönük uyumlu — Faz 4 altyapısı hazır)

### Yapılacaklar ve Riskler:
- [ ] **Parabolic SAR Entegrasyonu:** SAR'ın "flip" anını izleyen bir state machine (isLong, ep, af) kurulmalı. SAR'ın başlangıç (seed) değerine çok dikkat edilmeli.
- [ ] **Chandelier Exit Entegrasyonu:** `Highest High(n)` hesaplaması için rolling max state takibi `simulateTrade()` ([lib/ta/simulation/trade-simulator.ts](lib/ta/simulation/trade-simulator.ts)) içine eklenmeli. Faz 4'te eklenen time-stop bypass altyapısı, bu entegrasyon için hazır bir zemin oluşturmaktadır.
- [ ] **Profil Konfigürasyonu:** Bu mekanizmaların `PROFILE_CONFIGS` içinde nasıl duracağına karar verilmeli. Yeni bir alan (`exitStrategy: 'chandelier' | 'sar' | 'supertrend' | 'atr'`) eklenebilir.
- [ ] **Uyumluluk Notu:** Yeni çıkış mekanizmaları sadece Yol B (`simulateTrade`) bağlamında çalışır. Yol A (`calculateWinRate`, 5-bar lookforward) ile uyumsuzluğu belgelenmeli.

---

## 4. Otonom Walk-Forward Optimizasyonu (Feature 7.4)
**Risk Seviyesi:** Orta (Inngest Timeout) | **Bağımsız Başlanabilir mi?:** Evet (Yeni dosya)

### Yapılacaklar ve Riskler:
- [ ] **Hesaplama Maliyeti ve Inngest Timeout'u:** MCTS × Hyperband × DE işlemlerinin 5 pencerede tekrarı Inngest limitlerini aşabilir. **Çözüm:** Walk-Forward işlemi mevcut `deepDiscoveryJob` içine değil, her pencerenin ayrı bir "step" olarak çalışacağı özel bir `walkForwardJob` Inngest fonksiyonuna entegre edilmelidir.
- [ ] **Sonuç Raporlama Stratejisi:** Her pencerede farklı kombinasyon kazanabileceği için, "tüm pencerelerde ortalamanın üzerinde performans gösterenleri" **Robust** olarak işaretleyen, tek pencerede iyi olanları "Overfit Riski" olarak sınıflandıran bir mantık kurulmalı.
- **Yeni dosya:** `lib/ta/walk-forward.ts`

---

## Özet Öncelik Sıralaması Önerisi

1. **Öncelik:** Walk-Forward Optimizasyonu (Yeni dosya, izole, inngest step mimarisi ile)
2. **Öncelik:** Dinamik Çıkış Stratejileri (`simulateTrade` içinde geriye uyumlu — Faz 4 altyapısı hazır)
3. **Son Öncelik:** MTF Filtreler (Altyapı değişimi ve lookahead riski çok yüksek, en sona bırakılmalı)

---

## 5. Canlı İşlem (Live Trading) Uyumluluk Raporu ve Eksiklikler

Sistem şu an çok iyi bir araştırma ve backtest platformu olmasına rağmen, tam otomatik bir ticaret platformu (Live Trading) olması için 5 ayrı katmanda yapısal eksiklikler barındırmaktadır:

| Mimari Katman | Mevcut Durum | Canlı Trading İçin Gerekli | Risk Durumu |
|---|---|---|---|
| **Veri Katmanı** | Finnhub REST API (Polling, ~5sn gecikme) | **WebSocket streaming** (Anlık tick/OHLCV push) | 🟠 Kısmen Hazır |
| **İndikatör Katmanı** | Toplu yeniden hesaplama (Her bar: tüm tarih işlenir) | **Artımlı hesaplama** (State yönetimi + resume) | 🟠 Kısmen Hazır |
| **Sinyal Motoru** | DST + MCTS + 17 ind. (Büyük ölçüde hazır) | **MTF Filtre + Rejim Seçimi** (Öncelikli İyileştirme) | 🟢 Hazır |
| **Risk Yönetimi** | ATR bazlı SL/TP + Pyramiding Prevention + Flat-Only (Faz 4) | **Kelly + DD Breaker** (Portföy seviyesi koruma) | 🟡 Gelişmiş (Faz 4 ile) |
| **Çalıştırma Katmanı** | Sanal Portföy (Kağıt işlem / Paper trading) | **Broker API Bağlantısı** (IBKR / Alpaca / BIST) | 🔴 Kritik Eksik |

---

## 6. Tam Otomasyona Geçiş Öncesi Pratik Adımlar (Aksiyon Planı)

Sistemi tam otomatik ticarete almadan önce (veya sinyal destekli manuel işlem yaparken) kaliteyi hızla artıracak ve riskleri düşürecek kısa-orta vadeli adımlar:

### Hızlı Kazanımlar (Ölü Kodların Canlandırılması)
- [ ] **BB Squeeze (Daralma) Tespiti:** [lib/ta/registry/signal-registry.ts](lib/ta/registry/signal-registry.ts)'deki `isSqueezed()` ve `keltnerChannel()` fonksiyonları aktif edilip pipeline'a bağlanmalı. Momentum patlamalarını önceden tespit etmek için en güvenilir yöntemdir.
- [ ] **Hacim Onayı:** `volumeConfirms()` fonksiyonu aktif edilmeli.
- [ ] **Uyumsuzluk (Divergence) Tespiti:** Fiyat yeni tepe yaparken RSI veya MACD yapmıyorsa bu güçlü bir dönüş sinyalidir. `obvBearishDivergence()` konsepti üzerinden RSI ve MACD divergence tespiti DST'ye ek inanç (BBA) olarak beslenmeli.

### Mantıksal Filtreler ve Risk Yönetimi
- [ ] **VWAP Filtresi:** Gün içi (örneğin 4h) işlemlerde kurumsal referans noktası VWAP'tır. "Fiyat VWAP'ın altındayken AL sinyallerini filtrele" kuralı eklenmeli.
- [ ] **Kelly Criterion ile Pozisyon Boyutlandırma:** Her pozisyona ne kadar bakiye ayrılacağı sezgisel olmamalı. Formül: `f* = (b*p - q) / b` (b: kazanç/kayıp oranı, p: win rate, q: kaybetme olasılığı). Muhafazakar başlamak için `f*/2` (Half-Kelly) uygulanmalı.

### Devreye Alma (Deployment) Süreci
- [ ] **Shadow Mode (İzleme Modu) Testi:** Broker'a bağlamadan önce sistem 4-6 hafta canlı çalıştırılıp sinyaller veritabanına (`ForwardTestStrategy`) kaydedilmeli. Backtest'teki beklentiler canlı veride kanıtlanmadan (out-of-sample forward test) gerçek parayla işleme geçilmemeli.
- [ ] **Manuel Yarı-Otomasyon:** Başlangıçta sistemin doğrudan emir iletmesi yerine, güçlü bir sinyal oluştuğunda (Örn: "GARAN, Uptrend, %67 Güven") kullanıcıya bildirim atıp son onayın (execution) kullanıcı tarafından broker üzerinden manuel yapılması kurgulanmalı.

---

## 7. 09.06.2026 Tarihli Hata ve Hata Düzeltme Raporu (Bug Report & Fixes)

Sistemin matematiksel bütünlüğünü, telemetri API tutarlılığını ve strateji optimizasyon modelinin backtest motoruyla tam senkronizasyonunu sağlamak amacıyla 5 kritik gösterge ve API hatası giderilmiştir.

### 🔴 BUG #1: AD (Accumulation/Distribution) SMA Desenkronizasyonu (Kritik)
*   **Hata Tanımı:** AD göstergesinin 21 periyotluk SMA'sı hesaplanırken, `backtest.ts` ve `signals.ts` güncel barı SMA'ya dahil etmiyorken; `strategy-optimizer.ts` güncel barı hesaba dahil etmekteydi.
*   **Çözüm:** Tüm AD SMA hesaplamaları **güncel barı DAHİL edecek** şekilde standarda kavuşturuldu. Isınma barlarının veri limitleri tüm ilgili modüllerde `21` olarak eşitlendi.

### 🔴 BUG #2: CustomStrategyPanel Isınma (Warmup) Sahte BUY Sinyali (Kritik)
*   **Hata Tanımı:** İndikatörlerin ısınma evresinde (ilk 20 bar) `getLastSignal()` fonksiyonları `"—"` (tanımsız) dönüyordu. CustomStrategyPanel karar aşamasında `validSignals` dizisi boş kaldığında sahte `✓ BUY` kararı basılıyordu.
*   **Çözüm:** Karar mekanizmasının en başına `total === 0` durumunda doğrudan `CONFLICT` (nötr) karar dönmesini sağlayan bir koruma barı eklendi.

### 🔴 BUG #3: Telemetri API Parametre Eşleşmeme Hatası (Kritik)
*   **Hata Tanımı:** `/api/analysis/market-telemetry/route.ts` dosyasında varsayılan parametreler `PARAM_DEFAULTS_NUM` objesinden çekilirken, merkezi kayıt dosyası `indicator-params.ts` içindeki anahtarlarla uyuşmayan isimlendirmeler kullanılıyordu.
*   **Çözüm:** API rotasındaki tüm parametre isimleri ve fallback değerleri `indicator-params.ts` merkezi kaydı ile tam uyumlu hale getirildi.

### 🔴 BUG #4: SMI (Stochastic Momentum Index) Isınma Dönemi Sapması (Yüksek)
*   **Hata Tanımı:** `smi.ts` dosyasındaki `rollingHighest` ve `rollingLowest` fonksiyonları sınır kontrolü içermediğinden, veri serisinin başındaki yetersiz bar sayısında kararsız osilatör sinyalleri üretiyordu.
*   **Çözüm:** Fonksiyonlara sınır kontrolü (`i < period - 1`) eklenerek ısınma döneminde `undefined` dönmesi sağlandı ve EMA hesaplamalarının temiz başlaması garantilendi.

---

## 8. 10.06.2026 Tarihli Faz 1: Kritik Hata Düzeltmeleri ve Güvenlik Raporu (Phase 1 Fixes)

Faz 1 kapsamında, sistemde tespit edilen ve stability, doğruluk, performans ya da güvenlik zafiyetine yol açan 16 kritik bug/hata giderilmiştir.

### 🔴 BUG #1: Server Action Sunucu Tarafı Veri Çekimi
*   **Hata Tanımı:** Server action'ların istemciden milyonlarca veri noktasından oluşan `candles` ve `allData` dizilerini HTTP POST body ile serileştirerek alması `413 Payload Too Large` hatasına sebep oluyordu.
*   **Çözüm:** Bu action'lar istemciden sadece `symbol` ve `interval` alacak şekilde refaktör edildi. Mum ve indikatör verileri tamamen sunucu tarafında çekilip hesaplanır hale getirildi.

### 🔴 BUG #2: `sanitizeAllData` Mantık Hatası
*   **Hata Tanımı:** Optimizasyon butonu her tetiklendiğinde çalışan `JSON.parse(JSON.stringify)` derin kopyalama işlemi typed array'leri boş nesnelere dönüştürüyordu.
*   **Çözüm:** `sanitizeAllData` tamamen kaldırıldı ve typed array/numeric bütünlük sağlandı.

### 🟠 BUG #3: Zombie Inngest İşleri
*   **Hata Tanımı:** Inngest sunucusu çevrimdışı olduğunda event dispatch hatası sessizce yutuluyor ve iş "queued" durumunda zombi olarak asılı kalıyordu.
*   **Çözüm:** Hata durumunda veritabanında iş durumu `'failed'` olarak işaretlendi.

### 🔴 BUG #4: Sabit 55 Bar Warmup Kısıtı
*   **Hata Tanımı:** Kısa veri kümelerinde warmup periyodunun sabit 55 bar olması, verinin önemli bir kısmının kaybedilmesine yol açıyordu.
*   **Çözüm:** Warmup başlangıç indeksi, veri setinin boyutuna göre dinamik ölçeklenecek şekilde güncellendi: `Math.min(55, Math.floor(candles.length * 0.15))`.

### 🟠 BUG #5: İndikatör Kesişim (Crossover) Matematiksel Hataları
*   **Hata Tanımı:** Kesişim formüllerinde, hareketli eşikler sanki sabitmiş gibi davranılıp yanlış karşılaştırmalar yapılıyor ve sinyaller desenkronize oluyordu.
*   **Çözüm:** Tüm crossover fonksiyonları dinamik olarak karşılaştıracak şekilde `(prev <= prevSma && cur > curSma)` mantığıyla düzeltildi.

### 🔴 BUG #6: Server Action'larda Authentication Güvenlik Açığı
*   **Hata Tanımı:** `runBacktestAction` ve `optimizeStrategyAction` aksiyonlarında Better Auth oturum kontrolü yoktu.
*   **Çözüm:** Yetkisiz istekleri engellemek için `auth.api.getSession` doğrulaması eklendi.

### 🔴 BUG #7: Look-ahead (Bars) Giriş Alanı Fokus Kilidi
*   **Hata Tanımı:** Strateji oluştururken Look-ahead bars değeri boşaltılmak istendiğinde anlık olarak `14`'e geri sıfırlanma (reset) ve yazarken `60` değerine kilitlenme (clamp lock) hatası.
*   **Çözüm:** `lookForwardInput` için geçici string state kullanılarak serbest tek haneli rakam girişi sağlandı; doğrulamalar `onBlur` (odak kaybı) anına taşındı.

---

## 9. 10.06.2026 Tarihli Faz 2: Mimari Yeniden Yapılandırma ve Sadeleştirme Raporu (Phase 2 Refactoring)

Bu aşamada projedeki flat dosya yığılması (flat directory bloat), monolitik büyük dosyalar ve God Component'ler mantıksal alt parçalara bölünmüş ve Clean Architecture yapısına uygun olarak yeniden yapılandırılmıştır.

### 🟢 Yapılan İyileştirmeler:
1. **Merkezi Test Hiyerarşisi:** Unit test dosyaları (`*.test.ts`) kaynak kodlardan arındırılarak merkezi `__tests__/indicators/` ve `__tests__/ta/` dizinlerine taşındı.
2. **Mantıksal Alt Dizin Gruplaması:** `lib/ta` altındaki flat dosyalar `optimization/`, `registry/` ve `simulation/` alt dizinlerine dağıtıldı.
3. **Optimizasyon Monolitinin Bölünmesi:** `strategy-optimizer.ts`; `run-backtest.ts`, `optimize-params.ts`, `discover-strategy.ts` ve `types.ts` olarak mantıksal dosyalarına bölünerek ana dosya sadece re-export wrapper'ına dönüştürüldü.
4. **Finnhub Monolitinin Bölünmesi:** `lib/actions/finnhub.actions.ts` dosyası `base.ts`, `candles.ts`, `news.ts` ve `search.ts` olarak alt dosyalara bölündü.
5. **Arayüz Modülerizasyonu:** 
   * Devasa `TAStrategiesButton.tsx` bileşeni hooks ve modüler alt bileşenlere parçalandı (Bkz. `components/strategies/`).
   * `CustomStrategyModal.tsx` modalı parçalanarak `IndicatorSelector.tsx`, `SavedStrategiesList.tsx` ve `DeleteConfirmDialog.tsx` olarak ayrıştırıldı.
6. **Bileşen Gruplaması:** `components/ta/` altındaki flat UI dosyaları `common/`, `controls/`, `discovery/` ve `panels/` alt klasörlerine yerleştirildi.

---

## 10. 10.06.2026 Tarihli Faz 3: Sinyal Mimarisi Güncellemesi ve Keşif Regresyonu (Phase 3 Signal Architecture & Discovery Regression)

### 🟡 REGRESYON: Deep Discovery Sinyal Sayısı Düşüşü (Kritik — Devam Ediyor)

**Belirti:**
- Deep Discovery artık 8-10 strateji yerine **sadece 1 strateji** buluyor (116 sinyal).
- Strateji sinyal sayıları 450-700'den ~92-116'ya düştü.
- Keşif süresi 30-40 saniye (normal).

**Kök Neden Analizi:**

Bu regresyon **3 bağımsız katmanın birleşimiyle** oluştu:

#### Katman 1: Sinyal Fonksiyonları Kesişim Tabanlıya Geçti (%80 Etki)

**Dosya:** `lib/ta/registry/signal-registry.ts`

17 indikatörün `*Signal()` fonksiyonu seviye tabanlıdan kesişim tabanlıya dönüştürüldü:

```
ESKİ (Seviye Tabanlı):
  rsiSignal(rsi, rsiMa) → rsi > rsiMa ? "BUY" : "SELL"
  Her barda sinyal üretir → barların ~%50'sinde sinyal

YENİ (Kesişim Tabanlı):
  rsiSignal(rsi, rsiMa, prevRsi, prevRsiMa) →
    prevRsi <= prevRsiMa && rsi > rsiMa ? "BUY" : null
  Sadece kesişim anında sinyal → barların ~%3-5'inde sinyal
```

**Etki zinciri:**
1. Her indikatör ~%3-5 sıklıkla sinyal üretiyor (önceden ~%50)
2. 2+ indikatörlü stratejide aynı anda kesişim olasılığı: %0.03 × %0.03 = ~%0.09 (önceden %25)
3. DST fusion için yeterli BBA birikmiyor → `TRADE_THRESHOLD` aşılamıyor
4. Strateji `MIN_SIGNALS_THRESHOLD = 20` altında kalıyor → eleniyor

#### Katman 2: MCTS Keşif Parametreleri Daraltıldı (%15 Etki)

**Dosya:** `lib/inngest/discovery-deep-search.ts`

| Parametre | Eski Değer | Yeni Değer | Azalma |
|-----------|-----------|-----------|--------|
| `DEFAULT_MCTS_ITERATIONS` | 200 | **100** | %50 |
| `DEFAULT_MCTS_MAX_NODES` | 500 | **300** | %40 |
| `DEFAULT_MCTS_MAX_DEPTH` | 5 | **4** | 1 seviye |

Keşif alanı yaklaşık 3 kat daraldı. Daha az kombinasyon değerlendiriliyor.

#### Katman 3: Telemetri Güven Skorları ve Path-Aware Simülasyon (%5 Etki)

- **Yeni dosya:** `lib/ta/telemetry-utils.ts` — `computeTelemetryConfidences()` her indikatör için rejim bazlı güven skoru hesaplar, [0.3, 0.9] aralığına clamp'ler.
- **Path-aware simülasyon:** `evaluationMode: 'pathaware'` ile SL/TP/trailing stop + %0.10 işlem maliyeti.
- Düşük güven skorları BBA kütlesini düşürür → sinyal eşiği aşılamaz.

#### Ek Faktör: WaveTrend Parametre Swap'i

**Dosyalar:** `lib/ta/compute.ts`, `lib/constants/indicator-params.ts`, `lib/constants/indicators.ts`

- `wtAvgLen`: 10 → **21**, `wtChannelLen`: 21 → **10**
- `compute.ts` içinde argüman sırası da değişti → WT eğrisi tamamen farklı
- WT1/WT2 kesişim sıklığı etkilendi

#### Neden "Filtre Ayarlarıyla" Çözülemez?

Sinyal fonksiyonlarındaki değişiklik bir **filtre/parametre** değişikliği değil, **sinyal semantiği** değişikliğidir. Eski fonksiyonlar "indikatör şu anda hangi yönde?" sorusuna cevap verirken, yeniler "indikatör yeni bir yöne mi döndü?" sorusuna cevap verir. Bu iki soru tamamen farklı bilgiler ölçer.

- Eski: Trend takibi için sürekli sinyal (pozisyonda kalmak için uygun)
- Yeni: Giriş zamanlaması için kesişim sinyali (pozisyona girmek için uygun)

Her ikisi de değerlidir ancak farklı amaçlara hizmet eder. Backtest motoru (`runStrategyBacktest`) giriş+çıkış mantığını bu sinyal semantiği üzerine kurduğu için, salt filtre/parametre ayarıyla eski sinyal sayısına ulaşmak mümkün değildir.

### 🟢 Faz 3'te Eklenen Yeni Özellikler

1. **Trade Marker'ları (Grafik Üzerinde Al/Sat):** Strateji backtest sonucu (`runStrategyBacktest().history`) fiyat grafiği üzerinde yeşil/kırmızı oklarla gösterilir. `CandleChartSection` → `LightweightCandleChart` → `series.setMarkers()`.

2. **Overlay İndikatör Toggle:** Bollinger Bands ve ALMA için grafik üzerinde göz ikonlu aç/kapat butonları. `ChartOverlayToggle` + `CandleChartSection`. `series.applyOptions({ visible })` ile chart yeniden oluşturulmadan kontrol.

3. **Barrel Export Güncellemesi:** `lib/ta/index.ts`'e `extractTradeMarkers` ve `TradeMarker` tipi eklendi.

### Yeni Dosyalar (Faz 3)

| Dosya | Amaç |
|-------|------|
| `components/ta/panels/CandleChartSection.tsx` | Chart + toggle state client wrapper |
| `components/ta/controls/ChartOverlayToggle.tsx` | BB/ALMA toggle buton barı |

### Değişen Dosyalar (Faz 3 — Mevcut Durum)

| Dosya | Değişiklik |
|-------|-----------|
| `lib/ta/registry/signal-registry.ts` | Tüm `*Signal()` ve `*Strength()` fonksiyonları kesişim tabanlı |
| `lib/ta/signals.ts` | `extractTradeMarkers()`, `TradeMarker` tipi, tüm bölümler `>= 2` + `prev*` kontrollü |
| `lib/ta/last-signal.ts` | Tüm `getLastSignal` case'leri `prev*` değerlerini çıkarıp geçiyor |
| `lib/ta/indicator-evaluator.ts` | Aynı şekilde `prev*` değerleri |
| `lib/ta/strategy-optimizer/run-backtest.ts` | `evalModeForMetrics`, `winRate`, `profitFactor` değişkenleri düzeltildi; `SimulatedTrade` import eklendi |
| `lib/ta/compute.ts` | WaveTrend argüman sırası değişti |
| `lib/constants/indicator-params.ts` | `wtAvgLen`=21, `wtChannelLen`=10 |
| `lib/constants/indicators.ts` | Aynı şekilde |
| `lib/ta/types.ts` | `BBResult.time`: `string\|number` → `number` |
| `lib/inngest/discovery-deep-search.ts` | MCTS: 100 iterasyon, 300 düğüm, 4 derinlik |
| `lib/ta/telemetry-utils.ts` | **Yeni** — Telemetri güven skorları |
| `lib/ta/index.ts` | Barrel export güncellendi |
| `components/charts/LightweightCandleChart.tsx` | `tradeMarkers`, `showBB`, `showALMA` prop'ları; ref-bazlı visibility |
| `components/panels/CustomStrategyPanel.tsx` | `Candle` tipi `@/lib/ta/types`'ten import |
| `app/(root)/ta/page.tsx` | `runStrategyBacktest()` ile trade marker hesaplama; `CandleChartSection` kullanımı |

---

## 11. 10.06.2026 Tarihli Sprint 3: Arayüz Düzeltmeleri, Senkronizasyon ve Yönlendirme Uyuşmazlığı Raporu (Sprint 3 UI, Sync & Discrepancy Fixes)

Bu sprint kapsamında, kullanıcı arayüzünde tespit edilen Bollinger Bantları dolgu gizleme hatası, Trade Marker asenkron yüklenme/senkronizasyon hatası, görsel tasarım kalınlık/boyut karmaşıklığı ve "Go to TA" butonuyla aktarım yapıldığında ortaya çıkan başarı oranı ve sinyal uyuşmazlığı giderilmiştir.

### 🔴 BUG #1: Bollinger Bantları Mavi Dolgu (Volatilite Gölgesi) Gizleme Hatası
*   **Hata Tanımı:** Bollinger Bantları katmanı göz ikonuyla kapatıldığında üst, alt ve orta çizgiler başarıyla gizleniyor; ancak bantların arasını dolduran mavi arka plan volatilite gölgesi grafik üzerinde kalmaya devam ediyordu.
*   **Çözüm:** `LightweightCandleChart.tsx` içerisindeki custom canvas çizici olan `BandsFillPrimitive` sınıfının `draw` fonksiyonunun en başına `if (!this.series.options().visible) return;` kontrolü eklendi. Böylece seri gizlendiğinde dolgu alanı da otomatik olarak gizlenmektedir.

### 🔴 BUG #2: Trade Markers ve S/R Çizgileri İlk Yüklemede Çizmeme Hatası (Senkronizasyon)
*   **Hata Tanımı:** Sayfa ilk yüklendiğinde grafik kütüphanesi dinamik import ile asenkron yüklendiği için, marker yerleştirme ve S/R çizgilerini çizme `useEffect` tetikleyicileri çalıştığında seri referansları henüz `null` oluyordu. Bu sebeple sayfa ilk açıldığında oklar görünmüyor, ancak katman kapatılıp tekrar açıldığında görünüyordu.
*   **Çözüm:** `LightweightCandleChart.tsx` bileşenine `chartReady` state variable'ı eklendi. Asenkron grafik kurulumu (`useLightweightChart`) bittiğinde bu state `true` yapılmaktadır. Bu state overlay ve marker `useEffect` bağımlılıklarına eklenerek, sayfa ilk yüklendiğinde asenkron kurulum bittiği anda tüm görsel katmanların ve okların gecikmesiz çizilmesi sağlandı.

### 🟠 BUG #3: Trade Markers Görsel Kalınlık ve Boyut Karmaşıklığı (Estetik Düzeltme)
*   **Hata Tanımı:** Grafik uzak plandayken oklar küçük görünmesine rağmen, yakınlaştırıldığında ok çizgileri ve metin etiketleri çok kaba ve kalın kalarak okunabilirliği zorlaştırıyordu.
*   **Çözüm:** Trade marker boyutları `size: 2` değerinden `size: 1` değerine düşürüldü. Patern marker boyutları maksimum `1` ile sınırlandırıldı. Alış (BUY) giriş marker'larının rengi tema yeşili olan `#0FEDBE` rengine çekilerek finansal grafik okunabilirliği ve arayüz estetiği üst seviyeye çıkarıldı.

### 🔴 BUG #4: Keşif Raporu ile TA Sayfası Arasındaki Win Rate ve Sinyal Uyuşmazlığı (Discrepancy)
*   **Hata Tanımı:** Keşif motoru stratejileri tararken `mode='majority'` ayarını kullanırken, "Go to TA" butonuna basılıp TA sayfasına yönlendirme yapıldığında bu mod parametresi URL'de taşınmıyordu. Bu sebeple TA sayfası varsayılan olarak `mode='all'` moduna düşüyor, bu da aynı strateji için rapordaki 395 sinyal / %44.3 winrate yerine TA sayfasında 393 sinyal / %75 hit rate gibi farklı ve hatalı sonuçlar görünmesine yol açıyordu.
*   **Çözüm:** `app/(root)/archive/reports/[id]/page.tsx` içerisindeki `handleGoToTA` yönlendirme fonksiyonuna URL query parametresi olarak `mode='majority'`, `evalMode='pathaware'` ve keşfe ait `profile` parametresi eklendi. TA sayfası artık keşifle birebir senkronize çalışarak uyuşmazlığı tamamen çözmüştür.

### 💡 Mimari Not: Localhost CPU Kilitlenmesi / Donma Problemi
*   **Analiz:** Keşif motoru çalışırken localhost üzerinde dashboard veya arama sayfalarının donması, lokal geliştirme ortamında Next.js'in tek bir Node.js işleminde (single-threaded event-loop) çalışması ve CPU yoğun Hyperband/MCTS aramalarının bu iş parçacığını bloke etmesinden kaynaklanır.
*   **Sunucu Çözümü:** Sistem uzak bir sunucuya (VPS/Cloud) taşındığında, Next.js web sunucusu (PM2/Serverless) ile arka plan görevlerini tetikleyen Inngest worker'ları tamamen farklı sunucu/konteyner süreçlerinde izole olarak çalışacaktır. Bu mimari izolasyon sayesinde, sunucu tarafında arama yapılırken kullanıcı arayüzünde en ufak bir donma veya kilitlenme yaşanmayacaktır.

### Değişen Dosyalar (Sprint 3 — Son Durum)

| Dosya | Değişiklik |
|-------|-----------|
| `components/charts/LightweightCandleChart.tsx` | `BandsFillPrimitive` dolgu kontrolü, `chartReady` state entegrasyonu, ok boyutu ve renk optimizasyonları |
| `app/(root)/archive/reports/[id]/page.tsx` | `handleGoToTA` yönlendirme fonksiyonuna `mode`, `evalMode` ve `profile` parametrelerinin eklenmesi |
| `docs/FEATURES_TODO_AND_DEBUG_REPORTS.md` | Sprint 3 değişiklikleri ve hata raporu eklendi |

---

## 12. 11.06.2026 Tarihli Faz 4: Trade Simulator Motoru Mantıksal Güncellemeleri ve UI/UX Terminal İyileştirmeleri (Phase 4 Trade Engine & Terminal UX)

Bu faz kapsamında, backtest motorunun gerçek bir trader gibi davranmasını sağlayan dört kritik mantıksal kural eklenmiş ve kullanıcı arayüzü profesyonel bir trading terminali seviyesine çıkarılmıştır.

---

### Bölüm A: Trade Simulator Motoru Mantıksal Güncellemeleri

#### 🟢 FEATURE #1: Pyramiding Prevention (Aşırı İşlem Engelleme)

*   **Amaç:** İçeride aktif bir pozisyon varken aynı yönde yeni sinyallerin filtrelenerek pyramiding (üst üste pozisyon açma) davranışının tamamen engellenmesi.
*   **Uygulama:** `runStrategyBacktest()` fonksiyonuna `activePosition` state değişkeni eklendi ([run-backtest.ts:737-741](lib/ta/strategy-optimizer/run-backtest.ts#L737-L741)). Her sinyal değerlendirilirken `isSameDirectionAsActive` kontrolü yapılır — aktif pozisyonla aynı yöndeki sinyaller `null` olarak işaretlenir ([run-backtest.ts:841-847](lib/ta/strategy-optimizer/run-backtest.ts#L841-L847)).
*   **State Yaşam Döngüsü:**
    1. Pozisyon açıldığında `activePosition = { type, entryIndex, exitIndex }` set edilir.
    2. `i > activePosition.exitIndex` olduğunda state temizlenir (`null`).
    3. Pozisyon kapalıyken (`null`) yeni sinyaller normal şekilde değerlendirilir.
*   **Etki:** Backtest motoru artık gerçek bir trader gibi "içeride işlem varken ek işlem açmaz". Bu, özellikle güçlü trendlerde aşırı risk alımını engeller.

#### 🟢 FEATURE #2: Flat-Only Kuralı (Testere Koruması)

*   **Amaç:** Bir pozisyon ters sinyalle (opposite signal) kapandığında, aynı bar üzerinde veya çıkış bar'ına kadar anında ters yönlü yeni işlem açılmasının engellenmesi.
*   **Uygulama:** `isOppositeDirectionOnExitBar` kontrolü eklendi ([run-backtest.ts:842-847](lib/ta/strategy-optimizer/run-backtest.ts#L842-L847)). `activePosition` mevcutken ve `i <= exitIndex` iken, aktif pozisyonun tersi yöndeki sinyaller engellenir.
*   **Davranış:**
    - BUY pozisyonu SELL sinyali ile kapandı → sistem FLAT konuma geçer.
    - Aynı bar'da veya exit bar'a kadar yeni SELL sinyali → **ENGELLENİR**.
    - `i > exitIndex` sonrası → yeni sinyaller normal değerlendirilir.
*   **Etki:** Testere (whipsaw) piyasalarında art arda zarar eden işlemlerin önüne geçilir. Sistem "bekle ve gör" yaklaşımıyla bir sonraki kaliteli fırsatı bekler.

#### 🟢 FEATURE #3: Time-Stop Bypass — Trend Rider (Trende Tutunma)

*   **Amaç:** Pozisyon kârdayken ve Trailing Stop aktifken, time-stop bariyerinin ezilerek (bypass) sistemin trendin sonuna kadar işleme tutunmasının sağlanması.
*   **Uygulama:** `simulateTrade()` fonksiyonundaki time-stop kontrolüne koşullu bypass eklendi ([trade-simulator.ts:223-228](lib/ta/simulation/trade-simulator.ts#L223-L228)):
    ```typescript
    if (i >= entryIndex + riskConfig.timeStopBars) {
        const isTrailingStopActiveAndInProfit =
            riskConfig.useTrailingStop && pnlPct > 0;
        if (!isTrailingStopActiveAndInProfit) {
            return buildResult(i, 'time_stop');
        }
    }
    ```
*   **Aktif Olduğu Profiller:**
    | Profil | Trailing Stop | Time-Stop Bypass |
    |--------|--------------|-----------------|
    | TrendFollower | ✅ (2.5 ATR) | ✅ Aktif |
    | SwingTrader | ✅ (1.5 ATR) | ✅ Aktif |
    | Aggressive | ✅ (0.5 ATR) | ✅ Aktif |
    | Balanced | ❌ | ❌ (normal time-stop) |
    | Conservative | ❌ | ❌ (normal time-stop) |
*   **Etki:** Güçlü trendlerde erken çıkış engellenir. Pozisyon, trailing stop seviyesine gelene veya opposite signal oluşana kadar trende tutunur. Bu, özellikle TrendFollower profilinde "trendin sonuna kadar binme" (trend riding) davranışını mümkün kılar.

#### 🟢 FEATURE #4: Negatif Fiyat Koruması (Matematiksel Güvenlik)

*   **Amaç:** Yüzdelik getiri hesaplamalarında `Math.abs(entryPrice)` kullanılarak teorik negatif fiyat senaryolarına karşı işaret hatalarının önlenmesi.
*   **Uygulama:** İki kritik noktada koruma eklendi:
    - [trade-simulator.ts:125](lib/ta/simulation/trade-simulator.ts#L125): `const rawReturn = (exitPrice - entryPrice) / Math.abs(entryPrice);`
    - [run-backtest.ts:942](lib/ta/strategy-optimizer/run-backtest.ts#L942): `rawReturn: (futurePrice - currentPrice) / Math.abs(currentPrice),`
*   **Etki:** Normal şartlarda (pozitif fiyatlar) `Math.abs()` hiçbir değişiklik yapmaz — performans etkisi sıfırdır. Teorik negatif fiyat senaryolarında (örn: petrol vadeli işlemleri Nisan 2020) işaret hatalarını önler.

---

### Bölüm B: UI/UX Terminal İyileştirmeleri

#### 🟢 ENHANCEMENT #5: CSV Trade History Export (Veri Dışa Aktarımı)

*   **Amaç:** Kullanıcıların işlem geçmişlerini detaylı bir şekilde Excel/Google Sheets'e aktarabilmesi.
*   **Uygulama:** Tamamen client-side, saf JavaScript (Blob API) tabanlı CSV indirme. Dosyanın en üst kısmına Excel/Google Sheets'te veri bağlamını net göstermek amacıyla 4 satırlık bir 'Metadata Header' (Hisse sembolü, zaman dilimi, indikatör/strateji adı ve oluşturulma tarihi) ve ardından 1 satır boşluk eklendi. İki monitörde de uygulandı:
    - **StrategyBacktestMonitor** ([satır 296-323](components/panels/StrategyBacktestMonitor.tsx#L296-L323)): 7 kolonlu detaylı export (Date, Signal, Entry Price, Exit Price, Bars Held, Exit Reason, Outcome). Dosya adı: `strategy_history_{symbol}_{strategyName}.csv`.
    - **BacktestMonitor** ([satır 87-113](components/panels/BacktestMonitor.tsx#L87-L113)): 5 kolonlu diagnostik export (Date, Signal, Price, Target, Result). Dosya adı: `{indicatorName}_diagnostic_history.csv`.
*   **Teknik:** `Blob` + `URL.createObjectURL()` + geçici `<a>` elementi + `click()`. Hiçbir sunucu isteği yapılmaz.
*   **Kullanıcı Deneyimi:** Trade History dialog'unun sağ üst köşesinde "Export CSV" butonu bulunur. İndirme anında gerçekleşir.

#### 🟢 ENHANCEMENT #6: Scroll Zıplama Çözümü (`scroll: false`)

*   **Problem:** İndikatör panellerindeki "Diagnostic Optimize" ve "Reset" butonları, `router.push` ile URL parametrelerini güncellerken sayfanın en tepeye fırlamasına (scroll jump) neden oluyordu.
*   **Çözüm:** Tüm `router.push` çağrılarına `{ scroll: false }` seçeneği eklendi ([BacktestMonitor.tsx:78,151](components/panels/BacktestMonitor.tsx#L78)).
*   **Etki:** Kullanıcı çalıştığı bölgede kalır, sayfa konumu korunur. Özellikle alt kısımlardaki indikatör panellerinde çalışırken kritik bir kullanılabilirlik iyileştirmesidir.

#### 🟢 ENHANCEMENT #7: Popover Parameters (Optimized Settings)

*   **Problem:** Optimize edilmiş parametre ayarları, CSS tooltip ile hover durumunda gösteriliyordu. Çok parametreli stratejilerde sayfayı taşıran ve okunması zor bir deneyim sunuyordu.
*   **Çözüm:** Shadcn UI `Popover` bileşeni ile değiştirildi ([StrategyBacktestMonitor.tsx:390-411](components/panels/StrategyBacktestMonitor.tsx#L390-L411)):
    - **Glassmorphism:** `backdrop-blur-md` ile premium cam efekti
    - **Scrollbar:** `max-h-48 overflow-y-auto scrollbar-thin` ile uzun listeler kaydırılabilir
    - **Görsel:** Sarı şimşek ikonlu (`Zap` + `animate-pulse`) tetikleyici buton
    - **İçerik:** Parametre adı (gray-400 uppercase) ve değeri (amber-400 bold) şeklinde monospace font
*   **Etki:** Profesyonel bir trading terminali görünümü. Kullanıcı tıklayarak parametreleri inceleyebilir, popover dışına tıklayarak kapatabilir.

#### 🟢 ENHANCEMENT #8: Hybrid Profit Factor Badge

*   **Amaç:** Win Rate'in yanında, sistemin gerçek kârlılığını tek bir bakışta gösteren dinamik renkli bir rozet.
*   **Uygulama** ([StrategyBacktestMonitor.tsx:358-382](components/panels/StrategyBacktestMonitor.tsx#L358-L382)):
    - **Dinamik Renk:** PF ≥ 1.50 → Yeşil (emerald), PF 1.00-1.49 → Sarı (amber), PF < 1.00 → Kırmızı (red)
    - **Hover Detayı (`title` attribute):** Total Return (%) ve R/R Ratio (Ort. Kazanç / Ort. Kayıp)
    - **Konum:** Signal count ve Hit count'un hemen yanında, kompakt bir badge olarak
*   **Renk Kodlaması:**
    | Profit Factor | Renk | CSS Sınıfı | Anlam |
    |---------------|------|-----------|-------|
    | ≥ 1.50 | 🟢 Yeşil | `bg-emerald-500/10 text-emerald-400` | Güçlü kârlılık |
    | 1.00 – 1.49 | 🟡 Sarı | `bg-amber-500/10 text-amber-400` | Marjinal kârlılık |
    | < 1.00 | 🔴 Kırmızı | `bg-red-500/10 text-red-400` | Zarar |
*   **Etki:** Kullanıcı, sadece Win Rate'e bakarak yanıltıcı bir değerlendirme yapmaz. Profit Factor, stratejinin risk/ödül dengesini anında gösterir.

#### 🟢 ENHANCEMENT #9: Strategy Modal Scrolling & Sticky Footer

*   **Problem:** Strateji listesi uzadığında iç içe geçmiş scrollbar'lar çıkıyor, tarayıcının çirkin varsayılan scrollbar'ları premium tasarımı bozuyor ve aksiyon butonları kaydırıldığında görünmez oluyordu.
*   **Çözüm:** 
    1. `StrategyActionButtons` modal gövdesi dışına taşınarak `TAGlassDialog`'un `footer` prop'una eklendi (Discover ve Create butonları altta tamamen sabitlendi).
    2. Dışarıdaki `max-h-[60vh] overflow-y-auto` scroll wrapper'ı kaldırılarak içteki listeler `max-h-[240px] overflow-y-auto` ile sınırlandırıldı (4-5 item sonrası iç scroll tetiklenir).
    3. `app/globals.css` içinde `.premium-scrollbar` tanımlanarak ultra-thin ve hover durumunda mor-gri/mor yanan premium scrollbar tasarımı uygulandı.
*   **Etki:** Ne kadar strateji olursa olsun, kullanıcı her zaman "Apply", "Discover" ve "Create" butonlarına erişebilir.

---

### Faz 4 Değişen Dosyalar (Son Durum)

| Dosya | Değişiklik |
|-------|-----------|
| `lib/ta/simulation/trade-simulator.ts` | Time-stop bypass mantığı (satır 223-228), `Math.abs()` negatif fiyat koruması (satır 125) |
| `lib/ta/strategy-optimizer/run-backtest.ts` | `activePosition` state yönetimi (satır 737-741), pyramiding prevention + flat-only kuralı (satır 841-847), `Math.abs()` koruması (satır 942), debug log'a yeni reddetme sebepleri (satır 911-912) |
| `components/panels/StrategyBacktestMonitor.tsx` | `handleDownloadCSV` fonksiyonu (satır 296-323), `Popover` optimized settings (satır 390-411), Hybrid Profit Factor badge (satır 358-382), `Download` ikon import |
| `components/panels/BacktestMonitor.tsx` | `handleDownloadCSV` fonksiyonu (satır 87-113), `scroll: false` router.push (satır 78, 151), `Download` ve `RotateCcw` ikon import |
| `components/ta/controls/TAStrategiesButton.tsx` | `StrategyActionButtons`'ın footer'a taşınması, outer scroll wrapper'ın kaldırılması |
| `components/ta/common/TAGlassDialog.tsx` | Gelişmiş `.premium-scrollbar` sınıfının uygulanması |
| `components/strategies/components/MyStrategiesSection.tsx` | `premium-scrollbar` entegrasyonu |
| `components/strategies/components/DiscoveredStrategiesSection.tsx` | `premium-scrollbar` entegrasyonu |
| `app/globals.css` | `.premium-scrollbar` stil kurallarının eklenmesi |
| `docs/SIGNALIST_MASTER_ARCHITECTURE.md` | Faz 4 güncellemesi: Bölüm 5 (Trade Simulator Motoru), Bölüm 7 (UI/UX Terminal), Ek C (Faz 4 Özet) |
| `docs/FEATURES_TODO_AND_DEBUG_REPORTS.md` | Faz 4 raporu: Bölüm 12, Ek C ve Bugfix #1 güncellendi |

---

### Faz 4 Mimari Etki Değerlendirmesi

| Kriter | Değerlendirme |
|--------|--------------|
| **Geriye Dönük Uyumluluk** | ✅ Tam — Tüm değişiklikler ek katmanlar olarak eklendi, mevcut API'ler değişmedi |
| **Performans Etkisi** | ✅ İhmal edilebilir — `activePosition` tek bir obje, bypass tek bir `if` kontrolü |
| **Test Edilebilirlik** | ✅ Yüksek — Tüm yeni kurallar saf fonksiyonlar içinde, mocklanabilir |
| **Canlı Trading Etkisi** | 🟢 Pozitif — Pyramiding prevention ve flat-only kuralı canlı trading'de risk yönetimini doğrudan iyileştirir |
| **Deep Discovery Etkisi** | 🟢 Pozitif — Time-stop bypass, keşif motorunun daha uzun vadeli kârlı stratejileri ödüllendirmesini sağlar |
| **Kullanıcı Deneyimi** | 🟢 Çok pozitif — CSV export, scroll fix, popover, profit factor badge ve tanı optimizasyonu donma çözümü ile profesyonel terminal seviyesi |

---

## BUGFIX #1: Bireysel İndikatör Tanı Optimizasyonu (Diagnostic Optimization) Donma Çözümü

*   **Problem:** İndikatör panellerinde bulunan "Diagnostic Optimization" butonuna basıldığında sayfa kilitleniyor, yanıt vermiyor ve kilitli kalıyordu.
*   **Analiz:** 
    1. **URL Parametre Döngüsü:** URL'de page-wide optimizasyondan kalan `optimize=1` parametresi varken "Diagnostic Optimization" veya "Reset" yapıldığında URL parametreleri klonlanıyordu. `optimize=1` temizlenmediği için, sunucu tarafında her parameter push işleminde tüm indikatörlerin baştan optimize edilmesi tetikleniyordu (sunucu render kilitlenmesi).
    2. **CPU Bloklanması:** Client browser'da 3,650 bar (10 yıl) candle verisi üzerinde 35 parametre brute-force aramayla tek thread üzerinde senkron hesaplanıyordu. Bu işlem tarayıcı event loop'u 2-4 saniye kilitliyordu.
*   **Çözüm:**
    1. **Klonlanan URL Parametre Temizliği:** `BacktestMonitor.tsx` içindeki "Diagnostic Optimization" ve "Reset" butonlarında `router.push` yapılmadan önce `params.delete("optimize")` çağrılarak sunucu tarafında gereksiz optimizasyon tetiklenmesi engellendi.
    2. **Veri Kümesi Dilimleme (Slicing):** Client tarafında indikatör parametre araması yapılırken, 10 yıllık tüm veri yerine son 2 yıla (730 candle) ait veri seti dilimlenerek (`candles.slice(-730)`) kullanıldı. Bu sayede arama süresi **~2 saniyeden <200ms'ye indirildi** ve tarayıcı donması engellendi.
    3. **Case-Insensitive Registry:** `optimizer.ts` içinde `indicatorName` aramaları `toUpperCase()` yapılarak harf duyarlılığından kaynaklı registry uyuşmazlıkları giderildi.
    4. **Telemetry Sayaçları:** Performans takibi için hem client (`[BacktestMonitor] Optimize`) hem server (`[Server Action] triggerOptimization`) kısımlarına `console.time` / `console.timeEnd` sayaçları entegre edildi.
*   **Etki:** Butona basıldığında tarayıcı donmadan anında işlem tamamlanır ve optimize değer grafiğe yansır.

---

## FEATURE #10: Broad Market Filter (Regime Filter)
* **Açıklama**: Sistemin "Trend Following" karakteristiğini güçlendirmek ve "Ayı Piyasası" ortamlarında oluşan yüksek riskli `BUY` sinyallerini elimine etmek için eklenen üst düzey piyasa rejimi filtresidir.
* **Nasıl Çalışır**: `yahoo-finance2` ile S&P 500 (SPY) geçmiş 200 günlük hareketli ortalaması (200-SMA) hesaplanır. İşlem açılacak gün, SPY 200-SMA'nın altındaysa `BUY` sinyali anında iptal edilir. `SELL` ve `Take Profit` işlemleri kesinlikle engellenmez; aksine ayı piyasasında kâr realize edilmesine destek olunur. (İşlem süresi <5ms cache'lenmiştir).
* **UI/UX Entegrasyonu**: Hem manuel backtest arayüzü (`StrategyBacktestMonitor.tsx`), hem de Yapay Zeka Keşif arayüzüne (`StrategyDiscoveryDialog.tsx`) bağımsız "Market Filter" Toggle'ları eklendi.
* **Durum**: ✅ Tamamlandı ve başarıyla entegre edildi. Motorun Deep Discovery `Phase 4.5` simülasyon aşamasında da aktifleşerek, ayı piyasasında zarar eden stratejileri direkt eliyor.

---

## 12. İLERİ DÜZEY R&D AJANDASI: SİSTEMİN AKILLANDIRILMASI

Sistemimizin temel backtest mekaniklerini, DST fusion limitlerini ve arayüz hatalarını ("panik atak geçiren scalper" sorunlarını) başarıyla stabil bir "profesyonel kantitatif sistem" seviyesine getirdik. Gelecek geliştirme fazımız olan **Araştırma Süreci (R&D)** önceliklerinde odaklanacağımız 3 ana başlık:

### 1. Price Action (Mum Analizi) Filtre Modülü
* **Konsept:** İndikatörlerin 'geometrik gürültüsünü' temizlemek için mumların bizzat kendisine (şekline) bakan bir filtre.
* **Detay:** 'Doji', 'Engulfing', 'Ardışık Yeşil/Kırmızı Mum' gibi yapısal formasyonları tespit eden bir `PriceActionRegistry`. Trend takibi yapan stratejilerin, piyasa dönüş sinyali (örn: ayı yutan boğa) almadan işleme girmesini engelleyen bir onay mekanizması olarak kullanılacak.
* **Stratejik Amaç:** İndikatörlerin gecikmeli (lagging) yapısını, fiyatın doğrudan kendisinden alınan anlık ve yapısal teyitlerle doğrulayarak; düşen bıçağı tutma veya yanlış kırılımlarda sahte (fake-out) sinyallere girme körlüklerini kapatmak.

### 2. Hacim Analizi (Volume Spread Analysis - VSA)
* **Konsept:** Fiyat değişimlerini hacim ile doğrulayan (confirm eden) bir sistem.
* **Detay:** Fiyat düşerken hacmin azalması (güçsüz düşüş) veya hacim patlamasıyla fiyatın destek/direnç kırması gibi durumların `simulateTrade` motoruna 'Onay Puanı' olarak eklenmesi. Sistemin sadece fiyata değil, 'paranın gücüne' bakmasını sağlamak.
* **Stratejik Amaç:** Sığ (düşük hacimli) piyasalarda manipülatif fiyat hareketlerinin ürettiği sahte sinyalleri filtrelemek. Sadece "akıllı paranın" da katıldığı gerçek momentum hareketlerinde işleme girmeyi sağlamak.

### 3. Random Forest / ML Modeli (Inference Engine)
* **Konsept:** İndikatör ve Price Action sinyallerini birleştiren bir yapay zeka karar katmanı.
* **Detay:** 'Offline Training' yöntemiyle Python/Scikit-learn üzerinden eğitilmiş bir modelin, ağırlıklarının (weights) TS sistemine aktarılarak canlı 'Inference' (karar verme) yapması. Sistemin 'Eski tecrübelerine' (geçmiş veriye) dayanarak o anki sinyalin başarı ihtimalini %'lik bir skorla vermesi.
* **Stratejik Amaç:** Kural bazlı katı motor yapımızı esneterek; farklı indikatör kombinasyonlarının bir arada bulunduğunda (örneğin 4 Mart 2020 gibi kompleks çöküş senaryolarında) tarihsel olarak nasıl sonuçlandığını çok boyutlu analizle tahmin edip risk yönetimini devralması.

*(Not: Bu Ar-Ge maddelerine, projenin genelindeki UI glitchleri ve buton durum hataları tamamen temizlendikten sonra geçilecektir.)*

## 13. UI/UX CİLALAMA FAZI VE PREMIUM DURUM RAPORU

Aşağıdaki görsel ve mantıksal onarımlar kod sistemine başarıyla uygulanmış ve projenin "Premium Dark Terminal" kimliği oturmuştur:

### Çözülen UI/UX Problemleri
1. **Watchlist & Alerts Bağımsızlığı (Decoupling):** Watchlist boşaldığında sayfanın Empty State'e girip Alerts panelini yok etmesi hatası düzeltildi. Alerts modülü artık Watchlist'ten tamamen bağımsızdır ve "Add Alert" butonu her daim kullanılabilir durumdadır.
2. **Global Silme ve Soft Refresh:** Arşiv (`/archive`) sayfasında tamamlanmış işlemleri toplu ve tekil silme esnasında sayfanın zıplamasına neden olan unmount sorunu `setReports` lokal filtreleme ve `refreshing` state ile çözüldü.
3. **AlertForm Tasarım Senkronizasyonu:** `/alerts/create` sayfasında unutulan eski HTML form silindi ve anlık fiyat çeken, fetch validasyonu yapan Premium `AlertForm.tsx` entegre edilerek tüm sistemde tek ve şık bir form yapısı sağlandı.
4. **Dashboard Breakpoint Optimizasyonu:** `lg:` breakpoint'lerinin çift monitör ve split-screen kullanımlarda sayfayı çok daralttığı tespit edilerek `xl:` (1280px) değerine yükseltildi, Tailwind `order` sınıflarıyla ekran daralmasında widget'ların kontrollü dizilimi güvence altına alındı.
5. **Search Arayüzü İyileştirmeleri:** Hisse aramalarında karmaşık ve uzun isimlerin UI'yi bozmaması adına `truncate` eklendi ve hissenin hangi borsadan (NASDAQ, TO, MX vb.) geldiğini belirten ufak şık rozetler tasarlandı.


## 14. Faz 5: Simulation Lab

**Felsefe: İki Ayrı Dünya**
* **Simulation Lab (Geçmişe Dönük):** 10 yıllık veride backtest, Inngest chunking, deterministik motor.
* **Paper Trading (Canlı/İleriye Dönük):** Gerçek zamanlı sinyallerle sanal cüzdan, cron job.

**Entity'ler (Domain Model):** 
* `Wallet`: `type 'live' | 'simulation'`, `strategyPortfolio[]`, `activeSymbols[]`, `positionSizingConfig`, `capitalInjections` (TWR için), `status`, `lastError`.
* `Position`: `currentPrice`, `unrealizedPnl`, `mfe`, `mae`, `maxDrawdown`, `exitReason` enum.
* `Transaction`: Immutable Ledger (Double-Entry), `FEE` type, `fees`, `feeType`, `relatedTransactionId`, `metadata`.
* `Simulation`: `strategyPortfolio[]` (multi-strategy), `finalMetrics` cache (`winRate`, `sharpe`, `sortino`, `cagr`, `alpha`, `beta`, `totalReturn`, `exitReasonBreakdown`), `equityCurve` embedded array, `benchmarkCurve`, `failedAt`.
* `StrategySnapshot`: Engine Versioning (motor değişse bile eski simülasyon bozulmaz).

**Inngest Altyapısı (`lib/inngest/functions/simulation/run-simulation.ts`)**
* **Chunking:** 90 günlük bloklar, OOM koruması, yield-based processing.
* **Idempotency:** `event.data.simulationId` (çift tetikleme koruması).
* **Error Recovery:** `retries: 3`, exponential backoff, onFailure hook (`status: 'failed'`, `failedAt`).
* **Incremental Sync:** `lastProcessedDate` ile kaldığı yerden devam.
* **Multi-Strategy Weighted Consensus:** Her strateji -1/0/+1 sinyali, `weight` ile çarpılır, threshold ±0.4.

**Kritik Kurallar**
* **Immutable Ledger:** Transaction ASLA silinemez, sadece REVERSAL ile düzeltilir.
* **TWR (Time-Weighted Return):** Deposit/Withdraw durumunda metrikler bozulmaz.
* **Corporate Actions:** Stock Split, Dividend, Delisted Stock handling.
* **Bankruptcy Circuit Breaker:** Total Equity < %10 of initial → force liquidation.
* **Benchmarking:** Alpha/Beta vs SPY/QQQ/IWM/DIA/VTI.
* **MFE/MAE Tracking:** Pozisyonun gördüğü max kâr/zarar.

**UI Bileşenleri**
* `SimulationCreationModal`: Modern Calendar (dropdown yıl/ay), Benchmark dropdown (5 endeks + açıklamalar), Position Sizing açıklamaları, strateji silme butonu, weight validation (toplam 1.0), max 10 strateji.
* `SimulationProgressCard`: 2 saniyelik polling, amber pulse, error counter.
* `SimulationResultsDashboard`: Lightweight Charts (equity curve + benchmark + trade markers), 8 metrik grid, CSV export (Blob API), Trade History tablosu.
* `SimulationsList`: Grid layout, status badge'ler, AlertDialog ile silme.
* `LaunchLabButton` + `useSimulationModal` (Zustand): Global modal state.
* `RetryButton`: Failed durumda yeniden çalıştırma.

**Navigation**
* `/portfolio/simulations` (Sim Lab list)
* `/portfolio/simulations/[id]` (Sim Lab detail)
* `NavItems.tsx`: Exact match for `/portfolio` (çakışma önlendi).

---

## 15. Faz 6: Paper Trading

**Daily Execution Cron Job (`lib/inngest/functions/paper-trading/daily-execution.ts`)**
* **Trigger:** cron `0 20 * * 1-5` (Pzt-Cum 20:00 UTC, US Market Close).
* **Event trigger:** `paper-trading/daily-execution` (Execute Now butonu için).
* Her live wallet için: `activeSymbols` tara, stratejilerin sinyallerini üret, weighted consensus, `simulateTrade` ile Faz 4 kuralları uygula.
* Açık pozisyonlar için: `currentPrice` ve `unrealizedPnl` güncelle (Finnhub Quote API).
* `Transaction.insertMany` ile ledger'a işle.

**UI Bileşenleri**
* `PaperTradingDashboard`: 4 summary card (Total Equity, Cash Balance, Total Return, Unrealized P&L), Open Positions tablosu (manuel Close butonu), Strategy Allocation panel, Recent Transactions tablosu, CSV export.
* `DepositWithdrawModal`: TWR için `capitalInjections` kaydı.
* `StrategyAllocationModal`: Strateji ağırlıkları (toplam 1.0), `activeSymbols` (virgülle), max 10 strateji.
* `Execute Now` butonu: Manuel cron tetikleme.

**Server Actions (`lib/actions/paper-trading.actions.ts`)**
* `depositWithdrawAction`: Wallet.capitalInjections.push, Transaction.create.
* `closePositionAction`: Finnhub'dan güncel fiyat, manuel kapatma.
* `updateStrategyAllocationAction`: Wallet.strategyPortfolio ve activeSymbols güncelle.

**API Endpoints**
* `/api/strategies`: Kullanıcının tüm stratejilerini döndürür (MyStrategies + DiscoveredStrategies).
* `/api/paper-trading/execute`: Manuel cron tetikleme.
* `/api/inngest`: Inngest webhook handler.

**Navigation**
* `/portfolio`: Paper Trading dashboard.

**MODEL DEĞİŞİKLİKLERİ (Özet)**
* `wallet.model.ts`: `strategyPortfolio[]`, `activeSymbols[]`, `positionSizingConfig`, `status`, `lastError`, `capitalInjections.type` (DEPOSIT/WITHDRAW).
* `position.model.ts`: `currentPrice`, `unrealizedPnl` (Decimal128).
* `simulation.model.ts`: `strategyPortfolio[]` (array, Record değil), `finalMetrics` (totalReturn, totalSignals, exitReasonBreakdown Map), `failedAt`.
* `transaction.model.ts`: `fees`, `feeType` (COMMISSION/SPREAD/REGULATORY), `relatedTransactionId`, `metadata`, FEE ve REVERSAL type'ları.

**YENİ DOSYALAR**
* **Inngest:** `lib/inngest/client.ts`, `app/api/inngest/route.ts`, `lib/inngest/functions/simulation/run-simulation.ts`, `lib/inngest/functions/paper-trading/daily-execution.ts`
* **Server Actions:** `lib/actions/simulation.actions.ts`, `lib/actions/paper-trading.actions.ts`, `lib/actions/finnhub/quote.ts`
* **API Routes:** `app/api/strategies/route.ts`, `app/api/paper-trading/execute/route.ts`
* **Pages:** `app/(root)/portfolio/page.tsx`, `app/(root)/portfolio/simulations/page.tsx`, `app/(root)/portfolio/simulations/[id]/page.tsx`
* **Components:** `components/simulation/SimulationCreationModal.tsx`, `components/simulation/SimulationProgressCard.tsx`, `components/simulation/SimulationResultsDashboard.tsx`, `components/simulation/SimulationsList.tsx`, `components/simulation/RetryButton.tsx`, `components/simulation/LaunchLabButton.tsx`, `components/paper-trading/PaperTradingDashboard.tsx`, `components/paper-trading/DepositWithdrawModal.tsx`, `components/paper-trading/StrategyAllocationModal.tsx`
* **Store:** `lib/store/useSimulationModal.ts`

**UI/UX DEĞİŞİKLİKLERİ (Özet)**
* **Renk teması:** emerald → amber/yellow (sistemle uyumlu, yellow-400/500).
* **Modern Calendar:** shadcn/ui Calendar + Popover, captionLayout='dropdown', 1990-2050 arası.
* **Number input spinner kaldırma:** `app/globals.css`'e webkit/moz kuralları eklendi.
* **Navigation active state:** `/portfolio` için exact match (startsWith değil).
* **Premium scrollbar:** Tüm modal ve dialog'lara uygulandı.
* **Initial Capital:** `min="0.01"` (1000$ sınırı kalktı, $50 ile de test edilebilir).
* **Benchmark dropdown:** 5 endeks + tooltip açıklamalar.
* **Position Sizing:** Her seçenek için alt açıklama (flex-col layout).
* **Strateji silme butonu:** ✕ ikonu, max 10 strateji limiti.
