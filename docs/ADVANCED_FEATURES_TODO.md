# İleri Düzey Geliştirmeler: Risk Analizi ve Yapılacaklar (To-Do)

Bu doküman, sistemin ileri düzey geliştirmeleri (Market Telemetry, MTF, Dinamik Çıkışlar, Walk-Forward Optimizasyon) uygulanırken dikkat edilmesi gereken riskleri, tuzakları ve implementasyon önceliklerini listeler.

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
- [ ] **Backtest Altyapısını Güncellemek:** `runStrategyBacktest()` fonksiyonu tek timeframe alıyor. Bunun `candles1d` ve `candles4h` alacak şekilde güncellenmesi ve Hyperband ile MCTS pipeline'ına yansıtılması gerekir. Bu feature **en sona bırakılmalıdır**.

---

## 3. Dinamik Çıkış Stratejileri (Feature 7.3)
**Risk Seviyesi:** Düşük | **Bağımsız Başlanabilir mi?:** Evet (Geriye dönük uyumlu)

### Yapılacaklar ve Riskler:
- [ ] **Parabolic SAR Entegrasyonu:** SAR'ın "flip" anını izleyen bir state machine (isLong, ep, af) kurulmalı. SAR'ın başlangıç (seed) değerine çok dikkat edilmeli.
- [ ] **Chandelier Exit Entegrasyonu:** `Highest High(n)` hesaplaması için rolling max state takibi `simulateTrade()` içine eklenmeli.
- [ ] **Profil Konfigürasyonu:** Bu mekanizmaların `PROFILE_CONFIGS` içinde nasıl duracağına karar verilmeli. Yeni bir alan (`exitStrategy: 'chandelier' | 'sar' | 'supertrend' | 'atr'`) eklenebilir.
- [ ] **Uyumluluk Notu:** Yeni çıkış mekanizmaları sadece Yol B (`simulateTrade`) bağlamında çalışır. Yol A (`calculateWinRate`, 5-bar lookforward) ile uyumsuzluğu belgelenmeli.

---

## 4. Otonom Walk-Forward Optimizasyonu (Feature 7.4)
**Risk Seviyesi:** Orta (Inngest Timeout) | **Bağımsız Başlanabilir mi?:** Evet (Yeni dosya)

### Yapılacaklar ve Riskler:
- [ ] **Hesaplama Maliyeti ve Inngest Timeout'u:** MCTS × Hyperband × DE işlemlerinin 5 pencerede tekrarı Inngest limitlerini aşabilir. **Çözüm:** Walk-Forward işlemi mevcut `deepDiscoveryJob` içine değil, her pencerenin ayrı bir "step" olarak çalışacağı özel bir `walkForwardJob` Inngest fonksiyonuna entegre edilmelidir.
- [ ] **Sonuç Raporlama Stratejisi:** Her pencerede farklı kombinasyon kazanabileceği için, "tüm pencerelerde ortalamanın üzerinde performans gösterenleri" **Robust** olarak işaretleyen, tek pencerede iyi olanları "Overfit Riski" olarak sınıflandıran bir mantık kurulmalı.

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
- [ ] **BB Squeeze (Daralma) Tespiti:** `signal-registry.ts`'deki `isSqueezed()` ve `keltnerChannel()` fonksiyonları aktif edilip pipeline'a bağlanmalı. Momentum patlamalarını önceden tespit etmek için en güvenilir yöntemdir.
- [ ] **Hacim Onayı:** `volumeConfirms()` fonksiyonu aktif edilmeli.
- [ ] **Uyumsuzluk (Divergence) Tespiti:** Fiyat yeni tepe yaparken RSI veya MACD yapmıyorsa bu güçlü bir dönüş sinyalidir. `obvBearishDivergence()` konsepti üzerinden RSI ve MACD divergence tespiti DST'ye ek inanç (BBA) olarak beslenmeli.

### Mantıksal Filtreler ve Risk Yönetimi
- [ ] **VWAP Filtresi:** Gün içi (örneğin 4h) işlemlerde kurumsal referans noktası VWAP'tır. "Fiyat VWAP'ın altındayken AL sinyallerini filtrele" kuralı eklenmeli.
- [ ] **Kelly Criterion ile Pozisyon Boyutlandırma:** Her pozisyona ne kadar bakiye ayrılacağı sezgisel olmamalı. Formül: `f* = (b*p - q) / b` (b: kazanç/kayıp oranı, p: win rate, q: kaybetme olasılığı). Muhafazakar başlamak için `f*/2` (Half-Kelly) uygulanmalı.

### Devreye Alma (Deployment) Süreci
- [ ] **Shadow Mode (İzleme Modu) Testi:** Broker'a bağlamadan önce sistem 4-6 hafta canlı çalıştırılıp sinyaller veritabanına (`ForwardTestStrategy`) kaydedilmeli. Backtest'teki beklentiler canlı veride kanıtlanmadan (out-of-sample forward test) gerçek parayla işleme geçilmemeli.
- [ ] **Manuel Yarı-Otomasyon:** Başlangıçta sistemin doğrudan emir iletmesi yerine, güçlü bir sinyal oluştuğunda (Örn: "GARAN, Uptrend, %67 Güven") kullanıcıya bildirim atıp son onayın (execution) kullanıcı tarafından broker üzerinden manuel yapılması kurgulanmalı.
