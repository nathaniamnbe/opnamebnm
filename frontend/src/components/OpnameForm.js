"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import LingkupSelection from "./LingkupSelection";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

// Fungsi bantu untuk format mata uang
const formatRupiah = (number) => {
  const numericValue = Number(number) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0, // penting agar tidak "Rp 18,5"
  }).format(numericValue);
};

// "18.500.000,00" / "Rp 1.368.400,00" -> 18500000
const toNumID = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  const cleaned = s.replace(/[^\d,.-]/g, ""); // buang "Rp" & spasi
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

// Input user (mis. "1.00", "0.5") -> TIDAK hapus titik desimal
const toNumInput = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(",", "."); // koma dianggap titik
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const OpnameForm = ({ onBack, selectedStore }) => {
  const { user } = useAuth();
  const [opnameItems, setOpnameItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uloks, setUloks] = useState([]);
  const [selectedUlok, setSelectedUlok] = useState(null);
  const [selectedLingkup, setSelectedLingkup] = useState(null);

  useEffect(() => {
    if (selectedStore?.kode_toko) {
      setLoading(true);
      // Fetch daftar no_ulok untuk kode_toko ini
      fetch(`${API_BASE_URL}/api/uloks?kode_toko=${selectedStore.kode_toko}`)
        .then((res) => res.json())
        .then((data) => {
          setUloks(data);
          if (data.length === 1) {
            setSelectedUlok(data[0]);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Gagal mengambil daftar no_ulok:", err);
          setLoading(false);
        });
    }
  }, [selectedStore]);

  // Ambil daftar item opname (jalan meskipun selectedLingkup belum dipilih)
  useEffect(() => {
    if (selectedStore?.kode_toko && selectedUlok) {
      setLoading(true);

      const base =
        `${API_BASE_URL}/api/opname?kode_toko=${encodeURIComponent(
          selectedStore.kode_toko
        )}` + `&no_ulok=${encodeURIComponent(selectedUlok)}`;

      // normalisasi lingkup jika ada
      const lk = String(selectedLingkup || "")
        .trim()
        .toUpperCase();
      const withLingkup = lk
        ? base + `&lingkup=${encodeURIComponent(lk)}`
        : null;

      const mapItems = (data, lkUsed) => {
        const items = (data || []).map((task, index) => {
          const volRab = toNumInput(task.vol_rab);
          const volAkhirNum = toNumInput(task.volume_akhir);
          const hargaMaterial = toNumID(task.harga_material);
          const hargaUpah = toNumID(task.harga_upah);
          const total_harga = volAkhirNum * (hargaMaterial + hargaUpah);

          const alreadySubmitted =
            task.isSubmitted === true ||
            !!task.item_id ||
            ["PENDING", "APPROVED", "REJECTED"].includes(
              String(task.approval_status || "").toUpperCase()
            );

          return {
            ...task,
            id: index + 1,
            rab_key: task.rab_key || "",

            // simpan lingkup agar bisa ikut dikirim saat submit
            lingkup_pekerjaan: task.lingkup_pekerjaan || lkUsed || null,

            // angka-angka sudah dibersihkan
            harga_material: hargaMaterial,
            harga_upah: hargaUpah,

            // kunci baris yang sudah tersubmit
            isSubmitted: alreadySubmitted,
            approval_status:
              task.approval_status ||
              (alreadySubmitted ? "Pending" : undefined),
            submissionTime: task.tanggal_submit || task.submissionTime || null,
            foto_url: alreadySubmitted ? task.foto_url : null,

            // nilai form
            // nilai form
            volume_akhir: alreadySubmitted ? String(volAkhirNum) : "",
            // bulatkan ke 2 desimal lalu jadikan string "x.xx"
            selisih: (
              Math.round((volAkhirNum - volRab + Number.EPSILON) * 100) / 100
            ).toFixed(2),
            total_harga,
          };
        });
        setOpnameItems(items);
      };

      // strategi fetch:
      // 1) jika ada lingkup → pakai itu
      // 2) kalau kosong → coba tanpa filter → ME → SIPIL
      (async () => {
        try {
          if (withLingkup) {
            const r = await fetch(withLingkup);
            const d = await r.json();
            mapItems(d, lk);
            setLoading(false);
            return;
          }

          let r = await fetch(base);
          let d = await r.json();
          if (!Array.isArray(d) || d.length === 0) {
            r = await fetch(base + `&lingkup=ME`);
            d = await r.json();
            if (!Array.isArray(d) || d.length === 0) {
              r = await fetch(base + `&lingkup=SIPIL`);
              d = await r.json();
              mapItems(d, "SIPIL");
            } else {
              mapItems(d, "ME");
            }
          } else {
            mapItems(d, null); // server sudah balikin data tanpa filter
          }
        } catch (err) {
          console.error("Gagal mengambil detail pekerjaan:", err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [selectedStore, selectedUlok, selectedLingkup, user]);

  const handleVolumeAkhirChange = (id, value) => {
    setOpnameItems((prevItems) =>
      prevItems.map((item) => {
        // ⬅️ Untuk baris RAB saja, pekerjaan manual pakai handler khusus
        if (item.id === id && !item.isSubmitted && !item.isManual) {
          const volAkhir = toNumInput(value);
          const volRab = toNumInput(item.vol_rab);
          const selisih = volAkhir - volRab;
          const hargaMaterial = Number(item.harga_material) || 0;
          const hargaUpah = Number(item.harga_upah) || 0;

          const total_harga = volAkhir * (hargaMaterial + hargaUpah);

          return {
            ...item,
            volume_akhir: value,
            selisih: selisih.toFixed(2),
            total_harga,
          };
        }
        return item;
      })
    );
  };

  // ⬇️ Handler khusus untuk mengubah field pekerjaan manual
  const handleManualFieldChange = (id, field, value) => {
    setOpnameItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== id || !item.isManual || item.isSubmitted) return item;

        const updated = { ...item, [field]: value };

        const volRabNum = toNumInput(updated.vol_rab);
        const volAkhirNum = toNumInput(updated.volume_akhir);
        const hargaMaterialNum = toNumInput(updated.harga_material);
        const hargaUpahNum = toNumInput(updated.harga_upah);

        const selisih = volAkhirNum - volRabNum;
        const total_harga = volAkhirNum * (hargaMaterialNum + hargaUpahNum);

        return {
          ...updated,
          selisih:
            Number.isFinite(selisih) && !Number.isNaN(selisih)
              ? selisih.toFixed(2)
              : "",
          total_harga:
            Number.isFinite(total_harga) && !Number.isNaN(total_harga)
              ? total_harga
              : 0,
        };
      })
    );
  };

  // ⬇️ Tombol "Tambah Pekerjaan Manual"
  const handleAddManualItem = () => {
    setOpnameItems((prev) => {
      const maxId = prev.reduce(
        (max, item) => (item.id && item.id > max ? item.id : max),
        0
      );

      const newItem = {
        id: maxId + 1,
        isManual: true,
        isManualDraft: true,
        kategori_pekerjaan: "",
        lingkup_pekerjaan: selectedLingkup || null,
        jenis_pekerjaan: "",
        vol_rab: "",
        satuan: "",
        harga_material: 0,
        harga_upah: 0,
        volume_akhir: "",
        selisih: "",
        total_harga: 0,
        foto_url: null,
        catatan: "",
        isSubmitted: false,
        approval_status: "Not Submitted",
      };

      return [...prev, newItem];
    });
  };

  const handleFileUpload = async (itemId, file) => {
    if (!file) return;
    setOpnameItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isUploading: true } : item
      )
    );
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setOpnameItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, isUploading: false, foto_url: result.link }
            : item
        )
      );
    } catch (error) {
      alert(`Gagal upload foto: ${error.message}`);
      setOpnameItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, isUploading: false } : item
        )
      );
    }
  };

  const handleItemSubmit = async (itemId) => {
    const itemToSubmit = opnameItems.find((item) => item.id === itemId);
    if (!itemToSubmit) return;

    if (
      itemToSubmit.volume_akhir === "" ||
      itemToSubmit.volume_akhir === null ||
      itemToSubmit.volume_akhir === undefined
    ) {
      alert("Volume akhir harus diisi sebelum menyimpan.");
      return;
    }

    // 🔹 Validasi ekstra khusus pekerjaan manual
    if (itemToSubmit.isManual) {
      const requiredFields = [
        ["kategori_pekerjaan", "Kategori pekerjaan harus diisi."],
        ["jenis_pekerjaan", "Jenis pekerjaan harus diisi."],
        ["vol_rab", "Vol RAB harus diisi."],
        ["satuan", "Satuan harus diisi."],
      ];

      for (const [field, message] of requiredFields) {
        const val = itemToSubmit[field];
        if (val === "" || val === null || val === undefined) {
          alert(message);
          return;
        }
      }
    }

    setOpnameItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isSubmitting: true } : item
      )
    );

    const submissionData = {
      kode_toko: selectedStore.kode_toko,
      nama_toko: selectedStore.nama_toko,
      pic_username: user.username,
      no_ulok: selectedUlok,
      kategori_pekerjaan: itemToSubmit.kategori_pekerjaan,
      jenis_pekerjaan: itemToSubmit.jenis_pekerjaan,
      vol_rab: itemToSubmit.vol_rab,
      satuan: itemToSubmit.satuan,
      volume_akhir: itemToSubmit.volume_akhir,
      selisih: itemToSubmit.selisih,
      foto_url: itemToSubmit.foto_url,
      harga_material: itemToSubmit.harga_material,
      harga_upah: itemToSubmit.harga_upah,
      total_harga_akhir: itemToSubmit.total_harga,
      lingkup_pekerjaan: itemToSubmit.lingkup_pekerjaan || selectedLingkup,
      rab_key: itemToSubmit.rab_key || "",
    };

    console.log("Data yang akan dikirim:", submissionData); // Debug log

    try {
      const response = await fetch(`${API_BASE_URL}/api/opname/item/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setOpnameItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                isSubmitting: false,
                isSubmitted: true,
                isManual: item.isManual || itemToSubmit.isManual || false,
                isManualDraft: false,
                approval_status: "Pending",
                submissionTime: result.tanggal_submit,
                item_id: result.item_id,
              }
            : item
        )
      );
    } catch (error) {
      alert(`Error: ${error.message}`);
      setOpnameItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, isSubmitting: false } : item
        )
      );
    }
  };

  if (loading) {
    return (
      <div
        className="container"
        style={{ paddingTop: "20px", textAlign: "center" }}
      >
        <h3>Memuat detail pekerjaan...</h3>
      </div>
    );
  }

  if (uloks.length > 0 && !selectedUlok) {
    return (
      <div
        className="container"
        style={{ paddingTop: "20px", width: "100%", maxWidth: "100%" }}
      >
        <div className="card" style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "24px",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={onBack}
              className="btn btn-outline"
              style={{ padding: "8px 16px" }}
            >
              Kembali
            </button>
            <h2 style={{ color: "var(--alfamart-red)" }}>Pilih No. ULOK</h2>
          </div>
          <select
            className="form-select"
            value={selectedUlok || ""}
            onChange={(e) => {
              setSelectedUlok(e.target.value); // pilih ULOK
              setSelectedLingkup(null); // reset lingkup setiap kali ULOK berubah
            }}
          >
            <option value="">Pilih No. ULOK</option>
            {uloks.map((ulok) => (
              <option key={ulok} value={ulok}>
                {ulok}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // STEP 2: jika ULOK sudah dipilih tapi LINGKUP belum -> tampilkan pemilih lingkup
  if (selectedUlok && !selectedLingkup) {
    return (
      <div className="container" style={{ paddingTop: "20px" }}>
        <LingkupSelection
          kodeToko={selectedStore.kode_toko}
          noUlok={selectedUlok}
          onSelect={(lk) => setSelectedLingkup(lk)}
          onCancel={() => setSelectedUlok(null)}
        />
      </div>
    );
  }

  // STEP 3: jika ULOK & LINGKUP sudah ada -> tampilkan tabel input
  return (
    <div
      style={{
        paddingTop: "20px",
        width: "100%",
        maxWidth: "100%",
        margin: "0", // hilangkan margin default
        paddingLeft: "0", // hilangkan padding kiri
        paddingRight: "0", // hilangkan padding kanan
      }}
    >
      <div className="card" style={{ width: "100%", borderRadius: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "24px",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            className="btn btn-outline"
            style={{ padding: "8px 16px" }}
          >
            Kembali
          </button>
          <h2 style={{ color: "var(--alfamart-red)" }}>Input Opname Harian</h2>
        </div>

        <h3 style={{ color: "var(--alfamart-red)", marginBottom: "16px" }}>
          Detail Pekerjaan (No. ULOK: {selectedUlok})
        </h3>

        {/* Tombol tambah baris manual */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "12px",
          }}
        >
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleAddManualItem}
          >
            + Tambah Pekerjaan Manual
          </button>
        </div>

        <div style={{ overflowX: "auto", marginBottom: "20px" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "14px",
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: "var(--alfamart-red)",
                  color: "var(--white)",
                }}
              >
                <th style={{ padding: "12px", minWidth: "140px" }}>Kategori</th>

                <th style={{ padding: "12px", minWidth: "150px" }}>
                  Jenis Pekerjaan
                </th>
                <th style={{ padding: "12px", textAlign: "center" }}>
                  Vol RAB
                </th>
                <th style={{ padding: "12px", textAlign: "center" }}>Satuan</th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    minWidth: "120px",
                  }}
                >
                  Harga Material
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    minWidth: "120px",
                  }}
                >
                  Harga Upah
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    minWidth: "120px",
                  }}
                >
                  Volume Akhir
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    minWidth: "100px",
                  }}
                >
                  Selisih
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "right",
                    minWidth: "130px",
                  }}
                >
                  Total Harga
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    minWidth: "110px",
                  }}
                >
                  Foto
                </th>
                <th style={{ padding: "12px", minWidth: "220px" }}>Catatan</th>
                <th style={{ padding: "12px", textAlign: "center" }}>Status</th>
                <th style={{ padding: "12px", textAlign: "center" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {opnameItems.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    background: (() => {
                      const ST = String(
                        item.approval_status || ""
                      ).toUpperCase();
                      return ST === "REJECTED"
                        ? "#ffe5e5"
                        : item.isSubmitted
                        ? "#f0fff0"
                        : "transparent";
                    })(),
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {/* Kategori */}
                  <td style={{ padding: "12px" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="text"
                        className="form-input"
                        value={item.kategori_pekerjaan}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "kategori_pekerjaan",
                            e.target.value
                          )
                        }
                        placeholder="Kategori"
                      />
                    ) : (
                      item.kategori_pekerjaan
                    )}
                  </td>

                  {/* Jenis Pekerjaan */}
                  <td style={{ padding: "12px" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="text"
                        className="form-input"
                        value={item.jenis_pekerjaan}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "jenis_pekerjaan",
                            e.target.value
                          )
                        }
                        placeholder="Jenis pekerjaan"
                      />
                    ) : (
                      item.jenis_pekerjaan
                    )}
                  </td>

                  {/* Vol RAB */}
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: "90px" }}
                        value={item.vol_rab}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "vol_rab",
                            e.target.value
                          )
                        }
                        placeholder="0"
                        step="any"
                      />
                    ) : (
                      item.vol_rab
                    )}
                  </td>

                  {/* Satuan */}
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="text"
                        className="form-input"
                        style={{ width: "80px" }}
                        value={item.satuan}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "satuan",
                            e.target.value
                          )
                        }
                        placeholder="Sat"
                      />
                    ) : (
                      item.satuan
                    )}
                  </td>

                  {/* Harga Material */}
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: "130px", textAlign: "right" }}
                        value={item.harga_material}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "harga_material",
                            e.target.value
                          )
                        }
                        placeholder="0"
                        step="any"
                      />
                    ) : (
                      formatRupiah(item.harga_material)
                    )}
                  </td>

                  {/* Harga Upah */}
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {item.isManual && !item.isSubmitted ? (
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: "130px", textAlign: "right" }}
                        value={item.harga_upah}
                        onChange={(e) =>
                          handleManualFieldChange(
                            item.id,
                            "harga_upah",
                            e.target.value
                          )
                        }
                        placeholder="0"
                        step="any"
                      />
                    ) : (
                      formatRupiah(item.harga_upah)
                    )}
                  </td>

                  {/* Volume Akhir */}
                  <td style={{ padding: "8px", textAlign: "center" }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: "100px" }}
                      value={item.volume_akhir}
                      onChange={(e) =>
                        item.isManual && !item.isSubmitted
                          ? handleManualFieldChange(
                              item.id,
                              "volume_akhir",
                              e.target.value
                            )
                          : handleVolumeAkhirChange(item.id, e.target.value)
                      }
                      placeholder="0"
                      disabled={item.isSubmitted}
                      step="any"
                    />
                  </td>

                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {(() => {
                      // Tampilkan selisih HANYA jika item sudah tersimpan
                      // ATAU user sudah mengisi volume_akhir (tidak kosong/null/undefined)
                      const hasInput =
                        item.isSubmitted ||
                        (item.volume_akhir !== "" &&
                          item.volume_akhir !== null &&
                          item.volume_akhir !== undefined);

                      if (!hasInput) return <span>-</span>; // sembunyikan selisih dulu

                      const s = parseFloat(item.selisih);
                      return (
                        <span
                          style={{
                            color: s < 0 ? "red" : s > 0 ? "green" : "black",
                            fontWeight: s !== 0 ? "bold" : "normal",
                          }}
                        >
                          {item.selisih || "0"} {item.satuan}
                        </span>
                      );
                    })()}
                  </td>

                  <td
                    style={{
                      padding: "12px",
                      textAlign: "right",
                      fontWeight: "bold",
                      // PERBAIKAN: Warna merah untuk total negatif
                      color: item.total_harga < 0 ? "red" : "black",
                    }}
                  >
                    {formatRupiah(item.total_harga)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {!item.isSubmitted && (
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          id={`file-${item.id}`}
                          style={{ display: "none" }}
                          onChange={(e) =>
                            handleFileUpload(item.id, e.target.files[0])
                          }
                          disabled={item.isUploading}
                        />
                        <label
                          htmlFor={`file-${item.id}`}
                          className={`btn btn-outline btn-sm ${
                            item.isUploading ? "disabled" : ""
                          }`}
                        >
                          {item.isUploading ? "..." : "Pilih Foto"}
                        </label>
                      </div>
                    )}
                    {item.foto_url && (
                      <a
                        href={item.foto_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Lihat Foto
                      </a>
                    )}
                  </td>

                  {/* Catatan */}
                  <td style={{ padding: "12px" }}>
                    {item.catatan ? (
                      <pre
                        style={{
                          whiteSpace: "pre-wrap",
                          fontSize: "12px",
                          color: "#444",
                        }}
                      >
                        {item.catatan}
                      </pre>
                    ) : (
                      <span style={{ color: "#aaa" }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {(() => {
                      const ST = String(
                        item.approval_status || ""
                      ).toUpperCase();
                      const badge =
                        ST === "PENDING"
                          ? "badge-warning"
                          : ST === "APPROVED"
                          ? "badge-success"
                          : ST === "REJECTED"
                          ? "badge-error"
                          : "badge-light";
                      return (
                        <span className={`badge ${badge}`}>
                          {item.approval_status || "-"}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {(() => {
                      const ST = String(
                        item.approval_status || ""
                      ).toUpperCase();

                      if (ST === "REJECTED") {
                        return (
                          <button
                            className="btn btn-warning btn-sm"
                            onClick={() =>
                              setOpnameItems((prev) =>
                                prev.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        isSubmitted: false, // buka kembali agar bisa diisi ulang
                                        approval_status: "Pending", // reset status
                                        volume_akhir: "",
                                        selisih: "",
                                        total_harga: 0,
                                      }
                                    : x
                                )
                              )
                            }
                          >
                            Perbaiki
                          </button>
                        );
                      }

                      if (item.isSubmitted) {
                        return (
                          <div style={{ fontSize: "12px", color: "green" }}>
                            <strong>Tersimpan</strong>
                            <br />
                            <small>{item.submissionTime}</small>
                          </div>
                        );
                      }

                      return (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleItemSubmit(item.id)}
                          disabled={
                            item.isSubmitting ||
                            item.volume_akhir === "" ||
                            item.volume_akhir === null ||
                            item.volume_akhir === undefined
                          }
                        >
                          {item.isSubmitting ? "..." : "Simpan"}
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PERBAIKAN: Tambahkan ringkasan total di bawah tabel */}
        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
          }}
        >
          <h4 style={{ color: "var(--alfamart-red)", marginBottom: "12px" }}>
            Ringkasan Total
          </h4>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span>Total Keseluruhan:</span>
            <strong
              style={{
                color:
                  opnameItems.reduce(
                    (sum, item) => sum + (item.total_harga || 0),
                    0
                  ) < 0
                    ? "red"
                    : "black",
              }}
            >
              {formatRupiah(
                opnameItems.reduce(
                  (sum, item) => sum + (item.total_harga || 0),
                  0
                )
              )}
            </strong>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <span>PPN 11%:</span>
            <strong
              style={{
                color:
                  opnameItems.reduce(
                    (sum, item) => sum + (item.total_harga || 0),
                    0
                  ) *
                    0.11 <
                  0
                    ? "red"
                    : "black",
              }}
            >
              {formatRupiah(
                opnameItems.reduce(
                  (sum, item) => sum + (item.total_harga || 0),
                  0
                ) * 0.11
              )}
            </strong>
          </div>
          <hr style={{ margin: "12px 0" }} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "18px",
            }}
          >
            <span>
              <strong>GRAND TOTAL:</strong>
            </span>
            <strong
              style={{
                color:
                  opnameItems.reduce(
                    (sum, item) => sum + (item.total_harga || 0),
                    0
                  ) *
                    1.11 <
                  0
                    ? "red"
                    : "black",
              }}
            >
              {formatRupiah(
                opnameItems.reduce(
                  (sum, item) => sum + (item.total_harga || 0),
                  0
                ) * 1.11
              )}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpnameForm;
