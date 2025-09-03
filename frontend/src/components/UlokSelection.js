"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const UlokSelection = ({ onBack, selectedStore, onUlokSelected }) => {
  const { user } = useAuth();
  const [ulokOptions, setUlokOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedStore?.kode_toko && user?.username) {
      setLoading(true);
      setError(null);

      // Tentukan endpoint berdasarkan role user
      const endpoint =
        user.role === "pic"
          ? // Ubah URL
            `${API_BASE_URL}/api/ulok-options?kode_toko=${selectedStore.kode_toko}&username=${user.username}`
          : // Ubah URL (PERHATIAN: ENDPOINT INI TIDAK ADA DI BACKEND ANDA)
            `${API_BASE_URL}/api/ulok-options-kontraktor?kode_toko=${selectedStore.kode_toko}&username=${user.username}`;
            
      fetch(endpoint)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setUlokOptions(data);
          } else {
            setError("Format data tidak valid");
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Gagal mengambil opsi no_ulok:", err);
          setError("Gagal memuat data no_ulok");
          setLoading(false);
        });
    }
  }, [selectedStore, user]);

  const handleUlokClick = (ulokData) => {
    onUlokSelected({
      ...selectedStore,
      no_ulok: ulokData.no_ulok,
      link_pdf: ulokData.link_pdf,
    });
  };

  if (loading) {
    return (
      <div
        className="container"
        style={{ paddingTop: "20px", textAlign: "center" }}
      >
        <h3>Memuat daftar No. Ulok...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: "20px" }}>
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "24px",
              gap: "16px",
            }}
          >
            <button
              type="button"
              onClick={onBack}
              className="btn btn-outline"
              style={{ padding: "8px 16px" }}
            >
              ← Kembali
            </button>
            <h2 style={{ color: "var(--alfamart-red)" }}>Error</h2>
          </div>
          <div className="alert alert-error">
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{ paddingTop: "20px", maxWidth: "800px" }}
    >
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
          <button
            type="button"
            onClick={onBack}
            className="btn btn-outline"
            style={{ padding: "8px 16px" }}
          >
            ← Kembali
          </button>
          <h2 style={{ color: "var(--alfamart-red)" }}>Pilih No. Ulok</h2>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <h3 style={{ color: "var(--alfamart-red)", marginBottom: "8px" }}>
            {selectedStore.nama_toko}
          </h3>
          <p style={{ color: "#666", fontSize: "14px" }}>
            Kode Toko: <strong>{selectedStore.kode_toko}</strong>
          </p>
        </div>

        {ulokOptions.length === 0 ? (
          <div className="alert alert-warning">
            <p>Tidak ada No. Ulok yang tersedia untuk toko ini.</p>
          </div>
        ) : (
          <div>
            <h4 style={{ marginBottom: "16px", color: "#333" }}>
              Pilih No. Ulok untuk melanjutkan:
            </h4>
            <div style={{ display: "grid", gap: "12px" }}>
              {ulokOptions.map((ulokData, index) => (
                <div
                  key={index}
                  className="card"
                  style={{
                    padding: "16px",
                    cursor: "pointer",
                    border: "2px solid #e0e0e0",
                    borderRadius: "8px",
                    transition: "all 0.2s ease",
                    backgroundColor: "#fff",
                  }}
                  onClick={() => handleUlokClick(ulokData)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--alfamart-red)";
                    e.currentTarget.style.backgroundColor = "#fff5f5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e0e0e0";
                    e.currentTarget.style.backgroundColor = "#fff";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h4
                        style={{
                          margin: "0 0 8px 0",
                          color: "var(--alfamart-red)",
                          fontSize: "18px",
                        }}
                      >
                        No. Ulok: {ulokData.no_ulok}
                      </h4>
                      <p
                        style={{
                          margin: "0",
                          color: "#666",
                          fontSize: "14px",
                        }}
                      >
                        Nama Toko: {ulokData.nama_toko}
                      </p>
                      {ulokData.link_pdf && (
                        <p
                          style={{
                            margin: "4px 0 0 0",
                            color: "#666",
                            fontSize: "12px",
                          }}
                        >
                          📄 PDF tersedia
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "var(--alfamart-red)",
                        color: "white",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      Pilih
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ulokOptions.length > 0 && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              fontSize: "14px",
              color: "#666",
            }}
          >
            <p style={{ margin: "0" }}>
              💡 <strong>Petunjuk:</strong> Klik pada salah satu No. Ulok di
              atas untuk melanjutkan ke form input opname.
              {ulokOptions.some((ulok) => ulok.link_pdf) &&
                " Beberapa ulok memiliki file PDF yang dapat Anda referensikan."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UlokSelection;
