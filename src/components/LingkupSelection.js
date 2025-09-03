"use client";

import { useEffect, useState } from "react";

const LingkupSelection = ({
  kodeToko,
  noUlok,
  onSelect = () => {},
  onCancel = () => {},
}) => {
  const [loading, setLoading] = useState(true);
  const [opsi, setOpsi] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLingkup = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/lingkups?kode_toko=${encodeURIComponent(
            kodeToko ?? ""
          )}&no_ulok=${encodeURIComponent(noUlok ?? "")}`
        );
        if (!res.ok) throw new Error("Gagal memuat lingkup");

        const data = await res.json();

        // Normalisasi -> paksa ke array unik berisi string uppercase
        let list = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.lingkup)) {
          list = data.lingkup;
        } else if (data && Array.isArray(data.opsi)) {
          list = data.opsi;
        } else if (data && typeof data === "object") {
          // Ambil semua value yang string/array dari object
          list = Object.values(data)
            .flatMap((v) => (Array.isArray(v) ? v : [v]))
            .filter((v) => typeof v === "string" && v.trim() !== "");
        } else if (typeof data === "string" && data.trim() !== "") {
          list = [data];
        }

        // Uppercase + unique + filter value aneh
        list = [...new Set(list.map((s) => String(s).toUpperCase()))].filter(
          (s) => s === "ME" || s === "SIPIL" || s.length > 0
        );

        setOpsi(list);
      } catch (err) {
        setError(err?.message || "Terjadi kesalahan saat memuat lingkup");
        setOpsi([]);
      } finally {
        setLoading(false);
      }
    };

    if (kodeToko && noUlok) {
      fetchLingkup();
    } else {
      setOpsi([]);
      setLoading(false);
    }
  }, [kodeToko, noUlok]);

  if (loading) return <div className="card p-3">Memuat lingkup...</div>;

  if (error)
    return (
      <div className="card p-3">
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={onCancel} className="btn">
          Kembali
        </button>
      </div>
    );

  if (!opsi || opsi.length === 0) {
    return (
      <div className="card p-3">
        <p>Tidak ada lingkup terdeteksi untuk No. ULOK ini.</p>
        <button onClick={onCancel} className="btn">
          Kembali
        </button>
      </div>
    );
  }

  // Jika hanya ada 1 lingkup, tawarkan langsung
  if (opsi.length === 1) {
    return (
      <div className="card p-3">
        <p>
          Lingkup terdeteksi: <b>{opsi[0]}</b>
        </p>
        <button className="btn btn-primary" onClick={() => onSelect(opsi[0])}>
          Lanjut
        </button>
        <button className="btn" onClick={onCancel} style={{ marginLeft: 8 }}>
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="card p-3">
      <h3>Pilih Lingkup Pekerjaan</h3>
      <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
        {opsi.map((lk) => (
          <button
            key={lk}
            onClick={() => onSelect(lk)}
            className="btn btn-primary"
          >
            {lk}
          </button>
        ))}
      </div>
      <button className="btn" onClick={onCancel} style={{ marginTop: 12 }}>
        Kembali
      </button>
    </div>
  );
};

export default LingkupSelection;
