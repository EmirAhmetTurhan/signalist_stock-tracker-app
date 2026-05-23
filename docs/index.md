# Signalist — Proje Dokümantasyon Merkezi

> **Amaç:** Signalist projesinin tüm bilgi sistemine açılan ana navigasyon merkezi.
> **Kapsam:** Mimari, frontend, backend, veritabanı, teknik analiz, deployment — tüm alanlar.
> **Son güncelleme:** 2026-05-22 (4-faz refactoring + 6 kritik düzeltme + test altyapısı — 41 test, vitest)

---

## Proje Özeti

**Signalist**, bireysel yatırımcılar için geliştirilmiş, full-stack Next.js borsa takip ve teknik analiz web uygulamasıdır.
Kullanıcılar hisse senetlerini takip eder, izleme listeleri oluşturur, fiyat alarmları kurar,
20 analiz aracıyla (17 indikatör + 3 formasyon aracı) teknik analiz yapar,
backtest çalıştırır, AI Agent (Qwen 3 14B, 18 tool) ile gerçek zamanlı finansal analiz alır
ve AI destekli günlük piyasa haber özetleri alır.

---

## İçindekiler

| # | Doküman | Amaç |
|---|---------|------|
| 1 | [[project-overview]] | Hedefler, kullanıcı kitlesi, teknoloji yığını, dış API'ler |
| 2 | [[architecture]] | Sistem tasarımı, veri akışları, auth akışı, tasarım desenleri |
| 3 | [[frontend]] | App Router yapısı, route grupları, tüm UI bileşenleri, TA sayfası |
| 4 | [[backend]] | Server Actions, Finnhub/Yahoo entegrasyonları, Inngest, Nodemailer, AI Chat |
| 5 | [[database]] | MongoDB yapısı, Mongoose modelleri, indexler, şemalar |
| 6 | [[technical-analysis]] | Tüm 20 analiz aracı, sinyal mantığı, backtest motoru, optimizasyon |
| 7 | [[deployment-env]] | Ortam değişkenleri, scriptler, üretim riskleri, yaygın hatalar |
| 8 | [[rules-critical]] | Hassas dosyalar, değiştirilmemesi gereken sistemler, rate limitler |
| 9 | [[future-roadmap]] | Genişleme desenleri, yeni indikatör ekleme, ölçekleme fikirleri |
| 10 | [[ai-agent-architecture]] | AI Agent TAM mimarisi — 18 tool, Router Agent, Inngest, Generative UI, tüm fazlar |
| 11 | [[report_changes]] | Tüm değişikliklerin gerekçeli raporu (48+ düzeltme) |
| 12 | [[architectural-transformation-plan]] | Agentic UI Dönüşüm Planı (✅ Tamamlandı) — Component Registry + Reasoning Pipeline + Graceful Errors |

---

## Hızlı Referans

### Kritik Dosyalar (dikkatsizce değiştirilmemeli)

| Dosya | Neden |
|-------|-------|
| `middleware.ts` | Auth kapısı — `matcher` regex'inin bozulması tüm route korumasını kırar |
| `lib/better-auth/auth.ts` | Auth singleton — çift instance memory leak'e yol açar |
| `database/mongoose.ts` | DB bağlantı önbelleği — hot reload'da bağlantı fırtınasını önler |
| `.env` | Tüm secret'lar — `.gitignore` deseni: `.env*` |
| `lib/ai/tools.ts` | 18 AI tool tanımı — Zod şemaları + 5 savunma hattı |
| `lib/ai/prompts.ts` | System prompt — Router Agent kategorileri + INDICATOR_NAMES_STRING referansı |
| `hooks/useChatManager.ts` | Paylaşımlı chat hook'u — transport, hydration, polling loop, stale timer, lazy creation, auto-scroll |
| `lib/constants/indicators.ts` | Tüm 17 indikatörün tek kaynak sabiti (INDICATOR_REGISTRY) |
| `lib/actions/smart-alerts.actions.ts` | Smart alert AI tool'ları için programatik action'lar |
| `lib/actions/alerts.actions.ts` | Fiyat alarmı action'ları + AI tool'lar için programatik createAlert/deleteAlert |
| `vitest.config.ts` | Test runner konfigürasyonu — `@/` path alias, `**/*.test.ts` pattern'i |
| `lib/indicators/rsi.test.ts` | RSI indikatörü unit test (8 test) |
| `lib/ta/backtest.test.ts` | Backtest motoru unit test (7 test) |
| `lib/validations/schemas.test.ts` | Zod validasyon testleri (14 test) |
| `lib/ai/error-codes.test.ts` | Hata kodu tespit testleri (12 test) |

### En Karmaşık Sistemler

**[[ai-agent-architecture|AI Agent]]** (`lib/ai/` + `app/api/chat/route.ts` + `app/(root)/ai/page.tsx` + `components/ai/` + `hooks/useChatManager.ts`) — En kapsamlı sistem. Qwen 3 14B + Vercel AI SDK v6. **18 tool** (5 savunma hattı: Zod, try-catch, timeout, yieldToMain, toToolError). **Router Agent** kategorizasyonu (SYSTEM / TA_TOOLS / RESEARCH_TOOLS / USER_TOOLS / SEARCH). **Inngest arka plan işlemleri** (optimizeParameter + rankIndicators, 4 adım ReasoningChain). **Multi-room izolasyonu** (roomKey/convId ayrımı). **useChatManager** paylaşımlı hook. **Generative UI** (Component Registry — 11 kart tipi). **6 katmanlı hata yönetimi** (polling loop, onError toast, network detection, double submit lock, server error propagation, stable roomKey). **Test altyapısı** (vitest, 41 test). Toplam 54+ stabilite düzeltmesi.

**[[technical-analysis|Teknik Analiz Sayfası]]** (`app/(root)/ta/page.tsx`) — 484 satır (914'ten indirildi), 17 indikatör + 3 formasyon aracı, sinyal skorlama, backtesting, strateji birleştirme, mum formasyonu tespiti, fraktal eşleştirme, destek/direnç tespiti. Hesaplama ve sinyal mantığı `lib/ta/` servis katmanına çıkarıldı.

### Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 16.0.3 (App Router + Turbopack) |
| Dil | TypeScript 5.x (strict) |
| UI | React 19.2.0, Tailwind CSS v4, Radix UI, shadcn/ui (new-york) |
| Grafikler | lightweight-charts v4.2.0, TradingView widget'ları (iframe) |
| Veritabanı | MongoDB Atlas + Mongoose v9.0.0 |
| Auth | Better Auth v1.4.1 (email/şifre) |
| Arkaplan İşleri | Inngest v4.3.0 (cron + event-driven + AI optimize) |
| E-posta | Nodemailer v7.0.10 (Gmail SMTP) |
| AI (E-posta) | Google Gemini (gemini-2.5-flash-lite, Inngest AI plugin) |
| AI Agent (Gerçek Zamanlı) | Qwen 3 14B (Ollama) + Vercel AI SDK v6 — 16 tool, streaming, Generative UI |
| Global State | Zustand (activeJobs, watchlist, activeIndicators) |
| Test Runner | Vitest v4 — 41 test, 4 test dosyası, 156ms |

---

## Bilgiye Erişim Rehberi

- **Auth nasıl çalışıyor?** → [[architecture#Auth Akışı]]
- **T/A mantığı nerede?** → [[technical-analysis]]
- **Hangi env değişkenleri gerekli?** → [[deployment-env#Ortam Değişkenleri]]
- **İndikatörler nerede tanımlı?** → [[technical-analysis#İndikatör Kütüphanesi]]
- **Veri API'den grafiğe nasıl akıyor?** → [[architecture#TA Sayfası Veri Akışı]]
- **Nelere asla dokunulmamalı?** → [[rules-critical#Değiştirilmemesi Gerekenler]]
- **Yeni bir indikatör nasıl eklenir?** → [[future-roadmap#Yeni Teknik İndikatör Ekleme]]
- **Veritabanı modelleri nerede?** → [[database]]
- **AI Agent tam mimarisi nedir?** → [[ai-agent-architecture]]
- **Yeni AI tool nasıl eklenir?** → [[ai-agent-architecture]] + [[architectural-transformation-plan]]
- **Hata yönetimi nasıl çalışır?** → [[ai-agent-architecture#6 Gerçek Zamanlı UI Mimarisi]]
