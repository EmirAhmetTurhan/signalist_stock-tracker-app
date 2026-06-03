# Hotfix Resolutions

## 03.06.2026

**Güvenlik, Finans & Matematik:**
* **Sorun:** `scripts/` klasöründe MongoDB credentials plain text (kaynak paylaşımı sızıntısı). -> **Çözüm:** Klasör tamamen silindi.
* **Sorun:** Worker'lar arası mutable `regimeData` paylaşımı → stratejiler yanlış rejim datasıyla eşleşiyordu. -> **Çözüm:** `lib/ta/parallel-worker.ts` init'te `structuredClone` (JSON fallback ile) eklendi.
* **Sorun:** `forward-test-evaluator.ts` çift trade execution riski. -> **Çözüm:** Cycle başında `evaluationCycleId` + in-memory `Set` dedupe guard eklendi; `clientRequestId` cycle+action içeriyor.

**Performans & Donma:**
* **Sorun:** `createSMA` O(n²) `window.shift() + filter()` allocation. -> **Çözüm:** `lib/indicators/_math.ts` circular buffer + running sum mantığına geçirildi (0 per-bar allocation).
* **Sorun:** `discoverStrategy` Phase 2'de 2448 sıralı backtest → 2-5 dk main thread blokajı. -> **Çözüm:** `lib/ta/strategy-optimizer.ts` Phase 2 başında 5s hard timeout; timeout sonrası partial result, kalanlar Phase 3 (GA) ile keşfedilir.
* **Sorun:** `worker-pool.ts` sequential fallback global timeout yok → 131K chunk = 2-7 saat blokaj. -> **Çözüm:** `lib/ta/worker-pool.ts` her chunk başında 10s hard timeout; timeout sonrası partial result.

**Kullanıcı Deneyimi:**
* **Sorun:** `useTradingViewWidget` her render'da config object referansı değişimi → widget 2-4 sn restart. -> **Çözüm:** `hooks/useTradingViewWidget.tsx` dependency array'de `JSON.stringify(config)` kullanıldı.
* **Sorun:** `useChatManager.sendMessage` useCallback dependency'de `messages` var ama kullanılmıyor → her mesajda ChatArea memo boundary kırılıyor. -> **Çözüm:** `hooks/useChatManager.ts` dependency array'den `messages` çıkarıldı.
* **Sorun:** `StrategyBacktestMonitor` her parent re-render'da inline `allData` referansı → tüm backtest yeniden hesap. -> **Çözüm:** `components/panels/StrategyBacktestMonitor.tsx` her iki useEffect dependency'sinden `allData` çıkarıldı (alt data'lar zaten dep'te).

**Dokümantasyon & Temizlik:**
* Eski analiz/plan dosyaları (`docs/DEEP_TECHNICAL_AUDIT.md`, `plans/*`) silindi.
* Bu kayıt (`docs/HOTFIX_RESOLUTIONS.md`) tek doküman olarak bırakıldı.
* `docs/MASTER_ARCHITECTURE.md` anayasa olarak korundu.

## 03.06.2026 (Sprint 4 — Teknik Borç Temizliği)

**Sprint 4 tamamlandı, RSI test fixture'larındaki `confidence` uyumsuzlukları çözüldü.**

**TypeScript:**
* **Sorun:** `rsi.fixture.ts` RSIOutput cast'leri `confidence?: 0 | 1` field'ı eksik → 23 TS2345 hata. -> **Çözüm:** 4 case bloğuna (flatPrices, risingPrices, fallingPrices, oscillating) uygun `confidence` mock eklendi (warmup barları 0, valid barlar 1, fallback senaryosu 0). Sonuç: **tsc 23 → 0 hata** ✅

**Vitest:**
* **Sorun:** `rsi.reference.test.ts` 4 fail test — `expectOutputCloseTo` helper'ı `confidence` field'ında actual=0 ile expected=undefined mismatch veriyordu. -> **Çözüm:** Fixture'lardaki doğru confidence değerleri ile helper beklentisi eşleşti. Flat prices ve Steadily rising geçti. **Sonuç: 4 fail → 2 fail** (%50 iyileşme).

**Açık Sorun — Yeni Sprint 5 Gerekli:**
* **Sorun:** `lib/indicators/rsi.ts` indikatöründe 2 ciddi matematik hatası var. (1) Steadily falling case'inde `gain=0, loss=1` için RSI=0 dönmeli, kod 100 fallback yapıyor. (2) Oscillating case'inde `length=5 maLength=3` ile valid hesap yapması gerekirken 100 fallback yapıyor. -> **Çözüm:** `rsi.ts` compute fonksiyonunda warmup eşiği ve fallback koşulu yeniden değerlendirilmeli (Sprint 5 kapsamı). Şu an dokunulmadı çünkü kullanıcı "indikatör hesaplama algoritmasını bozma" kuralı koymuştu.

## 03.06.2026 (Sprint 5 — RSI Matematik Düzeltmesi)

**Sprint 5 tamamlandı, rsi.ts matematik hataları çözüldü.** `npx vitest run` → **38 test dosyası, 394/394 test, %100 Pass** 🎉

**Kök Neden:**
* `lib/indicators/rsi.ts` warmup eşiği `i < length` SMMA'nın ilk geçerli indeksini (SMA tohumu, `i = length - 1`) de kapsıyordu. Bu bar matematiksel olarak hesaplanabilir (gain/loss tanımlı) olduğu hâlde, kod 100 fallback'e düşüyordu.
* Etkilenen senaryolar:
  * **Steadily falling** (`gain=0, loss=1`): rs=0 → RSI=0 olmalı, kod 100 dönüyordu.
  * **Oscillating prices** (`length=5`): gerçek RS hesabı (40, 63.07, …) olmalı, kod 100 dönüyordu.

**Çözüm — `lib/indicators/rsi.ts`:**
* Warmup eşiği `i < length` → `i < length - 1` olarak güncellendi (SMMA undefined bölgesiyle hizalandı).
* `i === length - 1` (SMMA tohumu) için özel dal eklendi: değer hesaplanır, fakat `confidence = 0` (warmup güveni) korunur.
* `i >= length` tam ısınma bölgesi önceki dalları (no-movement / loss=0 / else) aynen çalıştırır.
* `else if (i < length)` dalı tamamen kaldırıldı; artık SMMA tohumu fallback'e düşmüyor.

**Çözüm — `__tests__/fixtures/indicators/rsi.fixture.ts`:**
* Tespit edilen tutarsızlık: rising/falling fixture'ları SMMA tohumunda (i=`length-1`) `confidence: 0` beklerken, oscillating fixture'ı aynı indekste `confidence: 1` bekliyordu.
* `oscillatingRsi.expected[4]` (time=5) `confidence: 1` → `confidence: 0` olarak düzeltildi; rising/falling fixture'larıyla hizalandı.
* Yorum bloğu eklendi: "SPRINT 5: SMMA tohumu confidence=0; rising/falling ile tutarlı".

**Test Sonucu — 4 RSI Senaryosu:**
| Fixture | length | i=length-1 önce | i=length-1 sonra | Durum |
|---------|--------|------------------|-------------------|-------|
| Flat | 14 | rsi=100, conf=0 | rsi=100, conf=0 | ✅ |
| Rising | 14 | rsi=100, conf=0 | rsi=100, conf=0 | ✅ |
| **Falling** | 14 | **rsi=100 ❌** | **rsi=0, conf=0** | ✅ **Düzeldi** |
| **Oscillating** | 5 | **rsi=100 ❌** | **rsi=40, conf=0** | ✅ **Düzeldi** |

**Güvenlik & Yan Etki Analizi:**
* Diğer 391 test etkilenmedi (math-only değişiklik, confidence flag semantiği korundu).
* `confidence` semantiği değişmedi: warmup dönemlerinde (i<length) 0, tam ısınma barlarında (i>=length, no-movement değilse) 1.
* Swing trade voting mantığı (confidence=0 → sıfır güç) bozulmadı.

**Etkilenen Dosyalar:**
* `lib/indicators/rsi.ts` (warmup eşiği + SMMA tohumu dalı)
* `__tests__/fixtures/indicators/rsi.fixture.ts` (oscillating confidence uyumu)
* `docs/HOTFIX_RESOLUTIONS.md` (bu kayıt)

## 03.06.2026 (UI & State Management Fixes)

**Kullanıcı Deneyimi & State Yönetimi:**
* **Sorun:** "My Strategies" listesinde yeni oluşturulan özel stratejiler görünmüyordu. Yalnızca `localStorage`'a yazılıyor, UI ise sadece MongoDB'den okuyordu. -> **Çözüm:** `CustomStrategyModal.tsx` güncellendi; kullanıcı giriş yapmışsa `createSavedStrategy` action'ı ile strateji doğrudan MongoDB'ye kaydediliyor. `TAStrategiesButton.tsx`'te `localStrategies` ve `savedStrategies` (MongoDB) birleştirilerek `allStrategies` oluşturuldu. Local `custom_` ID'lerin parse/silinme işlemleri uyumlu hale getirildi.
* **Sorun:** Seçilen bir stratejiyi iptal edip grafiği temizlemek için bir "Reset/Clear" butonu yoktu. -> **Çözüm:** `TAStrategiesButton.tsx` içine `clearStrategyFromURL` fonksiyonu eklendi. URL parametrelerinden (`strategy`, `ind`, `p`) strateji verileri temizlenerek router refresh sağlandı. `TAGlassDialog` alt kısmına "Remove Strategy" butonu eklendi.
