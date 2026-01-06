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
    maximumFractionDigits: 0,
  }).format(numericValue);
};

const toNumID = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  const cleaned = s.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const toNumInput = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(",", ".");
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

  // --- PENAMBAHAN BARU: State untuk Opname Final ---
  const [canFinalize, setCanFinalize] = useState(false); // Apakah tombol bisa diklik?
  const [isFinalized, setIsFinalized] = useState(false); // Apakah sudah pernah difinalisasi?
  const [isLocking, setIsLocking] = useState(false); // Loading state saat klik tombol final
  // --------------------------------------------------

  useEffect(() => {
    if (selectedStore?.kode_toko) {
      setLoading(true);
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

  // Ambil daftar item opname
  useEffect(() => {
    if (selectedStore?.kode_toko && selectedUlok) {
      setLoading(true);

      const base =
        `${API_BASE_URL}/api/opname?kode_toko=${encodeURIComponent(
          selectedStore.kode_toko
        )}` + `&no_ulok=${encodeURIComponent(selectedUlok)}`;

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
            is_il: task.is_il,
            lingkup_pekerjaan: task.lingkup_pekerjaan || lkUsed || null,
            harga_material: hargaMaterial,
            harga_upah: hargaUpah,
            isSubmitted: alreadySubmitted,
            approval_status:
              task.approval_status ||
              (alreadySubmitted ? "Pending" : undefined),
            submissionTime: task.tanggal_submit || task.submissionTime || null,
            foto_url: alreadySubmitted ? task.foto_url : null,
            volume_akhir: alreadySubmitted ? String(volAkhirNum) : "",
            selisih: (
              Math.round((volAkhirNum - volRab + Number.EPSILON) * 100) / 100
            ).toFixed(2),
            total_harga,
          };
        });
        setOpnameItems(items);
      };

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
            mapItems(d, null);
          }
        } catch (err) {
          console.error("Gagal mengambil detail pekerjaan:", err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [selectedStore, selectedUlok, selectedLingkup, user]);

  // --- PENAMBAHAN BARU: useEffect untuk Cek Status Opname (Button Final) ---
  useEffect(() => {
    // Jalankan hanya jika ULOK dan LINGKUP sudah terpilih/tersedia
    if (selectedUlok && selectedLingkup) {
      const checkStatus = async () => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/check_status_item_opname?no_ulok=${selectedUlok}&lingkup_pekerjaan=${selectedLingkup}`
          );
          const data = await res.json();

          // Logika: Jika status "approved", tombol bisa diklik
          if (data.status === "approved") {
            // Cek apakah response mengandung tanggal_opname_final
            // Jika sudah ada tanggalnya, berarti SUDAH difinalisasi sebelumnya -> disable tombol
            if (data.tanggal_opname_final) {
              setIsFinalized(true);
              setCanFinalize(false);
            } else {
              setIsFinalized(false);
              setCanFinalize(true);
            }
          } else {
            // Jika masih pending atau status lain
            setCanFinalize(false);
            setIsFinalized(false);
          }
        } catch (error) {
          console.error("Error checking opname status:", error);
          setCanFinalize(false);
        }
      };

      checkStatus();
    } else {
      setCanFinalize(false);
    }
  }, [selectedUlok, selectedLingkup, opnameItems]); // Dependency opnameItems agar re-check jika ada item baru disubmit
  // -----------------------------------------------------------------------

  // --- PENAMBAHAN BARU: Handler Klik Opname Final ---
  const handleOpnameFinal = async () => {
    if (!window.confirm("Apakah Anda yakin ingin melakukan Opname Final? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }

    setIsLocking(true);
    const payload = {
      status: "locked",
      ulok: selectedUlok,
      lingkup_pekerjaan: selectedLingkup,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/opname_locked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        alert("Opname berhasil difinalisasi!");
        setIsFinalized(true); // Kunci tombol secara lokal
        setCanFinalize(false);
      } else {
        alert(`Gagal finalisasi: ${result.message}`);
      }
    } catch (error) {
      alert(`Terjadi kesalahan: ${error.message}`);
    } finally {
      setIsLocking(false);
    }
  };
  // --------------------------------------------------

  const handleVolumeAkhirChange = (id, value) => {
    setOpnameItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === id && !item.isSubmitted) {
          const volAkhir = toNumInput(value);
          const volRab = toNumInput(item.vol_rab);
          const selisih = volAkhir - volRab;
          const hargaMaterial = Number(item.harga_material) || 0;
          const hargaUpah = Number(item.harga_upah) || 0;
          const total_harga = selisih * (hargaMaterial + hargaUpah);

          return {
            ...item,
            volume_akhir: value,
            selisih: selisih.toFixed(2),
            total_harga: total_harga,
          };
        }
        return item;
      })
    );
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
    if (
      itemToSubmit.volume_akhir === "" ||
      itemToSubmit.volume_akhir === null ||
      itemToSubmit.volume_akhir === undefined
    ) {
      alert("Volume akhir harus diisi sebelum menyimpan.");
      return;
    }

    setOpnameItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isSubmitting: true } : item
      )
    );

    const submissionData = {
      kode_toko: selectedStore.kode_toko,
      nama_toko: selectedStore.nama_toko,
      alamat: selectedStore.alamat || "",
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
      is_il: itemToSubmit.is_il,
    };

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
              className="btn btn-back"
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
              setSelectedUlok(e.target.value);
              setSelectedLingkup(null);
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

  return (
    <div
      style={{
        paddingTop: "20px",
        width: "100%",
        maxWidth: "100%",
        margin: "0",
        paddingLeft: "0",
        paddingRight: "0",
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
            className="btn btn-back"
            style={{ padding: "8px 16px" }}
          >
            Kembali
          </button>
          <h2 style={{ color: "var(--alfamart-red)" }}>Input Opname Harian</h2>
        </div>

        <h3 style={{ color: "var(--alfamart-red)", marginBottom: "16px" }}>
          Detail Pekerjaan (No. ULOK: {selectedUlok})
        </h3>
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
                      if (ST === "REJECTED") return "#ffe5e5";
                      if (item.is_il) return "#fff9c4";
                      if (item.isSubmitted) return "#f0fff0";
                      return "transparent";
                    })(),
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  <td style={{ padding: "12px" }}>{item.kategori_pekerjaan}</td>
                  <td style={{ padding: "12px" }}>{item.jenis_pekerjaan}</td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.vol_rab}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.satuan}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {formatRupiah(item.harga_material)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    {formatRupiah(item.harga_upah)}
                  </td>
                  <td style={{ padding: "8px", textAlign: "center" }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: "100px" }}
                      value={item.volume_akhir}
                      onChange={(e) =>
                        handleVolumeAkhirChange(item.id, e.target.value)
                      }
                      placeholder="0"
                      disabled={item.isSubmitted}
                      step="any"
                    />
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {(() => {
                      const hasInput =
                        item.isSubmitted ||
                        (item.volume_akhir !== "" &&
                          item.volume_akhir !== null &&
                          item.volume_akhir !== undefined);

                      if (!hasInput) return <span>-</span>;
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
                                        isSubmitted: false,
                                        approval_status: "Pending",
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

        <div style={{ marginTop: "20px", marginBottom: "0px" }}>
          <a
            href="https://instruksi-lapangan.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              width: "100%",
              backgroundColor: "#FFC107",
              fontWeight: "bold",
              color: "#000",
              textDecoration: "none",
              display: "block",
              textAlign: "center",
              padding: "12px",
              borderRadius: "8px",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            INSTRUKSI LAPANGAN
          </a>
        </div>

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

        {/* --- PENAMBAHAN BARU: Tombol Opname Final --- */}
        <div style={{ marginTop: "20px" }}>
          <button
            onClick={handleOpnameFinal}
            disabled={!canFinalize || isFinalized || isLocking}
            style={{
              width: "100%",
              padding: "14px",
              backgroundColor: isFinalized
                ? "#28a745" // Hijau jika sudah finalized
                : canFinalize
                ? "#007bff" // Biru jika siap diklik
                : "#6c757d", // Abu-abu jika disabled/pending
              color: "white",
              fontSize: "1.1rem",
              fontWeight: "bold",
              borderRadius: "8px",
              border: "none",
              cursor:
                !canFinalize || isFinalized || isLocking
                  ? "not-allowed"
                  : "pointer",
              transition: "background-color 0.3s",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
          >
            {isLocking
              ? "Memproses..."
              : isFinalized
              ? "Opname Selesai (Final)"
              : canFinalize
              ? "Opname Final"
              : "Menunggu Approval Semua Item"}
          </button>
          {!canFinalize && !isFinalized && (
            <p
              style={{
                textAlign: "center",
                color: "#dc3545",
                fontSize: "0.85rem",
                marginTop: "8px",
              }}
            >
              *Pastikan semua pekerjaan berstatus APPROVED untuk melakukan Opname
              Final.
            </p>
          )}
        </div>
        {/* --------------------------------------------- */}
      </div>
    </div>
  );
};

export default OpnameForm;