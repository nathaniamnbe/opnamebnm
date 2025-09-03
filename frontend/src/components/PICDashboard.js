"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import StoreNavigationWrapper from "./StoreNavigationWrapper";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const PICDashboard = () => {
  const { user } = useAuth();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState(null);
  const [showUlokSelection, setShowUlokSelection] = useState(false);
  const [showOpnameForm, setShowOpnameForm] = useState(false);

  useEffect(() => {
    if (user?.username) {
      fetch(`${API_BASE_URL}/api/toko?username=${user.username}`)
        .then((res) => res.json())
        .then((data) => {
          setStores(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Gagal mengambil daftar toko:", err);
          setLoading(false);
        });
    }
  }, [user]);

  // Handler ketika toko diklik
  const handleStoreClick = (store) => {
    setSelectedStore(store);

    // Jika toko hanya punya 1 no_ulok, langsung ambil dan lanjut ke form opname
    if (store.ulok_count === 1) {
      // Ambil data ulok untuk toko ini
      fetch(
        `${API_BASE_URL}/api/ulok-options?kode_toko=${store.kode_toko}&username=${user.username}`
      )
        .then((res) => res.json())
        .then((ulokOptions) => {
          if (ulokOptions.length > 0) {
            // Langsung set ulok dan lanjut ke form opname
            const storeWithUlok = {
              ...store,
              no_ulok: ulokOptions[0].no_ulok,
              link_pdf: ulokOptions[0].link_pdf,
            };
            setSelectedStore(storeWithUlok);
            setShowOpnameForm(true);
          }
        })
        .catch((err) => {
          console.error("Gagal mengambil ulok options:", err);
          alert("Gagal memuat data ulok");
        });
    } else {
      // Jika lebih dari 1 ulok, tampilkan pilihan ulok
      setShowUlokSelection(true);
    }
  };

  // Handler ketika ulok dipilih
  const handleUlokSelected = (storeWithUlok) => {
    setSelectedStore(storeWithUlok);
    setShowUlokSelection(false);
    setShowOpnameForm(true);
  };

  // Handler kembali ke daftar toko
  const handleBackToStores = () => {
    setSelectedStore(null);
    setShowUlokSelection(false);
    setShowOpnameForm(false);
  };

  // Handler kembali ke pilihan ulok
  const handleBackToUlok = () => {
    setShowOpnameForm(false);
    setShowUlokSelection(true);
    // Reset no_ulok dari selectedStore
    if (selectedStore) {
      const { no_ulok, link_pdf, ...storeWithoutUlok } = selectedStore;
      setSelectedStore(storeWithoutUlok);
    }
  };

  if (loading) {
    return (
      <div
        className="container"
        style={{ paddingTop: "20px", textAlign: "center" }}
      >
        <h3>Memuat daftar toko...</h3>
      </div>
    );
  }

  return (
    <div>
      {/* Header Dashboard */}
      <div className="container" style={{ paddingTop: "20px" }}>
        <div className="card" style={{ marginBottom: "20px" }}>
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--alfamart-red)",
              color: "white",
              borderRadius: "8px",
            }}
          >
            <h1 style={{ margin: "0", fontSize: "24px" }}>
              Dashboard PIC - {user?.name}
            </h1>
            <p style={{ margin: "8px 0 0 0", opacity: 0.9 }}>
              Kelola opname harian untuk toko yang di-assign kepada Anda
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Wrapper */}
      <StoreNavigationWrapper
        stores={stores}
        onStoreClick={handleStoreClick}
        selectedStore={selectedStore}
        showUlokSelection={showUlokSelection}
        showOpnameForm={showOpnameForm}
        onBackToStores={handleBackToStores}
        onBackToUlok={handleBackToUlok}
        onUlokSelected={handleUlokSelected}
      />

      {/* Footer Info */}
      {!showUlokSelection && !showOpnameForm && stores.length > 0 && (
        <div className="container" style={{ paddingTop: "20px" }}>
          <div className="card">
            <div
              style={{
                padding: "16px",
                backgroundColor: "#e8f5e8",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: "0", color: "#2e7d32", fontSize: "14px" }}>
                📊 Total: <strong>{stores.length}</strong> toko | 📋 Total:{" "}
                <strong>
                  {stores.reduce(
                    (sum, store) => sum + (store.ulok_count || 0),
                    0
                  )}
                </strong>{" "}
                No. Ulok
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PICDashboard;
