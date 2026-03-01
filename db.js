// Dosya: db.js
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./muhasebe.sqlite");

db.serialize(() => {
  // 1. PROJELER TABLOSU (Ana Sayfadaki Kartlar)
  db.run(`CREATE TABLE IF NOT EXISTS projeler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad TEXT,
        aciklama TEXT,
        olusturma_tarihi TEXT
    )`);

  // 2. VERİLER TABLOSU (Analiz için kullanılacak sayılar)
  // Her veri bir projeye bağlı olacak (proje_id ile)
  db.run(`CREATE TABLE IF NOT EXISTS veriler (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proje_id INTEGER,
        ay TEXT,
        tutar REAL,
        FOREIGN KEY(proje_id) REFERENCES projeler(id) ON DELETE CASCADE
    )`);

  // --- Başlangıç İçin Örnek Bir Proje Ekleyelim ---
  db.get("SELECT count(*) as sayi FROM projeler", (err, row) => {
    if (row.sayi === 0) {
      console.log("📦 Veritabanı boş, örnek proje oluşturuluyor...");

      // Örnek Proje: "Market A.Ş."
      db.run(
        "INSERT INTO projeler (ad, aciklama, olusturma_tarihi) VALUES (?, ?, ?)",
        ["Market A.Ş.", "Perakende satış analizleri", "2026-02-10"],
        function (err) {
          const projeId = this.lastID; // Yeni eklenen projenin ID'sini al

          // O projeye ait verileri ekle
          const stmt = db.prepare(
            "INSERT INTO veriler (proje_id, ay, tutar) VALUES (?, ?, ?)",
          );
          stmt.run(projeId, "Eylül", 12000);
          stmt.run(projeId, "Ekim", 15000);
          stmt.run(projeId, "Kasım", 14000);
          stmt.run(projeId, "Aralık", 18000);
          stmt.finalize();
        },
      );
    }
  });
});

module.exports = db;
