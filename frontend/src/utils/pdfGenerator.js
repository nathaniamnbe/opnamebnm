  // src/utils/pdfGenerator.js


  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || process.env.REACT_APP_API_URL || "";


  // --- PENGATURAN TEKS ---
  const companyName = "PT. SUMBER ALFARIA TRIJAYA, Tbk";
  // const branch = "CABANG: HEAD OFFICE";
  const reportTitle = "BERITA ACARA OPNAME PEKERJAAN";
  const logoUrl =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Alfamart_logo.svg/1280px-Alfamart_logo.svg.png";

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
    const cleaned = s.replace(/[^\d,.\-]/g, "");
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

    const n = Number(s.replace(/[^\d.\-]/g, ""));
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

    // --- HEADER ---
    doc.setFillColor(229, 30, 37);
    doc.rect(0, 0, pageWidth, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12).setFont(undefined, "bold");
    doc.text(companyName, pageWidth / 2, 12, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    let startY = 40;

    // --- JUDUL DOKUMEN ---
    doc.setFontSize(14).setFont(undefined, "bold");
    doc.text(reportTitle, pageWidth / 2, startY, { align: "center" });
    startY += 20;

    // --- INFO PROYEK ---
    doc.setFontSize(10);
    doc.text(`NOMOR ULOK : ${selectedUlok || "undefined"}`, margin, startY);
    startY += 7;
    // 🔹 Tambahkan Lingkup Pekerjaan dari data submissions
    doc.text(`LINGKUP PEKERJAAN : ${selectedLingkup || "N/A"}`, margin, startY);
    startY += 7;
    doc.text(`ALAMAT : ${selectedStore.nama_toko}`, margin, startY);
    startY += 7;
    doc.text(`TANGGAL OPNAME : ${currentDate}`, margin, startY);
    startY += 7;
    // Jika ada banyak PIC, gabungkan dengan koma
    // Jika ada banyak PIC, gabungkan dengan koma
    const picLine =
      picList && picList.length > 0
        ? picList.join(", ")
        : picKontraktorData.name || picKontraktorData.pic_username || "N/A";

    doc.text(`NAMA PIC : ${picLine}`, margin, startY);
    startY += 7;
    doc.text(
      `NAMA KONTRAKTOR : ${picKontraktorData.kontraktor_username || "N/A"}`,
      margin,
      startY
    );
    startY += 15;

    // --- BAGIAN RAB FINAL ---
    doc.setFontSize(12).setFont(undefined, "bold");
    doc.setFillColor(229, 30, 37);
    doc.rect(0, startY - 5, pageWidth, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.text("RAB FINAL", margin, startY);
    doc.setTextColor(0, 0, 0);
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
        styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
        headStyles: {
          fillColor: [173, 216, 230],
          textColor: [0, 0, 0],
          halign: "center",
          valign: "middle",
          fontSize: 7,
          fontStyle: "bold",
        },
        bodyStyles: {
          fontSize: 7,
          valign: "middle",
          lineColor: [150, 150, 150],
          lineWidth: 0.2,
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { cellWidth: "auto", minCellWidth: 40 },
          2: { halign: "center", cellWidth: 12 },
          3: { halign: "right", cellWidth: 12 },
          4: { halign: "right", cellWidth: 20 },
          5: { halign: "right", cellWidth: 20 },
          6: { halign: "right", cellWidth: 20 },
          7: { halign: "right", cellWidth: 20 },
          8: { halign: "right", cellWidth: 25, fontStyle: "bold" },
        },
        didParseCell: function (data) {
          if (
            data.row.index === data.table.body.length - 1 &&
            data.column.index > 4
          ) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [240, 240, 240];
          }
        },
        didDrawPage: function (data) {
          if (data.settings.startY + data.table.height > pageHeight - 20) {
            addFooter(doc.getNumberOfPages());
          }
        },
      });

      lastY = (doc.lastAutoTable?.finalY ?? lastY) + 10;
    });

    // GRAND TOTAL untuk RAB
    if (lastY + 40 > pageHeight - 20) {
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      lastY = margin + 10;
    }

    const ppnRAB = grandTotalRAB * 0.11;
    const totalSetelahPPNRAB = grandTotalRAB + ppnRAB;

    const totalTableBody = [
      ["TOTAL", formatRupiah(grandTotalRAB)],
      ["PPN 11%", formatRupiah(ppnRAB)],
      ["GRAND TOTAL", formatRupiah(totalSetelahPPNRAB)],
    ];

    autoTable(doc, {
      body: totalTableBody,
      startY: lastY,
      margin: { left: pageWidth - 90, right: margin },
      tableWidth: 80,
      theme: "grid",
      styles: {
        fontSize: 9,
        fontStyle: "bold",
        halign: "right",
        cellPadding: 2,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: 30 },
        1: { halign: "right", cellWidth: 50 },
      },
      didParseCell: function (data) {
        if (data.row.index === 2) {
          data.cell.styles.fillColor = [173, 216, 230];
          data.cell.styles.textColor = [0, 0, 0];
        }
      },
    });

    lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;


    // --- BAGIAN LAPORAN OPNAME FINAL ---
    if (submissions && submissions.length > 0) {
      // Selalu mulai di halaman baru untuk Opname
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      lastY = margin + 10;

      doc.setFontSize(12).setFont(undefined, "bold");
      doc.setFillColor(34, 139, 34);
      doc.rect(0, lastY - 5, pageWidth, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.text("LAPORAN OPNAME FINAL (APPROVED)", margin, lastY);
      doc.setTextColor(0, 0, 0);
      lastY += 10;

      const opnameTableColumn = [
        "No",
        "Jenis Pekerjaan",
        "Vol RAB",
        "Satuan",
        "Volume Akhir",
        "Selisih",
        "Total Harga Akhir",
      ];

      // 🔹 Pisahkan lebih dulu jadi PEKERJAAN TAMBAH & KURANG
      const groupsByType = {
        "PEKERJAAN TAMBAH": [],
        "PEKERJAAN KURANG": [],
      };

      (submissions || []).forEach((it) => {
        const total = Number(
          String(it.total_harga_akhir || 0).replace(/[^0-9\.\-]/g, "")
        );
        const groupType = total >= 0 ? "PEKERJAAN TAMBAH" : "PEKERJAAN KURANG";
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
      for (const [sectionName, categories] of Object.entries(groups)) {
        // Header besar: PEKERJAAN TAMBAH / PEKERJAAN KURANG
        if (lastY + 20 > pageHeight - 20) {
          addFooter(doc.getNumberOfPages());
          doc.addPage();
          lastY = margin + 10;
        }

        doc.setFontSize(12).setFont(undefined, "bold");
        const color =
          sectionName === "PEKERJAAN TAMBAH" ? [34, 139, 34] : [220, 20, 60];
        doc.setFillColor(...color);
        doc.rect(0, lastY - 5, pageWidth, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(sectionName, margin, lastY);
        doc.setTextColor(0, 0, 0);
        lastY += 10;

        let kategoriIndex = 1;
        for (const [kategori, items] of Object.entries(categories)) {
          if (lastY + 20 > pageHeight - 20) {
            addFooter(doc.getNumberOfPages());
            doc.addPage();
            lastY = margin + 10;
          }

          doc.setFontSize(11).setFont(undefined, "bold");
          doc.text(
            `${kategoriIndex}. ${kategori.toUpperCase()}`,
            margin,
            lastY + 8
          );
          lastY += 12;
          kategoriIndex++;

          const rows = items.map((item, idx) => [
            idx + 1,
            item.jenis_pekerjaan,
            item.vol_rab,
            item.satuan,
            item.volume_akhir,
            `${item.selisih} ${item.satuan}`,
            formatRupiah(item.total_harga_akhir),
          ]);

          autoTable(doc, {
            head: [
              [
                "No",
                "Jenis Pekerjaan",
                "Vol RAB",
                "Satuan",
                "Volume Akhir",
                "Selisih",
                "Total Harga Akhir",
              ],
            ],
            body: rows,
            startY: lastY,
            margin: { left: margin, right: margin },
            theme: "grid",
            styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
            headStyles: {
              fillColor: color,
              textColor: [255, 255, 255],
              halign: "center",
              valign: "middle",
              fontSize: 7,
              fontStyle: "bold",
            },
            bodyStyles: {
              fontSize: 7,
              valign: "middle",
              lineColor: [150, 150, 150],
              lineWidth: 0.2,
            },
            columnStyles: {
              0: { halign: "center", cellWidth: 8 },
              1: { cellWidth: "auto", minCellWidth: 40 },
              2: { halign: "center", cellWidth: 12 },
              3: { halign: "right", cellWidth: 12 },
              4: { halign: "right", cellWidth: 15 },
              5: { halign: "right", cellWidth: 20 },
              6: { halign: "right", cellWidth: 25 },
            },
          });

          lastY = (doc.lastAutoTable?.finalY ?? lastY) + 10;
        }

        // ✅ Total per BLOK (TAMBAH/KURANG) — HARUS di dalam loop ini
        const totalPerBlock = Object.values(categories)
          .flat()
          .reduce((sum, item) => sum + toNumberID(item.total_harga_akhir), 0);

        autoTable(doc, {
          body: [
            ["TOTAL " + sectionName, formatRupiah(totalPerBlock)],
            ["PPN 11%", formatRupiah(totalPerBlock * 0.11)],
            ["GRAND TOTAL " + sectionName, formatRupiah(totalPerBlock * 1.11)],
          ],
          startY: lastY,
          margin: { left: pageWidth - 90, right: margin },
          tableWidth: 80,
          theme: "grid",
          styles: {
            fontSize: 8,
            fontStyle: "bold",
            halign: "right",
            cellPadding: 2,
          },
          columnStyles: {
            0: { halign: "left", cellWidth: 30 },
            1: { halign: "right", cellWidth: 50 },
          },
          didParseCell: function (data) {
            if (data.row.index === 2) {
              data.cell.styles.fillColor =
                sectionName === "PEKERJAAN TAMBAH"
                  ? [34, 139, 34]
                  : [220, 20, 60];
              data.cell.styles.textColor = [255, 255, 255];
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

      let grandTotalOpname = 0;
      submissions.forEach((item) => {
        grandTotalOpname += toNumberID(item.total_harga_akhir);
      });

      const ppnOpname = grandTotalOpname * 0.11;
      const totalSetelahPPNOpname = grandTotalOpname + ppnOpname;

      const totalOpnameTableBody = [
        ["TOTAL", formatRupiah(grandTotalOpname)],
        ["PPN 11%", formatRupiah(ppnOpname)],
        ["GRAND TOTAL", formatRupiah(totalSetelahPPNOpname)],
      ];

      autoTable(doc, {
        body: totalOpnameTableBody,
        startY: lastY,
        margin: { left: pageWidth - 90, right: margin },
        tableWidth: 80,
        theme: "grid",
        styles: {
          fontSize: 9,
          fontStyle: "bold",
          halign: "right",
          cellPadding: 2,
        },
        columnStyles: {
          0: { halign: "left", cellWidth: 30 },
          1: { halign: "right", cellWidth: 50 },
        },
        didParseCell: function (data) {
          if (data.row.index === 2) {
            data.cell.styles.fillColor = [34, 139, 34];
            data.cell.styles.textColor = [255, 255, 255];
          }
        },
      });

      lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;

      // --- STATUS PEKERJAAN (DIPERAPiHKAN) ---
      addFooter(doc.getNumberOfPages());
      doc.addPage();
      lastY = margin + 10;

      // Header bar konsisten (merah)
      doc.setFontSize(12).setFont(undefined, "bold");
      doc.setFillColor(229, 30, 37);
      doc.rect(0, lastY - 5, pageWidth, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.text("STATUS PEKERJAAN", margin, lastY);
      doc.setTextColor(0, 0, 0);
      lastY += 14;

      // Tentukan status berdasarkan selisih Opname vs RAB (keduanya setelah PPN)
      const deltaNominal = totalSetelahPPNOpname - totalSetelahPPNRAB;
      let statusText = "Sesuai RAB (Tidak Ada Perubahan)";
      if (deltaNominal > 0) statusText = "Pekerjaan Tambah";
      if (deltaNominal < 0) statusText = "Pekerjaan Kurang";

      // Atur ukuran kolom untuk lebar hampir penuh halaman
      const usableWidth = pageWidth - margin * 2;
      const leftColWidth = usableWidth * 0.62; // label
      const rightColWidth = usableWidth * 0.38; // nilai

      // SELURUH RINGKASAN DIBUAT DALAM SATU TABEL, LEBAR PENUH & FONT BESAR
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
        ["RAB Final (incl. PPN)", formatRupiah(totalSetelahPPNRAB)],
        ["Opname Final (incl. PPN)", formatRupiah(totalSetelahPPNOpname)],
        [
          "Selisih",
          `${deltaNominal >= 0 ? "+" : ""}${formatRupiah(deltaNominal)}`,
        ],
        [
          {
            content: "",
            colSpan: 2,
            styles: {
              fillColor: [255, 255, 255],
              lineWidth: 0,
              cellPadding: 2,
            },
          },
        ],
        ["TOTAL", formatRupiah(grandTotalOpname)],
        ["PPN 11%", formatRupiah(ppnOpname)],
        ["GRAND TOTAL", formatRupiah(totalSetelahPPNOpname)],
      ];

      autoTable(doc, {
        body: statusTableBody,
        startY: lastY,
        margin: { left: margin, right: margin }, // kiri (bukan kanan)
        tableWidth: usableWidth, // penuh halaman (ikut margin)
        theme: "grid",
        styles: {
          fontSize: 11, // font lebih besar
          halign: "left",
          cellPadding: 4, // padding lebih lega
        },
        columnStyles: {
          0: { halign: "left", cellWidth: leftColWidth, fontStyle: "bold" },
          1: { halign: "right", cellWidth: rightColWidth },
        },
        didParseCell: function (data) {
          // Highlight GRAND TOTAL (baris terakhir)
          if (data.row.index === statusTableBody.length - 1) {
            data.cell.styles.fillColor = [173, 216, 230];
            data.cell.styles.textColor = [0, 0, 0];
            data.cell.styles.fontStyle = "bold";
          }
          // Tebalkan nilai Selisih agar menonjol
          if (
            statusTableBody[data.row.index] &&
            statusTableBody[data.row.index][0] === "Selisih" &&
            data.column.index === 1
          ) {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      lastY = (doc.lastAutoTable?.finalY ?? lastY) + 15;

      // --- LAMPIRAN FOTO ---
      const itemsWithPhotos = (submissions || []).filter(
        (item) => item.foto_url
      );
      if (itemsWithPhotos.length > 0) {
        // Selalu mulai di halaman baru untuk Foto
        addFooter(doc.getNumberOfPages());
        doc.addPage();
        let pageNum = doc.getNumberOfPages();

        // Header halaman foto
        doc.setFillColor(229, 30, 37);
        doc.rect(0, 0, pageWidth, 20, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12).setFont(undefined, "bold");
        doc.text("LAMPIRAN FOTO BUKTI", pageWidth / 2, 13, { align: "center" });
        doc.setTextColor(0, 0, 0);

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

        let photoY = 30;
        let photoCount = 0;
        let columnIndex = 0; // 0 kiri, 1 kanan
        const columnWidth = (pageWidth - margin * 3) / 2;
        const leftColumnX = margin;
        const rightColumnX = margin + columnWidth + margin;

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

            if (photoY + imgHeight + 35 > pageHeight - 20) {
              addFooter(pageNum);
              doc.addPage();
              pageNum++;
              photoY = 30;
              columnIndex = 0;
            }

            // Judul foto
            doc.setFontSize(8).setFont(undefined, "bold");
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

            // Gambar dengan border
            doc.setLineWidth(0.5);
            doc.rect(currentX, imageStartY, imgWidth + 4, imgHeight + 4);
            doc.addImage(
              imgData,
              currentX + 2,
              imageStartY + 2,
              imgWidth,
              imgHeight
            );

            // Pindah kolom / baris
            if (columnIndex === 0) {
              columnIndex = 1;
            } else {
              columnIndex = 0;
              photoY = imageStartY + imgHeight + 20;
            }
          }
        });

        // Footer halaman foto terakhir
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
