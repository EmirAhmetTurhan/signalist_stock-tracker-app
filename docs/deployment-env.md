# Deployment & Ortam

> **Amaç:** Ortam değişkeni referansı, build/run script'leri, yaygın hatalar ve production deployment değerlendirmeleri.
> **Kapsam:** `.env`, `package.json` script'leri, Next.js konfigürasyonu, üretim riskleri.
> **Ayrıca bakınız:** [[project-overview]], [[rules-critical]]
> **Son güncelleme:** 2026-05-22 (test script'leri + vitest konfigürasyonu)

---

## Ortam Değişkenleri (`.env`)

Proje kök dizininde bulunur. `.gitignore` deseni `.env*` ile git'ten hariç tutulur.
Her geliştirici ve her ortam (dev/prod) için ayrı `.env` dosyası gerekir.

### Tam Referans

| Değişken | Zorunlu | Amaç | Örnek |
|----------|---------|------|-------|
| `MONGODB_URI` | **Evet** | MongoDB Atlas bağlantı dizesi | `mongodb+srv://user:pass@cluster.mongodb.net/...` |
| `BETTER_AUTH_SECRET` | **Evet** | Better Auth oturum şifreleme anahtarı | Rastgele string |
| `BETTER_BASE_URL` | **Evet** | Auth callback temel URL'i | `http://localhost:3000` (dev) veya production URL |
| `BETTER_AUTH_URL` | Hayır | BETTER_BASE_URL için takma ad | Yukarıdaki ile aynı |
| `GEMINI_API_KEY` | Yalnızca e-posta | AI özellikleri için Google Gemini API anahtarı | `AIzaSy...` |
| `NODEMAILER_EMAIL` | Yalnızca e-posta | E-posta gönderimi için Gmail adresi | `you@gmail.com` |
| `NODEMAILER_PASSWORD` | Yalnızca e-posta | Gmail Uygulama Şifresi (hesap şifresi değil) | 16 karakterli uygulama şifresi |
| `FINNHUB_API_KEY` | Hisse verisi | Finnhub API anahtarı (**sadece sunucu tarafı**, `NEXT_PUBLIC_` prefix'i YOK). Client bundle'a dahil edilmez | `d4jf...` |
| `NEXT_PUBLIC_BASE_URL` | Hayır | Uygulama temel URL'i | `http://localhost:3000` |
| `INNGEST_DEV` | Hayır | Inngest development modu (production'da OLMAMALI) | `1` |
| `OLLAMA_BASE_URL` | AI Agent | Ollama API adresi (varsayılan: `http://localhost:11434/api`) | `http://localhost:11434/api` |
| `AI_MODEL` | AI Agent | Kullanılacak Ollama modeli (varsayılan: `qwen3:14b`) | `qwen3:14b` |
| `NODE_ENV` | Hayır | Ortam adı | `development` / `production` |

> **Not (2026-05-21):** `NEXT_PUBLIC_FINNHUB_API_KEY` prefix'i kaldırıldı. API anahtarı artık sadece `FINNHUB_API_KEY` olarak sunucu tarafında okunur. Geçiş dönemi için `finnhub.actions.ts` içinde `process.env.FINNHUB_API_KEY ?? process.env.NEXT_PUBLIC_FINNHUB_API_KEY` fallback zinciri korundu. `.env` dosyasında sadece `FINNHUB_API_KEY` tanımlıdır.

### Eksik Değişken Davranışı

| Eksik | Etki |
|-------|------|
| `MONGODB_URI` | Uygulama hemen çöker: `"MONGODB_URI must be set within .env"` |
| `BETTER_AUTH_SECRET` | Auth başlatma başarısız olur |
| `BETTER_BASE_URL` | Auth yönlendirmeleri bozulabilir |
| `FINNHUB_API_KEY` | Hisse arama boş döner, mumlar sessizce başarısız olur, haberler hata döner |
| `GEMINI_API_KEY` | Inngest AI adımları başarısız olur; e-postalar fallback metin alır |
| `NODEMAILER_*` | E-posta gönderimi başarısız olur |
| `INNGEST_DEV` (production'da ayarlanmamış) | Inngest production modda çalışır (Inngest Cloud'a bağlanır) |

---

## Build & Run Script'leri

| Komut | Ne Yapar |
|--------|---------|
| `npm run dev` | Turbopack dev sunucusunu 3000 portunda başlatır (meşgulse 3001'e geçer) |
| `npm run build` | React Compiler etkinken production build alır |
| `npm run start` | Production sunucusunu başlatır (önce `build` çalıştırılmalıdır) |
| `npm run lint` | `eslint-config-next` (`next/core-web-vitals`) konfigürasyonuyla ESLint çalıştırır |
| `npm test` | Vitest test suite'ini tek seferlik çalıştırır (41 test) |
| `npm run test:watch` | Vitest watch modu — dosya değişince otomatik yeniden çalıştırır |
| `npx vitest run` | Vitest'i doğrudan çalıştırır (npm script'i dışında) |
| `npx vitest` | Vitest UI modu — interaktif dashboard açar |

---

## Next.js Konfigürasyonu (`next.config.ts`)

```typescript
const nextConfig: NextConfig = {
  reactCompiler: true,  // React 19 Compiler aktif
};
```

**React Compiler:** Bileşenleri ve hook'ları otomatik memoize eder. Çoğu durumda manuel `useMemo`/`useCallback` ihtiyacını ortadan kaldırır.

---

## TypeScript Konfigürasyonu (`tsconfig.json`)

Önemli ayarlar:
- `strict: true` — Tam tip kontrolü
- `target: "ES2017"` — Node.js 8+ uyumlu
- `moduleResolution: "bundler"` — Turbopack uyumluluğu için
- `paths: { "@/*": ["./*"] }` — `@/` import'ları proje köküne eşler
- `jsx: "react-jsx"` — Yeni JSX transform (manuel React import'u gerekmez)

---

## Yaygın Hatalar

| Hata | Nedeni | Çözüm |
|------|--------|-------|
| `MONGODB_URI must be set within .env` | `.env` dosyası eksik veya boş | `.env` oluşturun ve `MONGODB_URI` değerini ekleyin |
| Finnhub verisi gelmiyor | API anahtarı eksik | `NEXT_PUBLIC_FINNHUB_API_KEY` değerini `.env`'e ekleyin |
| `NEXT_REDIRECT` (hata değil) | Auth guard'ı `/sign-in` sayfasına yönlendiriyor | Beklenen davranış — önce giriş yapın |
| `Unable to acquire lock at .next/dev/lock` | Çöken dev sunucusundan kalan kilit dosyası | `.next/dev/lock` dosyasını silin ve eski Node process'lerini sonlandırın |
| Port 3000 kullanımda | Başka bir process 3000 portunda | Otomatik 3001'e geçer veya engelleyen process'i sonlandırın |
| `E11000 duplicate key error` (watchlist) | Hisse zaten izleme listesinde | Sessizce yönetilir — `{ ok: true }` döner |

---

## Production Deployment Değerlendirmeleri

### Dağıtım Öncesi Kontrol Listesi
1. `NODE_ENV=production` ayarlayın
2. `BETTER_BASE_URL`'i production domain'e ayarlayın (örn. `https://signalist.app`)
3. MongoDB Atlas IP beyaz listesinin production sunucu IP'sini içerdiğinden emin olun
4. `npm run build` çalıştırın ve sıfır hata olduğunu doğrulayın
5. Tüm zorunlu env değişkenlerinin production ortamında ayarlandığını doğrulayın
6. `INNGEST_DEV` değişkenini production'da **KALDIRIN** (aksi halde Inngest production modda çalışmaz)

### Rate Limit Riskleri

- **Finnhub ücretsiz tier:** 60 istek/dakika. Production'da birden fazla kullanıcıyla API çağrıları katlanır. Finnhub planını yükseltmeyi veya mevcut önbellek tabanlı yaklaşımın ötesinde sunucu tarafı rate limiting eklemeyi düşünün.
- **Yahoo Finance:** Gayriresmi API, SLA yok. Her an bozulabilir veya beklenmedik şekilde rate-limit uygulayabilir.
- **Gmail SMTP:** Ücretsiz Gmail'de 500 e-posta/gün, Google Workspace'te 2000/gün.

### Yerleşik İzleme Yok

Uygulamada izleme, hata takibi veya log birleştirme bulunmamaktadır. Production deployment'a şunlar eklenmelidir:
- Hata takibi (Sentry veya benzeri)
- Uptime izleme
- MongoDB Atlas uyarıları
- Inngest fonksiyon başarısızlık bildirimleri
