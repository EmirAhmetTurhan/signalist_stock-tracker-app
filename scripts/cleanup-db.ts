/**
 * scripts/cleanup-db.ts — Veritabanı Temizlik Scripti
 * 
 * KULLANIM: npx tsx scripts/cleanup-db.ts
 * 
 * Bu script aşağıdaki koleksiyonlardaki TÜM dökümanları siler:
 *   - conversations (sohbetler)
 *   - messages (mesajlar)
 *   - aijobs (AI işleri)
 *   - reports (raporlar)
 *   - notifications (bildirimler)
 *   - savedstrategies (kayıtlı stratejiler)
 *   - analysisnotes (analiz notları)
 * 
 * Kullanıcı hesapları (users/accounts), portföy verileri (wallets/positions/trades),
 * fiyat alarmları, watchlist'ler, forward-test stratejileri vb. KORUNUR.
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
}

async function cleanup() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI!, {
        bufferCommands: false,
    });
    console.log('Connected.\n');

    const db = mongoose.connection.db!;

    // ─── Silinecek koleksiyonlar ─────────────────────────────────────────
    const collectionsToClean = [
        { name: 'conversations', label: 'Sohbetler (Conversations)' },
        { name: 'messages', label: 'Mesajlar (Messages)' },
        { name: 'aijobs', label: 'AI İşleri (AIJobs)' },
        { name: 'reports', label: 'Raporlar (Reports)' },
        { name: 'notifications', label: 'Bildirimler (Notifications)' },
        { name: 'savedstrategies', label: 'Kayıtlı Stratejiler (SavedStrategies)' },
        { name: 'analysisnotes', label: 'Analiz Notları (AnalysisNotes)' },
    ];

    let totalDeleted = 0;

    for (const col of collectionsToClean) {
        try {
            const exists = await db.listCollections({ name: col.name }).hasNext();
            if (!exists) {
                console.log(`  ⏭️  ${col.label}: koleksiyon bulunamadı, atlanıyor.`);
                continue;
            }
            const result = await db.collection(col.name).deleteMany({});
            const count = result.deletedCount || 0;
            totalDeleted += count;
            console.log(`  ✅ ${col.label}: ${count} döküman silindi.`);
        } catch (err) {
            console.error(`  ❌ ${col.label}: hata ->`, err);
        }
    }

    console.log(`\n📊 Toplam silinen döküman: ${totalDeleted}`);
    console.log('✅ Veritabanı temizliği tamamlandı.');

    await mongoose.disconnect();
    console.log('Bağlantı kapatıldı.');
}

cleanup().catch((err) => {
    console.error('Script hatası:', err);
    process.exit(1);
});
