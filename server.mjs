// server.mjs - Versi Final Lengkap (Semua Fitur Termasuk) + PIC & KONTRAKTOR - SUDAH DIPERBAIKI

// 1. Impor semua library yang dibutuhkan
import express from "express";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import axios from "axios";
import sharp from "sharp";

// 2. Konfigurasi awal
dotenv.config({ path: "./.env.local" });
const app = express();
const port = 3001;

// 3. Middleware
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// 4. Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 5. Otentikasi Google (HANYA untuk Sheets)
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const doc = new GoogleSpreadsheet(
  process.env.SPREADSHEET_ID,
  serviceAccountAuth
);

// =================================================================
// FUNGSI BANTU
// =================================================================
const logLoginAttempt = async (username, status) => {
  try {
    await doc.loadInfo();
    const logSheet = doc.sheetsByTitle["log_login"];
    if (logSheet) {
      const timestamp = new Date().toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      });
      await logSheet.addRow({ username, waktu: timestamp, status });
    }
  } catch (logError) {
    console.error("Gagal menulis ke log_login:", logError);
  }
};

// >>>>> PASTE BLOCK INI DI SINI <<<<<
// -- helper pembuat kunci stabil untuk RAB --
const _normKey = (v) => (v ?? "").toString().trim().toUpperCase();
const _numKey  = (v) => {
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/**
 * Buat rab_key dari kombinasi field yang stabil.
 * Bisa dipanggil dengan row GoogleSheet (punya .get) atau object itemData.
 */
const makeRabKey = (src) => {
  const kode   = _normKey(src.get ? src.get("kode_toko") : src.kode_toko);
  const ulok   = _normKey(src.get ? src.get("no_ulok") : src.no_ulok);
  const ling   = _normKey(src.get ? src.get("lingkup_pekerjaan") : src.lingkup_pekerjaan);
  const jenis  = _normKey(src.get ? src.get("jenis_pekerjaan") : src.jenis_pekerjaan);
  const satuan = _normKey(src.get ? src.get("satuan") : src.satuan);
  const hmat   = _numKey(src.get ? src.get("harga_material") : src.harga_material);
  const hupah  = _numKey(src.get ? src.get("harga_upah") : src.harga_upah);
  return [kode, ulok, ling, jenis, satuan, hmat, hupah].join("||");
};
// <<<<< SAMPAI SINI >>>>>

// =================================================================
// API ENDPOINTS
// =================================================================

// --- Endpoint Upload Foto (dengan konversi ke JPEG) ---
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Tidak ada file yang di-upload." });
    }
    const jpegBuffer = await sharp(req.file.buffer)
      .jpeg({ quality: 90 })
      .toBuffer();
    const uploadStream = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "opname_alfamart" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });
    };
    const result = await uploadStream(jpegBuffer);
    res.status(200).json({ link: result.secure_url });
  } catch (error) {
    console.error("Error saat upload ke Cloudinary:", error);
    res.status(500).json({ message: "Gagal meng-upload file." });
  }
});

// --- Endpoint Login (PIC + KONTRAKTOR via data_kontraktor) ---
app.post("/api/login", async (req, res) => {
  try {
    await doc.loadInfo();

    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username dan password diperlukan." });
    }

    const inputUsername = String(username).trim();
    const inputPassword = String(password).trim();

    // 1) Coba login sebagai PIC lewat sheet 'users' (tetap seperti semula)
    const usersSheet = doc.sheetsByTitle["users"];
    if (usersSheet) {
      const rows = await usersSheet.getRows();
      const userRow = rows.find((row) => {
        const sheetUsername = row.get("username")?.trim();
        const sheetPassword = row.get("password")?.toString().trim();
        return (
          sheetUsername?.toLowerCase() === inputUsername.toLowerCase() &&
          sheetPassword === inputPassword
        );
      });

      if (userRow) {
        await logLoginAttempt(inputUsername, "SUCCESS(PIC)");
        const userData = {
          id: userRow.get("id"),
          username: userRow.get("username"),
          name: userRow.get("name"),
          role: userRow.get("role"),
          ...(userRow.get("role") === "pic" && {
            kode_toko: userRow.get("kode_toko"),
            no_ulok: userRow.get("no_ulok"),
          }),
          ...(userRow.get("role") === "kontraktor" && {
            company: userRow.get("company"),
          }),
        };
        return res.status(200).json(userData);
      }
    }
    // Catatan: jika sheet 'users' tidak ada, kita lanjut ke cek kontraktor tanpa error 500.

    // 2) Coba login sebagai KONTRAKTOR via sheet 'data_kontraktor'
    const kontraktorSheet = doc.sheetsByTitle["data_kontraktor"];
    if (!kontraktorSheet) {
      // Jika sheet ini pun tidak ada, benar-benar gagal auth
      await logLoginAttempt(inputUsername, "FAILED(NO_SHEETS)");
      return res.status(401).json({ message: "Username atau password salah" });
    }

    const kRows = await kontraktorSheet.getRows();
    const kRow = kRows.find((row) => {
      const namaKontraktor = row.get("nama_kontraktor")?.trim() || "";
      const namaCabang = row.get("nama_cabang")?.trim() || "";
      return (
        namaKontraktor.toLowerCase() === inputUsername.toLowerCase() &&
        namaCabang.toLowerCase() === inputPassword.toLowerCase()
      );
    });

    if (kRow) {
      const status = (kRow.get("status_kontraktor") || "")
        .toString()
        .trim()
        .toUpperCase();
      if (status && status !== "AKTIF") {
        await logLoginAttempt(inputUsername, "FAILED(NOT_ACTIVE)");
        return res
          .status(403)
          .json({ message: "Akun kontraktor tidak aktif." });
      }

      await logLoginAttempt(inputUsername, "SUCCESS(KONTRAKTOR)");
      return res.status(200).json({
        id: kRow.get("no") || "",
        username: kRow.get("nama_kontraktor") || inputUsername,
        name: kRow.get("nama_kontraktor") || inputUsername,
        role: "kontraktor",
        company: kRow.get("nama_kontraktor") || "",
        cabang: kRow.get("nama_cabang") || "",
        status_kontraktor: kRow.get("status_kontraktor") || "",
      });
    }

    // 3) Jika tidak cocok di keduanya
    await logLoginAttempt(inputUsername, "FAILED");
    return res.status(401).json({ message: "Username atau password salah" });
  } catch (error) {
    console.error("Error di /api/login:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- ENDPOINT BARU: PIC & KONTRAKTOR dari tab opname_final (by no_ulok) ---
app.get("/api/pic-kontraktor-opname", async (req, res) => {
  try {
    const { no_ulok } = req.query;
    if (!no_ulok)
      return res.status(400).json({ message: "No. Ulok diperlukan." });

    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    const rows = await finalSheet.getRows();

    // Normalisasi komparasi
    const norm = (v) => (v ?? "").toString().toUpperCase().replace(/\s+/g, "");
    const getAny = (row, keys) => {
      for (const k of keys) {
        const val = row.get(k);
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
      return "";
    };

    // Ambil SEMUA baris utk no_ulok tsb (sering ada banyak)
    const matches = rows.filter(
      (r) => norm(r.get("no_ulok")) === norm(no_ulok)
    );

    if (matches.length) {
      // Cari yang terisi lebih dulu; kalau ada beberapa, ambil yg tanggal_submit terbaru
      const withValues = matches
        .map((r) => ({
          pic: getAny(r, ["pic_username", "PIC_USERNAME", "pic", "PIC"]),
          kontr: getAny(r, [
            "kontraktor_username",
            "KONTRAKTOR_USERNAME",
            "kontraktor",
            "KONTRAKTOR",
          ]),
          tgl: r.get("tanggal_submit") || "",
        }))
        .sort((a, b) => String(b.tgl).localeCompare(String(a.tgl)));

      const best = withValues.find((x) => x.pic || x.kontr) || withValues[0];
      return res.status(200).json({
        pic_username: best.pic || "N/A",
        kontraktor_username: best.kontr || "N/A",
      });
    }

    return res
      .status(200)
      .json({ pic_username: "N/A", kontraktor_username: "N/A" });
  } catch (e) {
    console.error("Error di /api/pic-kontraktor-opname:", e);
    return res
      .status(500)
      .json({ pic_username: "N/A", kontraktor_username: "N/A" });
  }
});

// --- Endpoint untuk PIC (by cabang dari tab users) ---
app.get("/api/toko", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ message: "Username PIC diperlukan." });
    }

    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    const usersSheet = doc.sheetsByTitle["users"];
    if (!rabSheet || !usersSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'data_rab' atau 'users' tidak ditemukan." });
    }

    const [rabRows, userRows] = await Promise.all([
      rabSheet.getRows(),
      usersSheet.getRows(),
    ]);

    const norm = (v) => (v ?? "").toString().trim().toUpperCase();

    // Ambil baris PIC dari tab users
    const picRow = userRows.find(
      (r) =>
        norm(r.get("username")) === norm(username) &&
        (r.get("role") || "").toLowerCase() === "pic"
    );

    // Helper ambil nilai dari beberapa kemungkinan header
    const getFirst = (row, keys) => {
      for (const k of keys) {
        const val = row.get(k);
        if (val !== undefined && val !== null && String(val).trim() !== "")
          return String(val);
      }
      return "";
    };

    let assignedRows = [];

    if (picRow) {
      // ⬅️ Tambahkan 'store' & 'company' (opsional: 'password')
      const rawCabang = getFirst(picRow, [
        "kode_toko",
        "store",
        "STORE",
        "company",
        "COMPANY",
        "cabang",
        "CABANG",
        "nama_cabang",
        "NAMA_CABANG",
        "homebase",
        "HOMEBASE",
        "wilayah",
        "WILAYAH",
        // kalau kamu memang menaruh cabang di password PIC, buka komentar ini:
        // "password", "PASSWORD",
      ]);

      if (rawCabang) {
        // dukung multi-cabang: pisah dengan koma/semicolon/pipe
        const cabangList = rawCabang
          .split(/[,;|]/)
          .map((s) => norm(s))
          .filter(Boolean);

        const matchByCabang = (row) => {
          const kandidat = [
            norm(row.get("kode_toko")),
            norm(row.get("nama_toko")),
            norm(row.get("cabang")), // jika suatu saat kamu menambah kolom 'cabang' di data_rab
          ];
          return cabangList.some((cbg) => kandidat.includes(cbg));
        };

        assignedRows = rabRows.filter(matchByCabang);
      }

      // Fallback lama: jika belum ketemu, pakai pic_username di data_rab
      if (assignedRows.length === 0) {
        assignedRows = rabRows.filter(
          (row) => norm(row.get("pic_username")) === norm(username)
        );
      }
    }

    const storesMap = new Map();
    assignedRows.forEach((row) => {
      const kode_toko = row.get("kode_toko");
      if (!storesMap.has(kode_toko)) {
        storesMap.set(kode_toko, {
          kode_toko,
          nama_toko: row.get("nama_toko"),
          no_uloks: new Set(),
          link_pdf: row.get("link_pdf") || "",
        });
      }
      const s = storesMap.get(kode_toko);
      if (row.get("no_ulok")) s.no_uloks.add(row.get("no_ulok"));
    });

    const stores = Array.from(storesMap.values()).map((s) => ({
      kode_toko: s.kode_toko,
      nama_toko: s.nama_toko,
      link_pdf: s.link_pdf,
      no_uloks: Array.from(s.no_uloks),
    }));

    return res.status(200).json(stores);
  } catch (error) {
    console.error("Error di /api/toko:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- ENDPOINT BARU: Mengambil daftar unik no_ulok untuk kode_toko tertentu ---
app.get("/api/uloks", async (req, res) => {
  try {
    const { kode_toko } = req.query;
    if (!kode_toko)
      return res.status(400).json({ message: "Kode toko diperlukan." });
    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    if (!rabSheet)
      return res
        .status(500)
        .json({ message: "Sheet 'data_rab' tidak ditemukan." });
    const rows = await rabSheet.getRows();
    const uloksSet = new Set();
    rows.forEach((row) => {
      if (row.get("kode_toko") === kode_toko && row.get("no_ulok")) {
        uloksSet.add(row.get("no_ulok"));
      }
    });
    res.status(200).json(Array.from(uloksSet));
  } catch (error) {
    console.error("Error di /api/uloks:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- Endpoint OPNAME (PIC) dengan dukungan filter lingkup_pekerjaan ---
app.get("/api/opname", async (req, res) => {
  try {
    const { kode_toko, no_ulok, lingkup } = req.query;
    if (!kode_toko || !no_ulok) {
      return res
        .status(400)
        .json({ message: "Kode toko dan No. ULOK diperlukan." });
    }

    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!rabSheet || !finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet data_rab atau opname_final tidak ditemukan." });
    }

    const [rabRows, finalRows] = await Promise.all([
      rabSheet.getRows(),
      finalSheet.getRows(),
    ]);

    const norm = (v) => (v ?? "").toString().trim().toUpperCase();
    const qLing = norm(lingkup || "");
    const toNum = (v) => {
      if (v === null || v === undefined) return 0;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    // KUMPULKAN SEMUA SUBMISSION (LIST, BUKAN MAP) → supaya bisa match satu-per-satu
    const submittedList = finalRows
      .filter(
        (row) =>
          norm(row.get("kode_toko")) === norm(kode_toko) &&
          norm(row.get("no_ulok")) === norm(no_ulok) &&
          (!qLing || norm(row.get("lingkup_pekerjaan")) === qLing)
      )
      .map((row) => ({
        item_id: row.get("item_id"),
        jenis: row.get("jenis_pekerjaan") || "",
        lingkup: (row.get("lingkup_pekerjaan") || "").toString(),
        vol_akhir: row.get("volume_akhir"),
        selisih: row.get("selisih"),
        approval_status: row.get("approval_status"),
        tanggal_submit: row.get("tanggal_submit"),
        foto_url: row.get("foto_url"),
        // field pembeda tambahan untuk matching unik
        satuan: row.get("satuan"),
        harga_material: row.get("harga_material"),
        harga_upah: row.get("harga_upah"),
        rab_key: row.get("rab_key") || "",
        
      }));

 const takeMatch = (subs, rabJenis, rabLingkup, rabSatuan, rabHargaMat, rabHargaUpah, rabKey) => {
   // 1) Prioritas: rab_key sama persis
   if (rabKey) {
     const byKey = subs.findIndex((s) => (s.rab_key || "") === rabKey);
     if (byKey >= 0) return subs.splice(byKey, 1)[0];
   }
   // 2) Fallback: cocokkan berdasarkan teks/satuan/harga persis (lama)
   const idx = subs.findIndex(
     (s) =>
       s.jenis === rabJenis &&
       (s.lingkup || "") === (rabLingkup || "") &&
       String(s.satuan || "") === String(rabSatuan || "") &&
       toNum(s.harga_material) === toNum(rabHargaMat) &&
       toNum(s.harga_upah) === toNum(rabHargaUpah)
   );
   if (idx >= 0) return subs.splice(idx, 1)[0];
   return null;
 };

    // BENTUK LIST TASK DARI RAB (TIDAK DIDE-DUP)
    const tasks = rabRows
      .filter(
        (row) =>
          norm(row.get("kode_toko")) === norm(kode_toko) &&
          norm(row.get("no_ulok")) === norm(no_ulok) &&
          (!qLing || norm(row.get("lingkup_pekerjaan")) === qLing)
      )
      .map((row) => {
        const jenis_pekerjaan = row.get("jenis_pekerjaan");
        const lingkup_pekerjaan = row.get("lingkup_pekerjaan") || "";
        const satuan = row.get("satuan");
        const harga_material = row.get("harga_material") || 0;
        const harga_upah = row.get("harga_upah") || 0;
        const rab_key_raw = row.get("rab_key") || "";
        const rab_key = rab_key_raw || makeRabKey(row);

const matched = takeMatch(
  submittedList,
  jenis_pekerjaan,
  lingkup_pekerjaan,
  satuan,
  harga_material,
  harga_upah,
  rab_key
);

        return {
          kategori_pekerjaan: row.get("kategori_pekerjaan"),
          lingkup_pekerjaan,
          jenis_pekerjaan,
          vol_rab: row.get("vol_rab"),
          satuan,
          harga_material,
          harga_upah,
          rab_key,
          item_id: matched?.item_id || null,
          volume_akhir: matched?.vol_akhir || "",
          selisih: matched?.selisih || "",
          isSubmitted: !!matched,
          approval_status: matched?.approval_status || "Not Submitted",
          submissionTime: matched?.tanggal_submit || null,
          foto_url: matched?.foto_url || null,
        };
      });

    return res.status(200).json(tasks);
  } catch (error) {
    console.error("Error di /api/opname:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- ENDPOINT BARU: Ambil daftar LINGKUP (ME/SIPIL) untuk kode_toko + no_ulok ---
app.get("/api/lingkups", async (req, res) => {
  try {
    const { kode_toko, no_ulok } = req.query;
    if (!kode_toko || !no_ulok) {
      return res
        .status(400)
        .json({ message: "Kode toko dan No. ULOK diperlukan." });
    }

    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    if (!rabSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'data_rab' tidak ditemukan." });
    }

    const rows = await rabSheet.getRows();
    const setLingkup = new Set();

    rows.forEach((row) => {
      const sameToko =
        (row.get("kode_toko") || "").toString().trim() === kode_toko;
      const sameUlok = (row.get("no_ulok") || "").toString().trim() === no_ulok;
      if (sameToko && sameUlok) {
        const lk = (row.get("lingkup_pekerjaan") || "").toString().trim();
        if (lk) setLingkup.add(lk.toUpperCase());
      }
    });

    // Jika di sheet hanya ada satu lingkup, frontend bisa menampilkan langsung / auto-select
    return res.status(200).json({ lingkups: Array.from(setLingkup) });
  } catch (error) {
    console.error("Error di /api/lingkups:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- ENDPOINT SUBMIT OPNAME YANG SUDAH DIPERBAIKI ---
// --- ENDPOINT SUBMIT OPNAME (FULL, TANPA MENGURANGI FIELD LAMA) ---
app.post("/api/opname/item/submit", async (req, res) => {
  try {
    const itemData = req.body;

 // Pastikan rab_key ada (kalau belum dikirim FE karena RAB kosong, generate di sini)
 if (!itemData.rab_key || String(itemData.rab_key).trim() === "") {
   itemData.rab_key = makeRabKey(itemData);
}

    // Validasi minimum (tetap sama + pic_username wajib)
    if (
      !itemData ||
      !itemData.kode_toko ||
      !itemData.no_ulok ||
      !itemData.jenis_pekerjaan ||
      !itemData.pic_username
    ) {
      return res.status(400).json({ message: "Data item tidak lengkap." });
    }

    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    // Pastikan semua header tersedia (TIDAK menghapus yang lama; hanya menambahkan jika belum ada)
    await finalSheet.loadHeaderRow();
    const headers = new Set(finalSheet.headerValues || []);
    [
      "submission_id",
      "kode_toko",
      "nama_toko",
      "no_ulok",
      "pic_username",
      "tanggal_submit",
      "kategori_pekerjaan",
      "jenis_pekerjaan",
      "vol_rab",
      "satuan",
      "volume_akhir",
      "selisih",
      "harga_material",
      "harga_upah",
      "total_harga_akhir",
      "approval_status",
      "item_id",
      "foto_url", // tambahan: simpan link foto
      "lingkup_pekerjaan", // tambahan: simpan ME/SIPIL bila ada
      "rab_key",
    ].forEach((h) => headers.add(h));
    await finalSheet.setHeaderRow([...headers]);

    const rows = await finalSheet.getRows();

    // Helper konversi angka aman (hilangkan Rp/pemisah ribuan)
    const toNum = (v) => {
      if (v === null || v === undefined) return 0;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    // Cek duplikasi: hanya dianggap duplikat jika SEMUA field identik.
    // Ini agar "jenis pekerjaan sama" tetap bisa disimpan berulang jika volume/harga/lingkup/satuan berbeda.
 let existingRow = null;
 if (itemData.rab_key) {
   existingRow = rows.find(
     (row) =>
       (row.get("rab_key") || "") === (itemData.rab_key || "") &&
       row.get("kode_toko") === (itemData.kode_toko || "") &&
       row.get("no_ulok") === (itemData.no_ulok || "") &&
       row.get("pic_username") === (itemData.pic_username || "") &&
       toNum(row.get("volume_akhir")) === toNum(itemData.volume_akhir)
   );
 }
 if (!existingRow) {
   existingRow = rows.find(
     (row) =>
       row.get("kode_toko") === (itemData.kode_toko || "") &&
       row.get("no_ulok") === (itemData.no_ulok || "") &&
       row.get("jenis_pekerjaan") === (itemData.jenis_pekerjaan || "") &&
       row.get("pic_username") === (itemData.pic_username || "") &&
       (row.get("lingkup_pekerjaan") || "") === (itemData.lingkup_pekerjaan || "") &&
       String(row.get("satuan") || "") === String(itemData.satuan || "") &&
       toNum(row.get("vol_rab")) === toNum(itemData.vol_rab) &&
       toNum(row.get("harga_material")) === toNum(itemData.harga_material) &&
       toNum(row.get("harga_upah")) === toNum(itemData.harga_upah) &&
       toNum(row.get("volume_akhir")) === toNum(itemData.volume_akhir)
   );
 }

    // ID & timestamp
    const timestamp = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });
    const item_id =
      `${itemData.kode_toko}-${itemData.no_ulok}-` +
      `${(itemData.jenis_pekerjaan || "")
        .toString()
        .replace(/[^a-zA-Z0-9]/g, "-")}-` +
      `${Date.now()}`;
    const submission_id = `SUB-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

    // Susun row baru (semua kolom lama dipertahankan, kolom baru ditambahkan)
    const rowToAdd = {
      submission_id,
      kode_toko: itemData.kode_toko || "",
      nama_toko: itemData.nama_toko || "",
      no_ulok: itemData.no_ulok || "",
      pic_username: itemData.pic_username || "",
      tanggal_submit: timestamp,
      kategori_pekerjaan: itemData.kategori_pekerjaan || "",
      jenis_pekerjaan: itemData.jenis_pekerjaan || "",
      vol_rab: itemData.vol_rab ?? "",
      satuan: itemData.satuan ?? "",
      volume_akhir: itemData.volume_akhir ?? "",
      selisih: itemData.selisih ?? "",
      harga_material: itemData.harga_material ?? 0,
      harga_upah: itemData.harga_upah ?? 0,
      total_harga_akhir: itemData.total_harga_akhir ?? 0,
      approval_status: itemData.approval_status || "Pending", // default aman
      item_id,

      // tambahan
      foto_url: itemData.foto_url || "",
      lingkup_pekerjaan: itemData.lingkup_pekerjaan || "",
      rab_key: itemData.rab_key || "",
    };

    const newRow = await finalSheet.addRow(rowToAdd);

    return res.status(201).json({
      success: true,
      message: `Pekerjaan "${itemData.jenis_pekerjaan}" berhasil disimpan.`,
      item_id,
      submission_id,
      tanggal_submit: timestamp,
      row_number: newRow.rowNumber,
    });
  } catch (error) {
    console.error("Error di /api/opname/item/submit:", error);
    return res.status(500).json({
      message: "Terjadi kesalahan pada server saat menyimpan item.",
      error: error.message,
    });
  }
});

// --- Endpoint untuk Kontraktor ---
app.get("/api/toko_kontraktor", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username)
      return res
        .status(400)
        .json({ message: "Username Kontraktor diperlukan." });

    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    const kontrSheet = doc.sheetsByTitle["data_kontraktor"];
    if (!rabSheet)
      return res
        .status(500)
        .json({ message: "Sheet 'data_rab' tidak ditemukan." });

    const rabRows = await rabSheet.getRows();

    // 1) Coba cara lama dulu: langsung dari kolom kontraktor_username di data_rab
    let assignedRows = rabRows.filter(
      (row) =>
        (row.get("kontraktor_username") || "").trim().toLowerCase() ===
        username.trim().toLowerCase()
    );

    // 2) Bila kosong, gunakan peta cabang dari tab data_kontraktor (status AKTIF)
    if (assignedRows.length === 0 && kontrSheet) {
      const kRows = await kontrSheet.getRows();
      const cabangs = new Set(
        kRows
          .filter(
            (r) =>
              (r.get("nama_kontraktor") || "").trim().toLowerCase() ===
                username.trim().toLowerCase() &&
              (r.get("status_kontraktor") || "").toUpperCase() === "AKTIF"
          )
          .map((r) => (r.get("nama_cabang") || "").trim())
      );

      if (cabangs.size > 0) {
        assignedRows = rabRows.filter((row) => {
          const kode = (row.get("kode_toko") || "").trim();
          const nama = (row.get("nama_toko") || "").trim();
          // Cocokkan salah satu ke nama_cabang (fleksibel, karena struktur tiap sheet bisa berbeda)
          return cabangs.has(kode) || cabangs.has(nama);
        });
      }
    }

    const storesMap = new Map();
    assignedRows.forEach((row) => {
      const kode_toko = row.get("kode_toko");
      if (!storesMap.has(kode_toko)) {
        storesMap.set(kode_toko, {
          kode_toko,
          nama_toko: row.get("nama_toko"),
          no_uloks: new Set(),
          link_pdf: row.get("link_pdf") || "",
        });
      }
      const s = storesMap.get(kode_toko);
      if (row.get("no_ulok")) s.no_uloks.add(row.get("no_ulok"));
    });

    const stores = Array.from(storesMap.values()).map((s) => ({
      kode_toko: s.kode_toko,
      nama_toko: s.nama_toko,
      link_pdf: s.link_pdf,
      no_uloks: Array.from(s.no_uloks),
    }));

    res.status(200).json(stores);
  } catch (error) {
    console.error("Error di /api/toko_kontraktor:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- Endpoint untuk Melihat Data Final (Approved) ---
// --- Endpoint untuk Melihat Data Final (Approved) dengan filter no_ulok & lingkup ---
app.get("/api/opname/final", async (req, res) => {
  try {
    const { kode_toko, no_ulok, lingkup } = req.query;
    if (!kode_toko)
      return res.status(400).json({ message: "Kode toko diperlukan." });

    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet)
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });

    const rows = await finalSheet.getRows();
    const norm = (v) => (v ?? "").toString().trim().toUpperCase();
    const qLingkup = norm(lingkup || "");

    let filteredRows = rows.filter(
      (row) =>
        norm(row.get("kode_toko")) === norm(kode_toko) &&
        norm(row.get("approval_status")) === "APPROVED"
    );

    if (no_ulok) {
      filteredRows = filteredRows.filter(
        (row) => norm(row.get("no_ulok")) === norm(no_ulok)
      );
    }
    if (qLingkup) {
      filteredRows = filteredRows.filter(
        (row) => norm(row.get("lingkup_pekerjaan")) === qLingkup
      );
    }

    const submissions = filteredRows.map((row) => ({
      kategori_pekerjaan: row.get("kategori_pekerjaan"),
      lingkup_pekerjaan: row.get("lingkup_pekerjaan") || "",
      jenis_pekerjaan: row.get("jenis_pekerjaan"),
      vol_rab: row.get("vol_rab"),
      satuan: row.get("satuan"),
      harga_material: row.get("harga_material"),
      harga_upah: row.get("harga_upah"),
      volume_akhir: row.get("volume_akhir"),
      selisih: row.get("selisih"),
      total_harga_akhir: row.get("total_harga_akhir"),
      approval_status: row.get("approval_status"),
      foto_url: row.get("foto_url"),
      tanggal_submit: row.get("tanggal_submit"),
      no_ulok: row.get("no_ulok"),
    }));

    return res.status(200).json(submissions);
  } catch (error) {
    console.error("Error di /api/opname/final:", error);
    return res
      .status(500)
      .json({
        message: "Terjadi kesalahan pada server saat membaca data final.",
      });
  }
});

// --- Endpoint baru untuk mengambil data RAB dari data_rab ---
app.get("/api/rab", async (req, res) => {
  try {
    const { kode_toko, no_ulok } = req.query;
    if (!kode_toko)
      return res.status(400).json({ message: "Kode toko diperlukan." });

    await doc.loadInfo();
    const rabSheet = doc.sheetsByTitle["data_rab"];
    if (!rabSheet)
      return res
        .status(500)
        .json({ message: "Sheet 'data_rab' tidak ditemukan." });

    const rows = await rabSheet.getRows();

    let rabItems = rows.filter((row) => row.get("kode_toko") === kode_toko);

    // Filter berdasarkan no_ulok jika disediakan
    if (no_ulok) {
      rabItems = rabItems.filter((row) => row.get("no_ulok") === no_ulok);
    }

    const result = rabItems.map((row) => ({
      kategori_pekerjaan: row.get("kategori_pekerjaan"),
      jenis_pekerjaan: row.get("jenis_pekerjaan"),
      satuan: row.get("satuan"),
      volume: row.get("vol_rab"),
      harga_material: row.get("harga_material"),
      harga_upah: row.get("harga_upah"),
      total_harga: row.get("total_harga"),
      pic_username: row.get("pic_username") || "",
      kontraktor_username:
        row.get("kontraktor") || row.get("kontraktor_username") || "",
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("Error di /api/rab:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- Endpoint Jembatan/Proxy Gambar ---
app.get("/api/image-proxy", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).send("URL gambar diperlukan.");
    }
    const response = await axios.get(url, { responseType: "arraybuffer" });
    res.setHeader("Content-Type", response.headers["content-type"]);
    res.send(response.data);
  } catch (error) {
    console.error("Gagal mem-proxy gambar:", error);
    res.status(500).send("Gagal memuat gambar.");
  }
});

// --- ENDPOINT DEBUG untuk troubleshooting ---
app.get("/api/debug/opname-final", async (req, res) => {
  try {
    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    const rows = await finalSheet.getRows();
    const allData = rows.map((row, index) => ({
      rowNumber: row.rowNumber,
      index: index,
      submission_id: row.get("submission_id") || "N/A",
      kode_toko: row.get("kode_toko") || "N/A",
      nama_toko: row.get("nama_toko") || "N/A",
      no_ulok: row.get("no_ulok") || "N/A",
      pic_username: row.get("pic_username") || "N/A",
      jenis_pekerjaan: row.get("jenis_pekerjaan") || "N/A",
      tanggal_submit: row.get("tanggal_submit") || "N/A",
      approval_status: row.get("approval_status") || "N/A",
    }));

    res.status(200).json({
      message: "Debug data dari opname_final",
      totalRows: rows.length,
      sheetTitle: finalSheet.title,
      data: allData,
    });
  } catch (error) {
    console.error("Error di /api/debug/opname-final:", error);
    res.status(500).json({
      message: "Error mengambil data debug",
      error: error.message,
    });
  }
});

// --- ENDPOINT DEBUG untuk melihat headers sheet ---
app.get("/api/debug/sheet-headers", async (req, res) => {
  try {
    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    await finalSheet.loadHeaderRow();

    res.status(200).json({
      message: "Headers dari sheet opname_final",
      headers: finalSheet.headerValues,
      sheetTitle: finalSheet.title,
    });
  } catch (error) {
    console.error("Error di /api/debug/sheet-headers:", error);
    res.status(500).json({
      message: "Error mengambil headers sheet",
      error: error.message,
    });
  }
});

// 6. Menjalankan server
app.listen(port, () => {
  console.log(`Server backend berjalan di http://localhost:${port}`);
  console.log("Endpoints yang tersedia:");
  console.log("- Debug: http://localhost:3001/api/debug/opname-final");
  console.log("- Debug Headers: http://localhost:3001/api/debug/sheet-headers");
});

// --- Ambil item Pending untuk persetujuan ---
app.get("/api/opname/pending", async (req, res) => {
  try {
    const { kode_toko, no_ulok } = req.query;
    if (!kode_toko || !no_ulok) {
      return res
        .status(400)
        .json({ message: "Kode toko dan No. ULOK diperlukan." });
    }

    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    const rows = await finalSheet.getRows();
    const norm = (v) => (v ?? "").toString().trim().toUpperCase();

    const pending = rows.filter((row) => {
      const sameToko = norm(row.get("kode_toko")) === norm(kode_toko);
      const sameUlok = norm(row.get("no_ulok")) === norm(no_ulok);
      const status = norm(row.get("approval_status"));
      // anggap kosong sebagai Pending juga
      return sameToko && sameUlok && (status === "" || status === "PENDING");
    });

    const result = pending.map((row) => ({
      item_id: row.get("item_id") || null,
      jenis_pekerjaan: row.get("jenis_pekerjaan") || "",
      volume_akhir: row.get("volume_akhir") || "",
      pic_username: row.get("pic_username") || "",
      tanggal_submit: row.get("tanggal_submit") || "",
      // informasi tambahan kalau kamu ingin tampilkan
      vol_rab: row.get("vol_rab") || "",
      satuan: row.get("satuan") || "",
      foto_url: row.get("foto_url") || "",
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error di /api/opname/pending:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

// --- Approve item opname ---
app.patch("/api/opname/approve", async (req, res) => {
  try {
    const { item_id, kontraktor_username } = req.body || {};
    if (!item_id) {
      return res.status(400).json({ message: "item_id diperlukan." });
    }

    await doc.loadInfo();
    const finalSheet = doc.sheetsByTitle["opname_final"];
    if (!finalSheet) {
      return res
        .status(500)
        .json({ message: "Sheet 'opname_final' tidak ditemukan." });
    }

    const rows = await finalSheet.getRows();
    const target = rows.find((r) => (r.get("item_id") || "") === item_id);

    if (!target) {
      return res.status(404).json({ message: "Item tidak ditemukan." });
    }

    target.set("approval_status", "APPROVED"); // konsisten
    if (kontraktor_username && String(kontraktor_username).trim()) {
      target.set("kontraktor", kontraktor_username);
    }
    await target.save();

    return res.status(200).json({ message: "Berhasil di-approve." });
  } catch (error) {
    console.error("Error di /api/opname/approve:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});
