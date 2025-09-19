// src/components/ApprovalPage.js

"use client";

import { useState, useEffect } from "react";
import LingkupSelection from "./LingkupSelection"; // ← step baru: pilih ME/SIPIL
import { useAuth } from "../context/AuthContext";


const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const ApprovalPage = ({ onBack, selectedStore }) => {
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const { user } = useAuth();
  const [notes, setNotes] = useState({});
  // Step 1: pilih ULOK
  const [uloks, setUloks] = useState([]);
  const [selectedUlok, setSelectedUlok] = useState(null);

  // Step 2: pilih LINGKUP
  const [selectedLingkup, setSelectedLingkup] = useState(null);

  // --- Ambil daftar ULOK berdasarkan toko terpilih ---
  useEffect(() => {
    if (selectedStore?.kode_toko) {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/uloks?kode_toko=${selectedStore.kode_toko}`)
        .then((res) => res.json())
        .then((data) => {
          setUloks(data || []);
          if (Array.isArray(data) && data.length === 1) {
            setSelectedUlok(data[0]); // auto pilih jika cuma 1
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Gagal mengambil daftar no_ulok:", err);
          setLoading(false);
        });
    }
  }, [selectedStore]);

  // --- Ambil data pending setelah toko + ulok + lingkup siap ---
  const fetchPendingItems = () => {
    if (!selectedStore?.kode_toko || !selectedUlok || !selectedLingkup) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const url =
      `${API_BASE_URL}/api/opname/pending?kode_toko=${selectedStore.kode_toko}` +
      `&no_ulok=${selectedUlok}&lingkup=${selectedLingkup}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setPendingItems(data || []);
        // ⬇️ Inisialisasi catatan kosong per item
        const initial = {};
        (data || []).forEach((it) => {
          if (it.item_id) initial[it.item_id] = "";
        });
        setNotes(initial);

        setLoading(false);
      })
      .catch((err) => {
        console.error("Gagal mengambil data pending:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPendingItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, selectedUlok, selectedLingkup]);

  // --- Approve satu item ---
  const handleApprove = async (itemId) => {
    setMessage("");
    const original = [...pendingItems];
    setPendingItems((prev) => prev.filter((it) => it.item_id !== itemId));

    try {
      const response = await fetch(`${API_BASE_URL}/api/opname/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          kontraktor_username:
            user?.email || user?.username || user?.name || "",
          catatan: notes[itemId] || "", // ⬅️ kirim catatan
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Gagal approve");
      setMessage("Berhasil di-approve!");
      setTimeout(() => setMessage(""), 2500);
      setNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      setPendingItems(original); // rollback
    }
  };

  // --- Reject satu item ---
  const handleReject = async (itemId) => {
    setMessage("");
    const original = [...pendingItems];
    setPendingItems((prev) => prev.filter((it) => it.item_id !== itemId));

    try {
      const response = await fetch(`${API_BASE_URL}/api/opname/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          kontraktor_username:
            user?.email || user?.username || user?.name || "",
          catatan: notes[itemId] || "", // ⬅️ kirim catatan
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Gagal reject");
      setMessage("Berhasil di-reject!");
      setTimeout(() => setMessage(""), 2500);
      setNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (error) {
      setMessage(`Error: ${error.message}`);
      setPendingItems(original); // rollback
    }
  };

  // ================== RENDER FLOW ==================

  // Loading awal
  if (loading && !selectedUlok) {
    return (
      <div className="container" style={{ textAlign: "center" }}>
        <h3>Loading...</h3>
      </div>
    );
  }

  // Step: pilih ULOK
  if (uloks.length > 0 && !selectedUlok) {
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
            <button onClick={onBack} className="btn btn-outline">
              ← Kembali
            </button>
            <h2 style={{ color: "var(--alfamart-red)" }}>Pilih No. ULOK</h2>
          </div>

          <select
            className="form-select"
            value={selectedUlok || ""}
            onChange={(e) => {
              setSelectedUlok(e.target.value);
              setSelectedLingkup(null); // reset lingkup bila ganti ULOK
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

  // Step: daftar pending untuk APPROVAL
  // Step: daftar pending untuk APPROVAL
  return (
    <div
      // ⬇️ JANGAN pakai class "container" supaya tidak kena max-width global
      style={{
        paddingTop: 20,
        paddingLeft: 16,
        paddingRight: 16,
        width: "100vw",
        maxWidth: "100vw",
        margin: 0,
        boxSizing: "border-box",
      }}
    >
      <div
        // ⬇️ JANGAN pakai class "card" juga; bikin card sendiri biar 100%
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: 0,
          borderRadius: 12,
          background: "#fff",
          boxShadow: "0 2px 10px rgba(0,0,0,.06)",
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 24,
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <button onClick={onBack} className="btn btn-outline">
            ← Kembali
          </button>
          <h2 style={{ color: "var(--alfamart-red)" }}>
            Persetujuan Opname — {selectedStore.kode_toko} (ULOK: {selectedUlok}{" "}
            • Lingkup: {selectedLingkup})
          </h2>
        </div>

        {message && (
          <div
            className={`alert ${
              message.startsWith("Error") ? "alert-error" : "alert-success"
            }`}
          >
            {message}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              tableLayout: "fixed", // kolom stabil saat full width
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f2f2f2" }}>
                <th style={{ padding: "12px", minWidth: "140px" }}>Kategori</th>
                <th style={{ padding: "12px" }}>Jenis Pekerjaan</th>
                <th style={{ padding: "12px", textAlign: "center" }}>
                  Volume Akhir
                </th>
                <th style={{ padding: "12px", textAlign: "center" }}>Foto</th>
                <th style={{ padding: "12px" }}>PIC</th>
                <th style={{ padding: "12px" }}>Waktu Submit</th>
                {/* ⬇️ Tambah ini */}
                <th style={{ padding: "12px", minWidth: 220 }}>Catatan</th>
                <th style={{ padding: "12px", textAlign: "center" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((item) => (
                <tr
                  key={item.item_id || Math.random()}
                  style={{ borderBottom: "1px solid #ddd" }}
                >
                  <td style={{ padding: "12px" }}>{item.kategori_pekerjaan}</td>
                  <td style={{ padding: "12px" }}>{item.jenis_pekerjaan}</td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.volume_akhir} {item.satuan || ""}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.foto_url ? (
                      <a
                        href={item.foto_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Lihat Foto
                      </a>
                    ) : (
                      <span style={{ color: "#999" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px" }}>{item.name}</td>
                  <td style={{ padding: "12px" }}>{item.tanggal_submit}</td>
                  {/* ⬇️ Tambahkan ini sebelum kolom Aksi */}
                  <td style={{ padding: "12px" }}>
                    <textarea
                      value={notes[item.item_id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [item.item_id]: e.target.value,
                        }))
                      }
                      placeholder="Tambahkan catatan (opsional)…"
                      rows={2}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: "10px",
                      }}
                    >
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleApprove(item.item_id)}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-error btn-sm"
                        onClick={() => handleReject(item.item_id)}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pendingItems.length === 0 && !loading && (
            <p style={{ textAlign: "center", padding: 20 }}>
              Tidak ada opname yang menunggu persetujuan untuk pilihan ini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovalPage;
