/**
 * scripts/clean-db.ts — Database Temizleme Aracı
 *
 * Kullanım: npx tsx scripts/clean-db.ts
 *
 * Auth (better-auth) verileri HARİÇ tüm uygulama verilerini temizler.
 * Korunan koleksiyonlar: user, session, account, verification
 *
 * Temizlenen koleksiyonlar (16 adet):
 *   aijobs, analysisnotes, conversations, messages, forwardteststrategies,
 *   notifications, pendingorders, positions, pricealerts, reports,
 *   savedstrategies, smartalerts, strategymetas, trades, wallets, watchlists
 */

// clear the database : echo yes | npx tsx --env-file=.env scripts/clean-db.ts




import { connectToDatabase } from "../database/mongoose";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   🧹 Signalist DB Temizleme Aracı          ║");
  console.log("║   Auth verileri (user/session) korunur     ║");
  if (DRY_RUN) {
    console.log("║   🔍 DRY RUN MODU — sadece raporlar        ║");
  }
  console.log("╚══════════════════════════════════════════════╝\n");

  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db!;

  // ── Tüm koleksiyonları listele ──
  const allCols = await db.listCollections().toArray();
  const allNames = allCols.map((c) => c.name);

  console.log(`📦 Veritabanında ${allCols.length} koleksiyon bulundu:`);
  allCols.forEach((c) => console.log(`   • ${c.name}`));

  // ── Korunacak koleksiyonlar (better-auth) ──
  const PROTECTED = new Set(["user", "session", "account", "verification"]);

  // ── Silinecek koleksiyonları belirle ──
  const toDelete = allNames.filter((name) => !PROTECTED.has(name));

  if (toDelete.length === 0) {
    console.log("\n✅ Temizlenecek koleksiyon bulunamadı.");
    process.exit(0);
  }

  // ── Belge sayılarını göster ──
  console.log(`\n${DRY_RUN ? "🔍 İncelenecek" : "🗑️  Temizlenecek"} ${toDelete.length} koleksiyon:`);
  let totalDocs = 0;
  for (const colName of toDelete) {
    const count = await db.collection(colName).countDocuments();
    totalDocs += count;
    console.log(`   • ${colName} — ${count} belge`);
  }
  console.log(`\n📊 Toplam: ${totalDocs} belge ${DRY_RUN ? "bulundu" : "silinecek"}`);
  console.log(`\n🔒 Korunan koleksiyonlar: ${[...PROTECTED].join(", ")}`);

  if (DRY_RUN) {
    console.log("\n✅ Dry run tamamlandı. Hiçbir veri silinmedi.");
    console.log('   Temizlemek için: npx tsx scripts/clean-db.ts "yes" yazın.');
    process.exit(0);
  }

  // ── Onay ──
  console.log('\n⚠️  BU İŞLEM GERİ ALINAMAZ! "yes" yazarak onaylayın.\n');

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question("> ", async (answer: string) => {
    readline.close();

    if (answer.trim().toLowerCase() !== "yes") {
      console.log("\n❌ İşlem iptal edildi.");
      process.exit(0);
    }

    console.log("\n⏳ Temizleme başlıyor...\n");

    let totalDeleted = 0;

    for (const colName of toDelete) {
      try {
        const collection = db.collection(colName);
        const countBefore = await collection.countDocuments();
        const result = await collection.deleteMany({});

        totalDeleted += result.deletedCount;
        console.log(
          `   ✅ ${colName}: ${result.deletedCount} belge silindi (${countBefore} mevcuttu)`,
        );
      } catch (err: any) {
        console.log(`   ❌ ${colName}: HATA — ${err.message}`);
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Toplam: ${totalDeleted} belge silindi`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Kalan koleksiyonlar
    const remaining = await db.listCollections().toArray();
    console.log(`📦 Kalan koleksiyonlar (${remaining.length}):`);
    remaining.forEach((c) => console.log(`   • ${c.name}`));

    if (remaining.length === PROTECTED.size) {
      console.log("\n✅ Veritabanı tamamen temizlendi! Sadece auth verileri kaldı.");
    }

    process.exit(0);
  });
}

main().catch((err) => {
  console.error("❌ Kritik hata:", err);
  process.exit(1);
});