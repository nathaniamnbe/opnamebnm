// src/utils/pdfGenerator.js

const { default: jsPDF } = await import("jspdf");
const { default: autoTable } = await import("jspdf-autotable");

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.REACT_APP_API_URL || "";

// --- PENGATURAN TEKS ---
const companyName = "PT. SUMBER ALFARIA TRIJAYA, Tbk";
const reportTitle = "BERITA ACARA OPNAME PEKERJAAN"; // ⬅️ TAMBAHKAN INI
// const branch = "CABANG: HEAD OFFICE";
// Logo default (fallback ke Wikipedia), tapi utamakan logo lokal di /public
const logoUrl =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Alfamart_logo.svg/1280px-Alfamart_logo.svg.png";
const LOCAL_LOGO_PATH = "/alfa.ico"; // ganti ke "/alfamart.png" kalau pakai PNG di /public

// Fungsi bantu untuk format mata uang Rupiah
const formatRupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

// Tambahkan dekat fungsi formatRupiah
const toNumberID = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // buang semua kecuali digit, koma, titik, minus
  const cleaned = s.replace(/[^\d,.-]/g, "");
  // hilangkan pemisah ribuan ".", ganti desimal "," jadi "."
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

// Terima 7,70 atau 7.70 -> 7.70, dan juga handle 1.000,5 -> 1000.5
const toNumberVol = (v) => {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;

  // Jika ada KEDUA separator, anggap ',' desimal (format Indonesia)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // Hanya koma -> desimal
    s = s.replace(",", ".");
  } // Hanya titik -> sudah desimal, biarkan

 const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Fungsi bantu untuk mengambil gambar dan mengubahnya ke Base64
const toBase64 = async (url) => {
  try {
    if (!url) return null;
    const proxyUrl = `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(
      url
    )}`;
    const response = await fetch(proxyUrl);
    if (!response.ok)
      throw new Error(
        `Network response was not ok, status: ${response.status}`
      );
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error(`Gagal mengubah gambar ke Base64 dari URL: ${url}`, error);
    return null;
  }
};

// Fungsi untuk memotong teks jika terlalu panjang
const wrapText = (doc, text, maxWidth) => {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (let word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    const textWidth = doc.getTextWidth(testLine);

    if (textWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

// Fungsi untuk mengambil data RAB dari API
const fetchRabData = async (kode_toko, no_ulok, lingkup) => {
  try {
    const url = new URL(`${API_BASE_URL}/api/rab`);
    url.searchParams.set("kode_toko", kode_toko);
    if (no_ulok) url.searchParams.set("no_ulok", no_ulok);
    if (lingkup) url.searchParams.set("lingkup", lingkup); // 🔑 tambah filter
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error("Gagal mengambil data RAB");
    return await response.json();
  } catch (error) {
    console.error(error);
    return [];
  }
};

// FUNGSI BARU: Mengambil data PIC dan Kontraktor dari Google Sheets
async function fetchPicKontraktorData(noUlok) {
  const url = `${API_BASE_URL}/api/pic-kontraktor?no_ulok=${encodeURIComponent(
    noUlok
  )}`;
  const res = await fetch(url);
  if (!res.ok) return { pic_username: "N/A", kontraktor_username: "N/A" };
  const json = await res.json();
  return {
    pic_username: json.pic_username ?? "N/A",
    kontraktor_username: json.kontraktor_username ?? "N/A",
  };
}

// FUNGSI TAMBAHAN BARU: Mengambil data PIC dan Kontraktor dari opname_final di Google Sheets (fallback tambahan)
async function fetchPicKontraktorOpnameData(noUlok) {
  const url = `${API_BASE_URL}/api/pic-kontraktor-opname?no_ulok=${encodeURIComponent(
    noUlok
  )}`;
  const res = await fetch(url);
  if (!res.ok)
    return { pic_username: "N/A", kontraktor_username: "N/A", name: "" };
  const json = await res.json();
  return {
    pic_username: json.pic_username ?? "N/A",
    kontraktor_username: json.kontraktor_username ?? "N/A",
    name: json.name ?? "", // ← penting
  };
}

// --- FUNGSI BARU: ambil daftar PIC unik utk no_ulok + lingkup (+opsi kode_toko)
async function fetchPicList({ noUlok, lingkup, kodeToko }) {
  const url = new URL(`${API_BASE_URL}/api/pic-list`);
  url.searchParams.set("no_ulok", noUlok);
  if (lingkup) url.searchParams.set("lingkup", lingkup);
  if (kodeToko) url.searchParams.set("kode_toko", kodeToko);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json.pic_list) ? json.pic_list : [];
}

// Fungsi untuk mengelompokkan data berdasarkan kategori
const groupDataByCategory = (data) => {
  const categories = {};

  data.forEach((item) => {
    const categoryName = item.kategori_pekerjaan.toUpperCase();
    if (!categories[categoryName]) {
      categories[categoryName] = [];
    }
    categories[categoryName].push(item);
  });

  return categories;
};

export const generateFinalOpnamePDF = async (
  submissions,
  selectedStore,
  selectedUlok
) => {
  console.log("Memulai pembuatan PDF dengan format kategori...");
  const doc = new jsPDF();
  const currentDate = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // --- FOOTER ---
  const addFooter = (pageNum) => {
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Halaman ${pageNum} - Dicetak pada: ${new Date().toLocaleString(
        "id-ID"
      )}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.setTextColor(0, 0, 0);
  };

  // --- Ambil Data RAB dari server (terfilter lingkup) ---
  const selectedLingkup = (
    (submissions && submissions[0]?.lingkup_pekerjaan) ||
    ""
  ).toUpperCase();
  const rabData = await fetchRabData(
    selectedStore.kode_toko,
    selectedUlok,
    selectedLingkup // 🔑 kirim ME/SIPIL
  );
  // --- Ambil Data PIC dan Kontraktor berdasarkan no_ulok ---
  const picKontraktorData = await fetchPicKontraktorData(selectedUlok);

  // --- Selalu ambil 'name' dari opname_final (jika ada) ---
  const fromOpname = await fetchPicKontraktorOpnameData(selectedUlok);
  if (fromOpname?.name && String(fromOpname.name).trim()) {
    picKontraktorData.name = String(fromOpname.name).trim(); // ← isi nama PIC
  }

  // Fallback email PIC kalau kosong
  if (
    !picKontraktorData?.pic_username ||
    picKontraktorData.pic_username === "N/A"
  ) {
    if (fromOpname?.pic_username && String(fromOpname.pic_username).trim()) {
      picKontraktorData.pic_username = String(fromOpname.pic_username).trim();
    }
  }

  // Fallback kontraktor
  if (
    !picKontraktorData?.kontraktor_username ||
    picKontraktorData.kontraktor_username === "N/A"
  ) {
    if (
      fromOpname?.kontraktor_username &&
      String(fromOpname.kontraktor_username).trim()
    ) {
      picKontraktorData.kontraktor_username = String(
        fromOpname.kontraktor_username
      ).trim();
    }
  }

  // 🔹 AMBIL SEMUA PIC untuk ULOK + LINGKUP (opsional filter kode_toko)
  const picList = await fetchPicList({
    noUlok: selectedUlok,
    lingkup: selectedLingkup,
    kodeToko: selectedStore.kode_toko,
  });

  // --- PENGATURAN HALAMAN ---
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // --- HEADER (gaya elegan: logo di atas, identitas kiri, judul di tengah) ---
  let startY = 12;

  // 1) Render logo (pakai logo lokal, fallback ke logoUrl)
  let logoData = null;
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (origin) {
      logoData = await toBase64(origin + LOCAL_LOGO_PATH);
    }
  } catch (e) {
    /* silent */
  }
  if (!logoData) {
    logoData = await toBase64(logoUrl);
  }

  // ukuran logo
  const logoW = 48; // lebar ±48mm
  const logoH = 20; // tinggi proporsional
  if (logoData) {
    doc.addImage(
      logoData,
      "PNG",
      (pageWidth - logoW) / 2,
      startY,
      logoW,
      logoH
    );
  }
  startY += logoH + 6;

  // garis tipis pemisah

  startY += 6;

  // 2) Identitas perusahaan (kiri)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.text(companyName, margin, startY); // "PT. SUMBER ALFARIA TRIJAYA, Tbk"
  startY += 5;

  doc.setFont(undefined, "normal");
  doc.text("BUILDING & MAINTENANCE DEPT", margin, startY);
  startY += 5;

  // Opsional: tampilkan cabang kalau ada informasinya
  const cabangTxt =
    (selectedStore &&
      (selectedStore.cabang ||
        selectedStore.nama_cabang ||
        selectedStore.kota)) ||
    "";
  if (cabangTxt) {
    doc.text(`CABANG: ${cabangTxt}`, margin, startY);
    startY += 6;
  }

  // Spasi sebelum judul
  startY += 6;

  // 3) Judul dokumen (tengah)
  doc.setFont(undefined, "bold");
  doc.setFontSize(14);
  doc.text(reportTitle, pageWidth / 2, startY, { align: "center" });
  startY += 12;

  // reset ke normal supaya baris keterangan tidak bold
  doc.setFont(undefined, "normal");

  // garis tipis di bawah judul (biar rapi)

  startY += 8;

  // --- INFO PROYEK ---
  // --- INFO PROYEK ---
  doc.setFontSize(10);

  // LOGIKA PENGAMBILAN DATA:
  // Prioritas 1: Ambil dari data Opname Final (submissions[0])
  // Prioritas 2: Ambil dari data Store yang dipilih (selectedStore) - Fallback
  const dataOpname =
    submissions && submissions.length > 0 ? submissions[0] : {};

  // Ambil Nama Toko & Alamat dari sheet Opname Final
  const finalNamaToko = dataOpname.nama_toko || selectedStore.nama_toko || "-";
  const finalAlamat = dataOpname.alamat || selectedStore.alamat || "-";

  // 1. Nomor ULOK
  doc.text(`NOMOR ULOK : ${selectedUlok || "undefined"}`, margin, startY);
  startY += 7;

  // 2. Lingkup Pekerjaan
  doc.text(`LINGKUP PEKERJAAN : ${selectedLingkup || "N/A"}`, margin, startY);
  startY += 7;

  // 3. Nama Toko (Isi sesuai kolom nama_toko di Opname Final)
  doc.text(`NAMA TOKO : ${finalNamaToko}`, margin, startY);
  startY += 7;

  // 4. Alamat (Isi sesuai kolom alamat di Opname Final)
  doc.text(`ALAMAT : ${finalAlamat}`, margin, startY);
  startY += 7;

  // 5. Tanggal Opname
  doc.text(`TANGGAL OPNAME : ${currentDate}`, margin, startY);
  startY += 7;

  // 6. Nama PIC
  const picLine =
    picList && picList.length > 0
      ? picList.join(", ")
      : picKontraktorData.name || picKontraktorData.pic_username || "N/A";

  doc.text(`NAMA PIC : ${picLine}`, margin, startY);
  startY += 7;

  // 7. Nama Kontraktor
  doc.text(
    `NAMA KONTRAKTOR : ${picKontraktorData.kontraktor_username || "N/A"}`,
    margin,
    startY
  );
  startY += 15;

  // --- BAGIAN RAB FINAL ---
  // gaya lebih elegan: teks tebal dengan garis tipis di bawah (tanpa blok merah)
  doc.setFontSize(12).setFont(undefined, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("RAB FINAL", margin, startY);

  // garis halus di bawah teks (warna abu terang)
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.line(margin, startY + 2, pageWidth - margin, startY + 2);

  startY += 10;

  // Kelompokkan data RAB berdasarkan kategori
  const rabCategories = groupDataByCategory(rabData);

  // Iterasi setiap kategori untuk membuat tabel RAB
  let lastY = startY;
  let categoryNumber = 1;
  let grandTotalRAB = 0;

  Object.keys(rabCategories).forEach((categoryName) => {
    if (lastY + 50 > pageHeight - 20) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      lastY = margin + 10;
    }

    doc.setFontSize(11).setFont(undefined, "bold");
    doc.text(`${categoryNumber}. ${categoryName}`, margin, lastY);
    lastY += 10;
    categoryNumber++;

    let catMaterialTotal = 0;
    let catUpahTotal = 0;

    const categoryTableBody = rabCategories[categoryName].map((item, idx) => {
      const volume = toNumberVol(item.volume);
      const hargaMaterial = toNumberID(item.harga_material);
      const hargaUpah = toNumberID(item.harga_upah);

      const totalMaterial = volume * hargaMaterial; // d = a*b
      const totalUpah = volume * hargaUpah; // e = a*c
      const totalHarga = totalMaterial + totalUpah;

      // subtotal per kategori
      catMaterialTotal += totalMaterial;
      catUpahTotal += totalUpah;

      // grand total RAB (semua kategori)
      grandTotalRAB += totalHarga;

      return [
        idx + 1,
        item.jenis_pekerjaan,
        item.satuan,
        volume.toFixed(2),
        formatRupiah(hargaMaterial),
        formatRupiah(hargaUpah),
        formatRupiah(totalMaterial), // kolom "Material (d=a*b)"
        formatRupiah(totalUpah), // kolom "Upah (e=a*c)"
        formatRupiah(totalHarga), // kolom "TOTAL HARGA (Rp)"
      ];
    });

    categoryTableBody.push([
      "",
      "",
      "",
      "",
      "",
      "SUB TOTAL",
      formatRupiah(catMaterialTotal), // kolom d
      formatRupiah(catUpahTotal), // kolom e
      formatRupiah(catMaterialTotal + catUpahTotal), // kolom total harga
    ]);

    autoTable(doc, {
      head: [
        [
          "NO.",
          "JENIS PEKERJAAN",
          "SATUAN",
          "VOLUME",
          {
            content: "HARGA SATUAN (Rp)",
            colSpan: 2,
            styles: { halign: "center" },
          },
          {
            content: "TOTAL HARGA (Rp)",
            colSpan: 3,
            styles: { halign: "center" },
          },
        ],
        [
          "",
          "",
          "",
          "",
          "Material (b)",
          "Upah (c)",
          "Material (d=a*b)",
          "Upah (e=a*c)",
          "TOTAL HARGA (Rp)",
        ],
      ],
      body: categoryTableBody,
      startY: lastY,
      margin: { left: margin, right: margin },
      theme: "grid",

      // ... styles, headStyles, bodyStyles, columnStyles (BIARKAN TETAP ADA) ...
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        lineHeight: 1.05,
        overflow: "linebreak",
        lineColor: [120, 120, 120],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [205, 234, 242],
        textColor: [0, 0, 0],
        halign: "center",
        valign: "middle",
        fontSize: 8,
        fontStyle: "bold",
        lineColor: [100, 100, 100],
        lineWidth: 0.4,
        cellPadding: 2,
        lineHeight: 1.0,
      },
      bodyStyles: {
        fontSize: 8,
        valign: "middle",
        lineColor: [120, 120, 120],
        lineWidth: 0.3,
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 40, minCellWidth: 40 },
        2: { halign: "center", cellWidth: 18 },
        3: { halign: "right", cellWidth: 18 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "right", cellWidth: 18 },
        6: { halign: "right", cellWidth: 19 },
        7: { halign: "right", cellWidth: 19 },
        8: { halign: "right", cellWidth: 22, fontStyle: "bold" },
      },

      // ✅ BAGIAN BARU: LOGIKA WARNA KUNING UNTUK RAB
      didParseCell: (data) => {
        // 1. Cek baris "IL" (Instruksi Lapangan)
        if (data.section === "body") {
          const originalData = rabCategories[categoryName];
          // Pastikan index valid dan bukan baris subtotal
          if (data.row.index < originalData.length) {
            const item = originalData[data.row.index];
            if (item.is_il) {
              data.cell.styles.fillColor = [255, 245, 157]; // Kuning
            }
          }
        }

        // 2. Cek baris Subtotal (Logika Lama)
        const isSubtotalRow = data.row.index === data.table.body.length - 1;
        if (isSubtotalRow) {
          data.cell.styles.fillColor = [242, 242, 242]; // Abu-abu
          data.cell.styles.fontStyle =
            data.column.index >= 5 ? "bold" : "normal";
        }
      },
      // ... didDrawPage (BIARKAN TETAP ADA) ...
      didDrawPage: function (data) {
        if (data.settings.startY + data.table.height > pageHeight - 20) {
          addFooter(doc.getNumberOfPages());
        }
      },
    });

    lastY = (doc.lastAutoTable?.finalY ?? lastY) + 10;
  });

  // GRAND TOTAL untuk RAB
  // --- SETELAH LOOP KATEGORI RAB SELESAI ---
  lastY = (doc.lastAutoTable?.finalY ?? lastY) + 5;

  // Cek halaman cukup atau tidak untuk tabel summary
  if (lastY + 40 > pageHeight - 20) {
    addFooter(doc.getNumberOfPages());
    doc.addPage();
    lastY = margin + 10;
  }

  // --- LOGIKA HITUNGAN BARU (DENGAN PEMBULATAN) ---
  // 1. Total Real
  const totalRealRAB = grandTotalRAB;

  // 2. Pembulatan (Ke bawah / Floor ke puluhan ribu terdekat)
  // Contoh: 21.364.000 -> 21.360.000
  // Rumus: floor(nilai / 10000) * 10000
  const totalPembulatanRAB = Math.floor(totalRealRAB / 10000) * 10000;

  // 3. PPN 11% (Dihitung dari nilai Pembulatan)
  const ppnRAB = totalPembulatanRAB * 0.11;

  // 4. Grand Total (Pembulatan + PPN)
  const totalSetelahPPNRAB = totalPembulatanRAB + ppnRAB;

  // --- TABEL RINGKASAN RAB ---
  autoTable(doc, {
    body: [
      ["TOTAL", formatRupiah(totalRealRAB)],
      ["PEMBULATAN", formatRupiah(totalPembulatanRAB)],
      ["PPN 11%", formatRupiah(ppnRAB)],
      ["GRAND TOTAL", formatRupiah(totalSetelahPPNRAB)],
    ],
    startY: lastY,
    // Posisikan di sebelah kanan halaman
    margin: { left: pageWidth - 95, right: margin },
    tableWidth: 85,
    theme: "grid",
    styles: {
      fontSize: 9,
      halign: "right", // Teks rata kanan
      cellPadding: 3,
      lineColor: [150, 150, 150],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, halign: "left" }, // Label rata kiri
      1: { cellWidth: 50, halign: "right" }, // Angka rata kanan
    },
    didParseCell: (data) => {
      // Baris GRAND TOTAL (index 3) diwarnai
      if (data.row.index === 3) {
        data.cell.styles.fillColor = [144, 238, 144]; 
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [0, 0, 0];
      }
    },
  });

  // Update posisi Y terakhir
  lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;

  // --- BAGIAN LAPORAN OPNAME FINAL ---
  if (submissions && submissions.length > 0) {
    // Selalu mulai di halaman baru untuk Opname
    addFooter(doc.getNumberOfPages());
    doc.addPage();
    lastY = margin + 10;

    doc.setFontSize(12).setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("LAPORAN OPNAME FINAL (APPROVED)", margin, lastY);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    doc.line(margin, lastY + 2, pageWidth - margin, lastY + 2);
    lastY += 10;

    // 🔹 Pisahkan lebih dulu jadi PEKERJAAN TAMBAH & KURANG (berdasarkan SELISIH)
    const groupsByType = {
      "PEKERJAAN TAMBAH": [],
      "PEKERJAAN KURANG": [],
    };

    (submissions || []).forEach((it) => {
      // selisih bisa berformat "1.000,50" → normalisasi ke number
      const sel = Number(String(it.selisih ?? 0).replace(/[^0-9.-]/g, ""));
      const groupType = sel < 0 ? "PEKERJAAN KURANG" : "PEKERJAAN TAMBAH";
      groupsByType[groupType].push(it);
    });

    // 🔹 Di dalam masing-masing, kelompokkan lagi berdasarkan kategori
    const groups = {};
    Object.entries(groupsByType).forEach(([type, items]) => {
      const catGroups = {};
      items.forEach((it) => {
        const cat = (it.kategori_pekerjaan || "LAINNYA").toString();
        if (!catGroups[cat]) catGroups[cat] = [];
        catGroups[cat].push(it);
      });
      groups[type] = catGroups;
    });

    // 🔹 Loop dua tingkat: TAMBAH/KURANG → kategori
    // 🔹 Loop dua tingkat: TAMBAH/KURANG → kategori
    for (const [sectionName, categories] of Object.entries(groups)) {
      // Jika bagian ini adalah PEKERJAAN KURANG → mulai halaman baru agar rapi
      if (sectionName === "PEKERJAAN KURANG") {
        addFooter(doc.getNumberOfPages());
        doc.addPage();
        lastY = margin + 10;
      }

      // Header besar: PEKERJAAN TAMBAH / PEKERJAAN KURANG
      if (lastY + 20 > pageHeight - 20) {
        addFooter(doc.getNumberOfPages());
        doc.addPage();
        lastY = margin + 10;
      }

      doc.setFontSize(12).setFont(undefined, "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(sectionName, margin, lastY);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(margin, lastY + 2, pageWidth - margin, lastY + 2);
      lastY += 10;

      let kategoriIndex = 1;
      for (const [kategori, items] of Object.entries(categories)) {
        // filter dulu
        const filteredItems = items.filter(
          (item) => toNumberVol(item.selisih) !== 0
        );

        // jika tidak ada data (semua selisih = 0) → lewati kategori ini
        if (filteredItems.length === 0) {
          continue;
        }

        if (lastY + 20 > pageHeight - 20) {
          addFooter(doc.getNumberOfPages());
          doc.addPage();
          lastY = margin + 10;
        }

        // gambar judul kategori
        doc.setFontSize(11).setFont(undefined, "bold");
        doc.text(`${kategoriIndex}. ${kategori.toUpperCase()}`, margin, lastY);
        lastY += 10;
        kategoriIndex++;

        // siapkan rows dari filteredItems
        const rows = filteredItems.map((item, idx) => {
          const sel = toNumberVol(item.selisih);
          const hMat = toNumberID(item.harga_material);
          const hUpah = toNumberID(item.harga_upah);
          const deltaNominal = sel * (hMat + hUpah);

          return [
            idx + 1,
            item.jenis_pekerjaan,
            item.vol_rab,
            item.satuan,
            item.volume_akhir,
            `${item.selisih} ${item.satuan}`,
            formatRupiah(deltaNominal),
          ];
        });

        autoTable(doc, {
          head: [
            [
              "NO.",
              "JENIS PEKERJAAN",
              "VOL RAB",
              "SATUAN",
              "VOLUME AKHIR",
              "SELISIH",
              "NILAI SELISIH (Rp)",
            ],
          ],
          body: rows,
          startY: lastY,
          margin: { left: margin, right: margin },
          tableWidth: pageWidth - margin * 2,
          theme: "grid",

          // ... styles lainnya (BIARKAN TETAP ADA) ...
          styles: {
            fontSize: 8,
            cellPadding: 3,
            lineHeight: 1.1,
            overflow: "linebreak",
            lineColor: [120, 120, 120],
            lineWidth: 0.3,
          },
          headStyles: {
            fillColor: [205, 234, 242],
            textColor: [0, 0, 0],
            halign: "center",
            valign: "middle",
            fontSize: 8.5,
            fontStyle: "bold",
            minCellHeight: 9,
            lineHeight: 1.15,
            overflow: "linebreak",
            cellPadding: 2,
          },
          columnStyles: {
            0: { halign: "center", cellWidth: 12, minCellHeight: 9 },
            1: { cellWidth: 66 },
            2: { halign: "right", cellWidth: 18 },
            3: { halign: "center", cellWidth: 18 },
            4: { halign: "right", cellWidth: 22 },
            5: { halign: "right", cellWidth: 22 },
            6: { halign: "right", cellWidth: 30, fontStyle: "bold" },
          },

          // ✅ BAGIAN BARU: LOGIKA WARNA KUNING UNTUK OPNAME
          didParseCell: (data) => {
            // 1. Cek baris "IL"
            if (data.section === "body") {
              // 'rows' dibuat dari 'filteredItems', jadi index-nya sinkron
              if (data.row.index < filteredItems.length) {
                const item = filteredItems[data.row.index];
                if (item.is_il) {
                  data.cell.styles.fillColor = [255, 245, 157]; // Kuning
                }
              }
            }

            // 2. Logika Header Kolom 0 (Logika Lama)
            if (data.section === "head" && data.column.index === 0) {
              data.cell.styles.fontSize = 8;
              data.cell.styles.overflow = "hidden";
              data.cell.styles.lineHeight = 1;
            }
          },
        });

        lastY = (doc.lastAutoTable?.finalY ?? lastY) + 10;
      } // <--- Tutup kurung kurawal loop kategori (for const [kategori, items])

      // ============================================================
      // ✅ PERBAIKAN: TABEL SUMMARY PER BLOK (TAMBAH / KURANG)
      // ============================================================

      // 1. Hitung Total Real
      const totalRealBlock = Object.values(categories)
        .flat()
        .filter((item) => toNumberVol(item.selisih) !== 0)
        .reduce((sum, item) => {
          const sel = toNumberVol(item.selisih);
          const hMat = toNumberID(item.harga_material);
          const hUpah = toNumberID(item.harga_upah);
          return sum + sel * (hMat + hUpah);
        }, 0);

      // 2. Hitung Pembulatan (Puluhan Ribu)
      // Logika:
      // Jika Positif (TAMBAH): 21.364.000 -> 21.360.000 (Floor)
      // Jika Negatif (KURANG): -21.364.000 -> -21.360.000 (Ceil, mendekati 0)
      const totalPembulatanBlock =
        totalRealBlock >= 0
          ? Math.floor(totalRealBlock / 10000) * 10000
          : Math.ceil(totalRealBlock / 10000) * 10000;

      // 3. Hitung PPN 11% dari nilai Pembulatan
      const ppnBlock = totalPembulatanBlock * 0.11;

      // 4. Hitung Grand Total
      const grandTotalBlock = totalPembulatanBlock + ppnBlock;

      // Tampilkan Tabel Summary
      autoTable(doc, {
        body: [
          ["TOTAL " + sectionName.toUpperCase(), formatRupiah(totalRealBlock)],
          ["PEMBULATAN", formatRupiah(totalPembulatanBlock)],
          ["PPN 11%", formatRupiah(ppnBlock)],
          [
            "GRAND TOTAL " + sectionName.toUpperCase(),
            formatRupiah(grandTotalBlock),
          ],
        ],
        startY: lastY,
        margin: { left: pageWidth - 90, right: margin },
        tableWidth: 80,
        theme: "grid",
        styles: {
          fontSize: 8,
          halign: "right",
          cellPadding: 2,
          lineColor: [150, 150, 150],
          lineWidth: 0.1,
        },
        columnStyles: {
          0: { halign: "left", cellWidth: 35, fontStyle: "bold" },
          1: { halign: "right", cellWidth: 45 },
        },
        didParseCell(data) {
          // Baris GRAND TOTAL (index 3) diwarnai
          if (data.row.index === 3) {
            data.cell.styles.fillColor = [144, 238, 144];
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;
    }

    // GRAND TOTAL untuk Opname
    if (lastY + 40 > pageHeight - 20) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      lastY = margin + 10;
    }

    let totalTambah = 0;
    let totalKurang = 0;

    submissions.forEach((item) => {
      const sel = toNumberVol(item.selisih); // bisa ±
      const unit =
        toNumberID(item.harga_material) + toNumberID(item.harga_upah);
      const delta = sel * unit; // nilai rupiah SELISIH

      if (delta > 0) totalTambah += delta; // Tambah (+)
      else if (delta < 0) totalKurang += delta; // Kurang (–)
    });

    // PPN 11% per komponen (Kurang akan bernilai negatif)
    const ppnTambah = totalTambah * 0.11;
    const ppnKurang = totalKurang * 0.11;

    const totalTambahPPN = totalTambah + ppnTambah;
    const totalKurangPPN = totalKurang + ppnKurang;

    // RAB final (sudah ada di variabel totalSetelahPPNRAB)
    const deltaPPN = totalTambahPPN + totalKurangPPN;
    const totalSetelahPPNOpname = totalSetelahPPNRAB + deltaPPN; // RAB + Tambah + Kurang

    lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;

    // --- STATUS PEKERJAAN (DIPERAPiHKAN) ---
    addFooter(doc.getNumberOfPages());
    doc.addPage();
    lastY = margin + 10;

    // Header tanpa warna (elegan minimalis)
    doc.setFontSize(12).setFont(undefined, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("STATUS PEKERJAAN", margin, lastY);

    // Garis tipis di bawah judul (gaya seperti RAB FINAL)
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(margin, lastY + 2, pageWidth - margin, lastY + 2);
    lastY += 10;

    // Tentukan status berdasarkan selisih Opname vs RAB (keduanya setelah PPN)
    // status berdasarkan delta PPN (Tambah+Kurang)
    const deltaNominal = totalSetelahPPNOpname - totalSetelahPPNRAB;
    let statusText = "Sesuai RAB (Tidak Ada Perubahan)";
    if (deltaNominal > 0) statusText = "Pekerjaan Tambah";
    if (deltaNominal < 0) statusText = "Pekerjaan Kurang";

    // ... (kode sebelumnya: perhitungan deltaNominal dan statusText) ...

    const statusTableBody = [
      [
        {
          content: `STATUS: ${statusText}`,
          colSpan: 2,
          styles: {
            halign: "left",
            fontSize: 12,
            fontStyle: "bold",
            fillColor: [245, 245, 245],
            cellPadding: 4,
          },
        },
      ],
      // 1. RAB Final
      ["RAB Final (incl. PPN)", formatRupiah(totalSetelahPPNRAB)],

      // 2. Pekerjaan Tambah
      [
        "Pekerjaan Tambah (incl. PPN)",
        `${totalTambahPPN >= 0 ? "" : ""}${formatRupiah(totalTambahPPN)}`,
      ],

      // 3. Pekerjaan Kurang
      ["Pekerjaan Kurang (incl. PPN)", formatRupiah(totalKurangPPN)],

      // 4. Selisih (Posisi Baru: Di atas Opname Final)
      [
        "Selisih Pekerjaan Tambah dan Kurang",
        `${deltaNominal >= 0 ? "+" : ""}${formatRupiah(deltaNominal)}`,
      ],

      // 5. Opname Final (Posisi Baru: Paling Bawah)
      ["Opname Final (incl. PPN)", formatRupiah(totalSetelahPPNOpname)],
    ];

    // >>> Tambahkan variabel lebar tabel
    const usableWidth = pageWidth - margin * 2;
    const leftColWidth = Math.floor(usableWidth * 0.58); // kolom label
    const rightColWidth = usableWidth - leftColWidth; // kolom nilai

    autoTable(doc, {
      body: statusTableBody,
      startY: lastY,
      margin: { left: margin, right: margin },
      tableWidth: usableWidth,
      theme: "grid",
      styles: {
        fontSize: 11,
        halign: "left",
        cellPadding: 4,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: leftColWidth, fontStyle: "bold" },
        1: { halign: "right", cellWidth: rightColWidth },
      },
      didParseCell: function (data) {
        // Highlight Baris Terakhir (OPNAME FINAL) dengan warna HIJAU
        if (data.row.index === statusTableBody.length - 1) {
          data.cell.styles.fillColor = [144, 238, 144];
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fontStyle = "bold";
        }

        // Opsional: Tebalkan juga nilai Selisih (baris sebelum terakhir)
        if (
          statusTableBody[data.row.index] &&
          statusTableBody[data.row.index][0] ===
            "Selisih Pekerjaan Tambah dan Kurang" &&
          data.column.index === 1
        ) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;

    // --- LAMPIRAN FOTO ---
    // --- LAMPIRAN FOTO (TAMPILAN RAPI TANPA BLOK WARNA) ---
    const itemsWithPhotos = (submissions || []).filter((item) => item.foto_url);
    if (itemsWithPhotos.length > 0) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      let pageNum = doc.getNumberOfPages();

      // Header elegan tanpa warna blok
      doc.setFontSize(12).setFont(undefined, "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("LAMPIRAN FOTO BUKTI", pageWidth / 2, 20, { align: "center" });

      // Garis tipis pemisah di bawah header
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(margin, 25, pageWidth - margin, 25);

      // Reset posisi awal foto
      let photoY = 35;
      let photoCount = 0;
      let columnIndex = 0;
      const columnWidth = (pageWidth - margin * 3) / 2;
      const leftColumnX = margin;
      const rightColumnX = margin + columnWidth + margin;

      // Ambil semua foto base64
      const photoPromises = itemsWithPhotos.map((item) =>
        toBase64(item.foto_url)
      );
      const base64Photos = await Promise.all(photoPromises);
      const photoMap = {};
      itemsWithPhotos.forEach((item, index) => {
        if (base64Photos[index]) {
          photoMap[item.jenis_pekerjaan] = base64Photos[index];
        }
      });

      // Render foto berpasangan
      itemsWithPhotos.forEach((item) => {
        const imgData = photoMap[item.jenis_pekerjaan];
        if (imgData) {
          const imgProps = doc.getImageProperties(imgData);
          const maxWidth = columnWidth - 10;
          const maxHeight = 80;
          let imgWidth = maxWidth;
          let imgHeight = (imgProps.height * imgWidth) / imgProps.width;

          if (imgHeight > maxHeight) {
            imgHeight = maxHeight;
            imgWidth = (imgProps.width * imgHeight) / imgProps.height;
          }

          const currentX = columnIndex === 0 ? leftColumnX : rightColumnX;

          // Pindah halaman jika hampir penuh
          if (photoY + imgHeight + 35 > pageHeight - 20) {
            addFooter(pageNum);
            doc.addPage();
            pageNum++;
            photoY = 35;
            columnIndex = 0;
          }

          // Judul foto
          doc.setFontSize(9).setFont(undefined, "bold");
          const titleMaxWidth = columnWidth - 10;
          const titleLines = wrapText(
            doc,
            `${++photoCount}. ${item.jenis_pekerjaan}`,
            titleMaxWidth
          );

          let titleY = photoY;
          titleLines.forEach((line) => {
            doc.text(line, currentX, titleY);
            titleY += 5;
          });

          const titleHeight = titleLines.length * 5;
          const imageStartY = photoY + titleHeight + 2;

          // Gambar dengan border lembut abu-abu
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.rect(currentX, imageStartY, imgWidth + 4, imgHeight + 4);
          doc.addImage(
            imgData,
            currentX + 2,
            imageStartY + 2,
            imgWidth,
            imgHeight
          );

          // Pindah posisi
          if (columnIndex === 0) {
            columnIndex = 1;
          } else {
            columnIndex = 0;
            photoY = imageStartY + imgHeight + 25; // spasi antar baris lebih lega
          }
        }
      });

      addFooter(pageNum);
    }

    // Tambahkan footer ke semua halaman yang ada (jika belum)
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i);
    }

    doc.save(
      `Laporan_Opname_dan_RAB_${selectedStore.kode_toko}_${
        selectedUlok || "undefined"
      }.pdf`
    );
    console.log("PDF dengan format kategori berhasil dibuat.");
  }
};
