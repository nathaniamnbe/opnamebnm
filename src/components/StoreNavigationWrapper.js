"use client";

import { useState } from "react";
import UlokSelection from "./UlokSelection";
import OpnameForm from "./OpnameForm";

// Komponen ini menangani alur navigasi: Daftar Toko -> Pilih Ulok -> Form Opname
const StoreNavigationWrapper = ({
  stores,
  onStoreClick,
  selectedStore,
  showUlokSelection,
  showOpnameForm,
  onBackToStores,
  onBackToUlok,
  onUlokSelected,
}) => {
  // Jika sedang menampilkan form opname
  if (showOpnameForm && selectedStore && selectedStore.no_ulok) {
    return <OpnameForm selectedStore={selectedStore} onBack={onBackToUlok} />;
  }

  // Jika sedang menampilkan pilihan ulok
  if (showUlokSelection && selectedStore) {
    return (
      <UlokSelection
        selectedStore={selectedStore}
        onBack={onBackToStores}
        onUlokSelected={onUlokSelected}
      />
    );
  }

  // Default: Tampilkan daftar toko (dengan informasi ulok count)
  return (
    <div className="container" style={{ paddingTop: "20px" }}>
      <div className="card">
        <h2 style={{ color: "var(--alfamart-red)", marginBottom: "20px" }}>
          Daftar Toko Assigned
        </h2>

        {stores.length === 0 ? (
          <div className="alert alert-warning">
            <p>Tidak ada toko yang di-assign untuk Anda.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {stores.map((store, index) => (
              <div
                key={index}
                className="card"
                style={{
                  padding: "20px",
                  cursor: "pointer",
                  border: "2px solid #e0e0e0",
                  borderRadius: "12px",
                  transition: "all 0.3s ease",
                  backgroundColor: "#fff",
                }}
                onClick={() => onStoreClick(store)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--alfamart-red)";
                  e.currentTarget.style.backgroundColor = "#fff5f5";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 12px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#e0e0e0";
                  e.currentTarget.style.backgroundColor = "#fff";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: "0 0 8px 0",
                        color: "var(--alfamart-red)",
                        fontSize: "20px",
                      }}
                    >
                      {store.nama_toko}
                    </h3>
                    <p
                      style={{
                        margin: "0 0 8px 0",
                        color: "#666",
                        fontSize: "16px",
                      }}
                    >
                      Kode Toko: <strong>{store.kode_toko}</strong>
                    </p>

                    {/* Menampilkan informasi jumlah no_ulok */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "8px",
                      }}
                    >
                      <span
                        style={{
                          padding: "4px 8px",
                          backgroundColor: "#e3f2fd",
                          color: "#1976d2",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "500",
                        }}
                      >
                        📋 {store.ulok_count || 0} No. Ulok
                      </span>

                      {store.ulok_count > 1 && (
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#666",
                            fontStyle: "italic",
                          }}
                        >
                          (Klik untuk memilih)
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 20px",
                      backgroundColor: "var(--alfamart-red)",
                      color: "white",
                      borderRadius: "8px",
                      fontSize: "16px",
                      fontWeight: "600",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {store.ulok_count > 1 ? "Pilih Ulok" : "Mulai Opname"}
                    <span style={{ fontSize: "12px" }}>→</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {stores.length > 0 && (
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
              💡 <strong>Petunjuk:</strong>
              {stores.some((s) => s.ulok_count > 1)
                ? " Beberapa toko memiliki lebih dari satu No. Ulok. Klik pada toko untuk memilih No. Ulok yang akan dikerjakan."
                : " Klik pada toko untuk memulai input opname harian."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreNavigationWrapper;
