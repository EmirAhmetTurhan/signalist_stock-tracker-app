# İleri Düzey Geliştirmeler, Yapılacaklar (To-Do) ve Hata Düzeltme Raporu

Bu doküman, sistemin ileri düzey geliştirmeleri (Market Telemetry, MTF, Dinamik Çıkışlar, Walk-Forward Optimizasyon) uygulanırken dikkat edilmesi gereken riskleri, implementasyon önceliklerini ve en son giderilen kritik matematiksel/mantıksal hata raporlarını içerir.

---

## Mevcut Sistemde Dikkat Gerektiren Kısımlar (İyileştirmeler)

- [ ] **MFI ve WPR Sinyalleri:** (Faz 20 sonrası) tamamen yön tabanlı (`cur > prev → BUY`) olmaları oldukça gürültülüdür. Eşiği tamamen kaldırmak yerine daha yumuşak bir midline yaklaşımı (örneğin MFI için `cur > 50` veya `cur > 0`) düşünülebilir.
- [ ] **RSI STRONG_BUY Koşulu:** `rsi > rsiMa && rsi < 30` mantıken doğru olsa da pratikte (RSI 30'un altındayken MA'sını geçmesi) çok nadir tetiklenir. Canlı panelde yanıltıcı olmaması adına gözden geçirilebilir.
- [ ] **5-Bar Lookforward (calculateWinRate):** Hem 1d hem 4h için aynı olması teknik borç olarak belgelenmiştir. Bu yolun (Yol A) kavramsal olarak sınırlı anlam taşıdığı kullanıcıya net iletilmelidir.

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
- [ ] **Backtest Altyapısını Güncellemek:** `runStrategyBacktest()` fonksiyonu ([lib/ta/strategy-optimizer/run-backtest.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/strategy-optimizer/run-backtest.ts)) tek timeframe alıyor. Bunun `candles1d` ve `candles4h` alacak şekilde güncellenmesi ve Hyperband ile MCTS pipeline'ına yansıtılması gerekir. Bu feature **en sona bırakılmalıdır**.

---

## 3. Dinamik Çıkış Stratejileri (Feature 7.3)
**Risk Seviyesi:** Düşük | **Bağımsız Başlanabilir mi?:** Evet (Geriye dönük uyumlu)

### Yapılacaklar ve Riskler:
- [ ] **Parabolic SAR Entegrasyonu:** SAR'ın "flip" anını izleyen bir state machine (isLong, ep, af) kurulmalı. SAR'ın başlangıç (seed) değerine çok dikkat edilmeli.
- [ ] **Chandelier Exit Entegrasyonu:** `Highest High(n)` hesaplaması için rolling max state takibi `simulateTrade()` ([lib/ta/simulation/trade-simulator.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/simulation/trade-simulator.ts)) içine eklenmeli.
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
2. **Öncelik:** Dinamik Çıkış Stratejileri (`simulateTrade` içinde geriye uyumlu)
3. **Son Öncelik:** MTF Filtreler (Altyapı değişimi ve lookahead riski çok yüksek, en sona bırakılmalı)

---

## 5. Canlı İşlem (Live Trading) Uyumluluk Raporu ve Eksiklikler

Sistem şu an çok iyi bir araştırma ve backtest platformu olmasına rağmen, tam otomatik bir ticaret platformu (Live Trading) olması için 5 ayrı katmanda yapısal eksiklikler barındırmaktadır:

| Mimari Katman | Mevcut Durum | Canlı Trading İçin Gerekli | Risk Durumu |
|---|---|---|---|
| **Veri Katmanı** | Finnhub REST API (Polling, ~5sn gecikme) | **WebSocket streaming** (Anlık tick/OHLCV push) | 🟠 Kısmen Hazır |
| **İndikatör Katmanı** | Toplu yeniden hesaplama (Her bar: tüm tarih işlenir) | **Artımlı hesaplama** (State yönetimi + resume) | 🟠 Kısmen Hazır |
| **Sinyal Motoru** | DST + MCTS + 17 ind. (Büyük ölçüde hazır) | **MTF Filtre + Rejim Seçimi** (Öncelikli İyileştirme) | 🟢 Hazır |
| **Risk Yönetimi** | ATR bazlı SL/TP (Simülasyon ortamında) | **Kelly + DD Breaker** (Portföy seviyesi koruma) | 🔴 Kritik Eksik |
| **Çalıştırma Katmanı** | Sanal Portföy (Kağıt işlem / Paper trading) | **Broker API Bağlantısı** (IBKR / Alpaca / BIST) | 🔴 Kritik Eksik |

---

## 6. Tam Otomasyona Geçiş Öncesi Pratik Adımlar (Aksiyon Planı)

Sistemi tam otomatik ticarete almadan önce (veya sinyal destekli manuel işlem yaparken) kaliteyi hızla artıracak ve riskleri düşürecek kısa-orta vadeli adımlar:

### Hızlı Kazanımlar (Ölü Kodların Canlandırılması)
- [ ] **BB Squeeze (Daralma) Tespiti:** [lib/ta/registry/signal-registry.ts](file:///c:/Users/ozdem/OneDrive/Belgeler/Projects/signalist_stock-tracker-app/lib/ta/registry/signal-registry.ts)'deki `isSqueezed()` ve `keltnerChannel()` fonksiyonları aktif edilip pipeline'a bağlanmalı. Momentum patlamalarını önceden tespit etmek için en güvenilir yöntemdir.
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
