"use client";

import { useState, useEffect } from "react";
import { generateFinalOpnamePDF } from "../utils/pdfGenerator";
import LingkupSelection from "./LingkupSelection";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const FinalOpnameView = ({ onBack, selectedStore }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [uloks, setUloks] = useState([]);
  const [selectedUlok, setSelectedUlok] = useState(null);
  const [selectedLingkup, setSelectedLingkup] = useState(null);

  // 1) Ambil daftar ULOK
  useEffect(() => {
    if (selectedStore?.kode_toko) {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/uloks?kode_toko=${selectedStore.kode_toko}`)
        .then((res) => res.json())
        .then((data) => {
          setUloks(data || []);
          if (Array.isArray(data) && data.length === 1) {
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

  // 2) Ambil final (Approved) setelah toko+ulok+lingkup terpilih
  useEffect(() => {
    if (selectedStore?.kode_toko && selectedUlok && selectedLingkup) {
      setLoading(true);
      fetch(
        `${API_BASE_URL}/api/opname/final?kode_toko=${selectedStore.kode_toko}&no_ulok=${selectedUlok}&lingkup=${selectedLingkup}`
      )
        .then((res) => res.json())
        .then((data) => {
          setSubmissions(data || []);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Gagal mengambil data opname final:", err);
          setLoading(false);
        });
    }
  }, [selectedStore, selectedUlok, selectedLingkup]);

  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      await generateFinalOpnamePDF(submissions, selectedStore, selectedUlok);
    } catch (error) {
      console.error("Gagal membuat PDF:", error);
      alert("Terjadi kesalahan saat membuat PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  // STYLE KHUSUS UNTUK TOMBOL KEMBALI MERAH
  // Kita definisikan di sini agar bisa dipakai di return manapun
  const redButtonStyle = (
    <style jsx>{`
      .btn-back-red {
        background-color: white;
        border: 1px solid #dc2626; /* Merah Alfamart */
        color: #dc2626;
        padding: 8px 16px;
        font-weight: 600;
        transition: all 0.2s;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
      }
      .btn-back-red:hover {
        background-color: #dc2626;
        color: white;
        transform: translateY(-1px);
        box-shadow: 0 4px 6px rgba(220, 38, 38, 0.2);
      }
    `}</style>
  );

  // ============== RENDER ==============

  if (loading) {
    return (
      <div
        className="container"
        style={{ paddingTop: "20px", textAlign: "center" }}
      >
        <h3>Loading data opname...</h3>
      </div>
    );
  }

  // Step: pilih ULOK
  if (uloks.length > 0 && !selectedUlok) {
    return (
      <div className="container" style={{ paddingTop: "20px" }}>
        {redButtonStyle}
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "24px",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {/* BUTTON DIGANTI CLASS-NYA */}
            <button
              type="button"
              onClick={onBack}
              className="btn-back-red"
            >
              ← Kembali
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

  // Step: pilih LINGKUP
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

  // Step: tampilan FINAL
  return (
    <div className="container" style={{ paddingTop: "20px" }}>
      {redButtonStyle}
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* BUTTON DIGANTI CLASS-NYA */}
            <button
              onClick={onBack}
              className="btn-back-red"
            >
              ← Kembali
            </button>
            <h2 style={{ color: "var(--alfamart-red)", margin: 0 }}>
              Riwayat Opname Final - {selectedStore.kode_toko} (No. ULOK:{" "}
              {selectedUlok} • Lingkup: {selectedLingkup})
            </h2>
          </div>
          {submissions.length > 0 && (
            <button
              onClick={handleDownloadPDF}
              className="btn btn-primary"
              disabled={isGenerating}
            >
              {isGenerating ? "Membuat PDF..." : "Download PDF"}
            </button>
          )}
        </div>

        {submissions.length === 0 ? (
          <p>Belum ada data opname yang di-approve untuk pilihan ini.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#e9ecef" }}>
                  <th style={{ padding: "12px" }}>Kategori</th>
                  <th style={{ padding: "12px" }}>Jenis Pekerjaan</th>
                  <th style={{ padding: "12px", textAlign: "center" }}>
                    Volume Akhir
                  </th>
                  <th style={{ padding: "12px", textAlign: "center" }}>
                    Status
                  </th>
                  <th style={{ padding: "12px" }}>Tanggal Submit</th>
                  <th style={{ padding: "12px" }}>PIC</th>
                  <th style={{ padding: "12px" }}>Kontraktor</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((item, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "12px" }}>
                      {item.kategori_pekerjaan}
                    </td>
                    <td style={{ padding: "12px" }}>{item.jenis_pekerjaan}</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      {item.volume_akhir} {item.satuan}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "12px",
                          background: "#28a745",
                          color: "white",
                          fontSize: "12px",
                        }}
                      >
                        {item.approval_status}
                      </span>
                    </td>
                    <td style={{ padding: "12px" }}>{item.tanggal_submit}</td>
                    <td style={{ padding: "12px" }}>{item.pic_name || "-"}</td>
                    <td style={{ padding: "12px" }}>
                      {item.kontraktor_username ||
                        item.display_kontraktor ||
                        item.kontraktor_name ||
                        "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinalOpnameView;