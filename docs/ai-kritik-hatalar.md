# Signalist: AI Sistem Kararlılık ve Güvenlik Desenleri

> **Durum:** ✅ **Uygulandı ve Aktif.**
> **Son güncelleme:** 2026-05-26
> **Not:** Bu doküman daha önce yapay zekanın araştırdığı zayıflıkların/hataların kalıcı olarak nasıl çözüldüğünü ve sistemin yeni dayanıklılık kurallarını açıklar. Sistemdeki tüm "kritik" zaafiyetler giderilmiş ve kurumsal mimari standartlarına taşınmıştır.

Bu doküman, Signalist AI mimarisinin nasıl dış etkilere, arızalara ve kullanıcı müdahalelerine karşı **kararlı (resilient)** ve **güvenli** hale getirildiğini özetler.

---

## 1. Asenkron Durabilite (Inngest Worker Mimarisi)

Önceleri LLM çağrısı ve Tool kullanımı ana Node.js Event Loop'unu veya request süresini bloke eden senkron yapılar içeriyordu. Şu anki mimaride **Tam Asenkron** (Async First) yaklaşımı kullanılmaktadır.

### Dayanıklılık Mekanizmaları:
- **`generateText` İşlem İzolasyonu:** `lib/inngest/chat-async.ts` dosyasında `ai/process-chat-message` event'ine bağlanmıştır. API süresi (90s) timeout'undan bağımsız çalışır.
- **Adım Adım İzleme (Step Tracking):** Frontend doğrudan Vercel SDK stream beklemek yerine 1.5 saniyede bir DB üzerinden `AIJob` kontrolü yapar. Sunucu çökse bile Inngest görevi tekrar dener.
- **DB Write Idempotency:** Assistant mesajları (LLM cevabı ve Tool sonuçları) `generateText`'in `onStepFinish` hook'undan arındırılarak görevin en sonunda **tek ve tutarlı bir işlem** (atomic write) olarak veritabanına işlenir.

---

## 2. API Güvenliği ve Veri Gizliliği

Kullanıcı API Key'leri ve hassas veriler geçmişte `localStorage` üzerinden transfer edilirken, mimari köklü bir güvenlik refactor'ünden geçmiştir.

### Uygulanan Kurallar:
- **İstemci Tarafında Şifre Yok:** `signalist-user-api-key` kullanım dışıdır. Tüm provider anahtarları (Groq, OpenAI, vb.) server side'da tutulur ve DB/KV'den güvenli çekilir.
- **Context Injection:** `next/headers` ve Authentication (userId) gibi bileşenler Inngest worker'a doğrudan event payload olarak aktarılmaz; payload sadece tetikleyici olarak çalışır ve Auth doğrulamasını middleware/route üstlenir. Inngest işlevi güvenilen (trusted) context'te çalıştırılır.

---

## 3. Akıllı Polling ve Sonuç Birleştirme (Tool-Result Merge)

Ağır görevlerin sonucunu Client tarafına yansıtırken veri mükerrerliği ve "Ghost Polling" sorunlarına karşı aşağıdaki desen uygulanmıştır.

### Tool Output Merging Logic:
- **Tek Veritabanı (Single Source of Truth):**
  Frontend (`useChatManager`) ve Backend (`chat-async.ts`) iki ayrı tool-result kaydetmeye çalışmaz. `chat-async.ts` içerisindeki `extractPartsFromMsg` yardımcı fonksiyonu, `tool-call` ve `tool-result` parçalarını eşleştirerek (Atomic Pairing) tek bir mesaj parçasında saklar.
- **Race Condition Koruması:**
  Mesaj parçaları sliding window ile bölünürken (`slice(-10)`), birbiriyle ilişkili `tool-call` ve `tool-result` çiftleri birbirinden ayrılmaz. Bu durum LLM sağlayıcılarında hata (Orphan Tool Result Error) oluşmasını engeller.

---

## 4. Watchdog ve Hata Toleransı Kalkanı

Uzun süren Background Job'lar ve Timeout'lara karşı korumalar:
- **`withTimeout` ve Event Loop Yield:** Ağır teknik analiz (TA) araçlarında API kaynaklı kilitlenmeleri çözmek için 15sn-45sn arası strict timeout'lar eklenmiştir (`lib/ai/tools.ts`).
- **5-Dakika Watchdog İzolesi:** Cron işlemleri ve "Fail-safe" kalkanı asenkron işlemlere taşınmıştır. Veritabanı operasyonlarında beklenmedik fail damgaları engellenmiştir.
- **Çoklu Provider Stratejisi:** Model registry (`model-resolver.ts`) genişletilmiş, yetersiz yapılandırma nedeniyle çalışan "Ölü Kod (Dead Code)" ihtimalleri temizlenmiştir.

Bu kurallar, AI sisteminin production (canlı ortam) şartlarında hiçbir hata logu sızdırmadan kararlı şekilde çalışmasını garanti eder.