// Dosya: app.js
const express = require("express");
const { spawn } = require("child_process");
const cors = require("cors");
const db = require("./db");

const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs"); // Dosyayı işimiz bitince silmek için
const upload = multer({ dest: "uploads/" }); // Geçici yükleme klasörü

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static("public")); // Frontend dosyalarını sunmak için

const R_KOMUTU = process.env.RSCRIPT_BIN || "Rscript";

function parsePozitifSayi(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

// --- 1. PROJELERİ LİSTELE (Ana Sayfa Kartları) ---
app.get("/api/projeler", (req, res) => {
  db.all("SELECT * FROM projeler ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// --- 2. YENİ PROJE EKLE ---
app.post("/api/projeler", (req, res) => {
  const { ad, aciklama } = req.body;
  const temizAd = (ad || "").trim();
  const temizAciklama = (aciklama || "").toString().trim();

  if (!temizAd) {
    return res.status(400).json({ error: "Proje adı zorunludur." });
  }

  const tarih = new Date().toISOString().split("T")[0];

  db.run(
    "INSERT INTO projeler (ad, aciklama, olusturma_tarihi) VALUES (?, ?, ?)",
    [temizAd, temizAciklama || null, tarih],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, ad: temizAd, aciklama: temizAciklama, tarih });
    },
  );
});

// --- 3. PROJE SİL ---
app.delete("/api/projeler/:id", (req, res) => {
  const id = req.params.id;
  // Önce o projeye ait verileri sil
  db.run("DELETE FROM veriler WHERE proje_id = ?", id, (err) => {
    // Sonra projeyi sil
    db.run("DELETE FROM projeler WHERE id = ?", id, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ mesaj: "Silindi" });
    });
  });
});

// --- 4. DETAYLI ANALİZ YAP (GÜNCELLENDİ: Dinamik Model Seçimi) ---
app.get("/api/analiz/:projeId", (req, res) => {
  const projeId = parsePozitifSayi(req.params.projeId);
  // Arayüzden model gelmezse varsayılan olarak ARIMA kullan
  const desteklenenModeller = new Set(["ARIMA", "ETS", "NNETAR", "AUTO"]);
  const secilenModel = (req.query.model || "ARIMA").toUpperCase();

  if (!projeId) {
    return res.status(400).json({ error: "Geçerli bir proje ID gönderin." });
  }
  if (!desteklenenModeller.has(secilenModel)) {
    return res.status(400).json({ error: "Geçersiz model seçimi." });
  }

  db.all("SELECT * FROM veriler WHERE proje_id = ?", [projeId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const satislar = rows.map((r) => r.tutar);
    const aylar = rows.map((r) => r.ay);

    if (satislar.length < 2) {
      return res.json({ durum: "yetersiz_veri", detaylar: rows });
    }

    // R Motoruna artık DİZİ(Veriler) ve METİN(Model Adı) olarak 2 şey gönderiyoruz!
    const rProcess = spawn(R_KOMUTU, [
      "tahmin.R",
      satislar.join(","),
      secilenModel,
    ]);
    let rCiktisi = "";
    let rHatasi = "";

    rProcess.stdout.on("data", (data) => {
      rCiktisi += data.toString();
    });

    rProcess.stderr.on("data", (data) => {
      rHatasi += data.toString();
    });

    rProcess.on("error", (error) => {
      return res.status(500).json({
        error: "Rscript başlatılamadı.",
        detay: error.message,
      });
    });

    rProcess.on("close", (code) => {
      const tahmin = parseFloat(rCiktisi.trim());

      if (code !== 0) {
        return res.status(500).json({
          error: "Tahmin motoru çalıştırılamadı.",
          detay: rHatasi || `Rscript çıkış kodu: ${code}`,
        });
      }
      if (!Number.isFinite(tahmin)) {
        return res.status(500).json({
          error: "Tahmin sonucu okunamadı.",
          detay: rHatasi || "R çıktısı sayıya çevrilemedi.",
        });
      }

      res.json({
        durum: "basarili",
        gecmis_veriler: satislar,
        gecmis_aylar: aylar,
        detaylar: rows,
        tahmin: tahmin,
        kullanilan_model: secilenModel, // Hangi modelin çalıştığını arayüze söylüyoruz
      });
    });
  });
});
// --- 5. PROJEYE VERİ EKLE ---
app.post("/api/veri-ekle", (req, res) => {
  const { proje_id, ay, tutar } = req.body;
  const projeId = parsePozitifSayi(proje_id);
  const temizAy = (ay || "").toString().trim();
  const temizTutar = Number(tutar);

  if (!projeId || !temizAy || !Number.isFinite(temizTutar)) {
    return res
      .status(400)
      .json({ error: "proje_id, ay ve sayısal tutar alanları zorunludur." });
  }

  db.run(
    "INSERT INTO veriler (proje_id, ay, tutar) VALUES (?, ?, ?)",
    [projeId, temizAy, temizTutar],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ mesaj: "Eklendi" });
    },
  );
});
// --- 6. VERİ SİL (Hatalı satırı silmek için) ---
app.delete("/api/veri-sil/:id", (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM veriler WHERE id = ?", id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ mesaj: "Veri başarıyla silindi." });
  });
});
// --- 7. EXCEL YÜKLEME (Toplu Veri Girişi) ---
app.post("/api/excel-yukle", upload.single("excelDosyasi"), (req, res) => {
  const projeId = parsePozitifSayi(req.body.proje_id);
  const dosyaYolu = req.file?.path;

  if (!projeId) {
    return res.status(400).json({ error: "Geçerli bir proje_id zorunludur." });
  }
  if (!dosyaYolu) {
    return res.status(400).json({ error: "Excel dosyası bulunamadı." });
  }

  try {
    // 1. Excel dosyasını oku
    const workbook = xlsx.readFile(dosyaYolu);
    const sheetName = workbook.SheetNames[0]; // İlk sayfayı al
    const sheet = workbook.Sheets[sheetName];

    // 2. Veriyi JSON'a çevir
    const veriListesi = xlsx.utils.sheet_to_json(sheet);

    // 3. Veritabanına Ekle (Döngü ile)
    // Excel'de sütun başlıklarının "Ay" ve "Tutar" olduğunu varsayıyoruz
    const stmt = db.prepare(
      "INSERT INTO veriler (proje_id, ay, tutar) VALUES (?, ?, ?)",
    );

    let eklenenSayisi = 0;
    veriListesi.forEach((satir) => {
      // Excel başlıkları büyük/küçük harf olabilir, kontrol edelim
      const ay = satir["Ay"] || satir["ay"] || satir["AY"];
      const tutar = satir["Tutar"] || satir["tutar"] || satir["TUTAR"];
      const temizTutar = Number(tutar);

      if (ay && Number.isFinite(temizTutar)) {
        stmt.run(projeId, ay, temizTutar);
        eklenenSayisi++;
      }
    });

    stmt.finalize();

    // 4. Geçici dosyayı sil (Sunucuda çöp birikmesin)
    fs.unlinkSync(dosyaYolu);

    res.json({ mesaj: `${eklenenSayisi} adet veri başarıyla yüklendi.` });
  } catch (hata) {
    if (dosyaYolu && fs.existsSync(dosyaYolu)) {
      fs.unlinkSync(dosyaYolu);
    }
    res.status(500).json({ error: "Excel okunamadı: " + hata.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Uygulama çalışıyor: http://localhost:${PORT}`);
});
