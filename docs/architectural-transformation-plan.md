# Mimari Dönüşüm Planı: Agentic UI & Real-Time Senkronizasyon

**Tarih:** 2026-05-21 (Orijinal) / 2026-05-22 (4-Faz Refactoring ile genişletildi)
**Durum:** ✅ **TAMAMLANDI + GENİŞLETİLDİ** — 3 Faz (orijinal) + 4 Faz (refactoring), 35+ dosya, `tsc --noEmit` sıfır hata, `npm run build` başarılı

> **2026-05-22 Ek Fazlar:** Faz 0 (bileşen reorganizasyonu + ölü kod), Faz 1 (DB timestamp standardizasyonu), Faz 2 (katman ihlali düzeltmeleri), Faz 3 (INDICATOR_REGISTRY), Faz 4 (useChatManager paylaşımlı hook).
> 
> **2026-05-22 6 Resilience Katmanı:** (1) Polling loop (3sn/60sn), (2) onError toast + banner, (3) Network offline/online detection, (4) Double submit lock (pendingRef), (5) Server error classification, (6) Stable roomKey.
> 
> **2026-05-22 Test Altyapısı:** Vitest v4 kuruldu, 41 test (schemas, RSI, backtest, error-codes), `npm test` ile çalışır.
> 
> Detaylar için [[report_changes]]

---

## 0. Mevcut Durum Teşhisi (Önce)

### GenerativeUI.tsx — Manuel if/else Zinciri
16 tool'dan sadece 6'sı için UI render ediliyor. 10 tool'un sonucu sadece düz metin olarak gösteriliyor.

### Inngest Processing — Kör Bekleme
Client 30-45 saniye "Optimizing..." yazısına bakıyor, içeride ne olduğu hakkında sıfır bilgi var.

### Hata Yönetimi — Düz Metin
Tool hataları AI tarafından metin olarak yazılıyor, şık bir hata kartı olarak DEĞİL.

---

## 1. Global Component Registry ✅

**Çözüm:** `TOOL_COMPONENT_MAP` — her toolName → React Component eşlemesi. Yeni tool eklemek 1 satır.

**Yeni dosyalar (11):**
- `lib/ai/tool-parser.ts` — `getAllToolResults()`, `getFailedToolResults()`
- `components/ai/registry.tsx` — `TOOL_COMPONENT_MAP` + `getToolCard()`
- `components/ai/ActionConfirmCard.tsx` — 6 action tool
- `components/ai/PriceSnapshotCard.tsx` — fiyat + değişim
- `components/ai/IndicatorSignalsCard.tsx` — sinyal rozetleri
- `components/ai/SearchResultsCard.tsx` — arama sonuçları
- `components/ai/BacktestResultCard.tsx` — backtest sonuçları
- `components/ai/NewsListCard.tsx` — haber kartları
- `components/ai/WatchlistSummaryCard.tsx` — mini izleme listesi
- `components/ai/AlertListCard.tsx` — alarm listesi
- `components/ai/IndicatorRankingCard.tsx` — sıralı indikatör listesi

**Değişen:** `components/GenerativeUI.tsx` — 443→155 satır (-%65)

---

## 2. Reasoning Pipeline ✅

**Çözüm:** Inngest her step'te `steps[]` dizisine ilerleme bilgisini yazar. Client 1.5sn polling ile bu adımları canlı gösterir.

**Değişen (4):**
- `database/models/report.model.ts` — `steps: Mixed[]` + `errorMessage` alanları
- `lib/inngest/functions.ts` — 4 adım canlı izleme (create-report → fetch-candles → run-optimization → finalize)
- `lib/actions/report.actions.ts` — `steps` + `errorMessage` dönüşü
- `components/LiveAnalysisCard.tsx` — `ReasoningChain` bileşeni + polling 3sn→1.5sn

---

## 3. Graceful Error Handling ✅

**Çözüm:** 3 katmanlı hata yakalama (Tool → Inngest → Client UI). Her hata `errorCode` + `userMessage` + `recoverable` ile yapılandırılmış.

**Yeni dosyalar (2):**
- `lib/ai/error-codes.ts` — 8 standart hata kodu + `ERROR_MAP`
- `components/ai/ErrorCard.tsx` — şık kırmızı kart + 3 aksiyon (Retry, Check API, Search)

**Değişen (2):**
- `lib/ai/tools.ts` — `toToolError()` yardımcısı, 6 hata deseni otomatik tespit
- `lib/inngest/functions.ts` — 3 kademeli kullanıcı dostu hata mesajı

---

## Bonus: Smart Titles + Zustand ✅

- `app/api/chat/route.ts` — `generateText()` ile paralel LLM çağrısı, 3 kelimelik başlık
- `store/useAppStore.ts` — `activeJobs: Record<convId, jobId>` global state
- `app/(root)/ai/page.tsx` — Sidebar Loader2 spinner

---

## Sonuç

| Metrik | Önce | Sonra |
|--------|------|-------|
| GenerativeUI satır | 443 | 155 (-%65) |
| Tool Structured UI | 6/16 | 15/16 |
| Processing ekranı | Statik metin | 4 adım canlı ReasoningChain |
| Polling | 3 saniye | 1.5 saniye |
| Hata formatı | `{ error: "teknik" }` | `{ errorCode, userMessage, recoverable }` |
| Hata UI | Düz metin | ErrorCard (actionable) |
| Yeni tool ekleme | 20+ satır | Registry'de 1 satır |
| Kart bileşeni | 2 | 11 |
| Yeni dosya | — | 14 |
| Değişen dosya | — | 5 |
