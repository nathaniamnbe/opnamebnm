"use client";

import { createContext, useContext, useState, useEffect } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🔁 Migrasi: pastikan tidak ada sisa auto-login dari localStorage
    try {
      localStorage.removeItem("user");
    } catch (_) {}

    // ✅ Per-tab session: baca dari sessionStorage
    const savedUser = sessionStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        console.error("Error parsing saved user data:", err);
        sessionStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    try {
      // (opsional) validasi jam operasional tetap ada
      const now = new Date();
      const wibTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );
      const hour = wibTime.getHours();
      if (hour < 6 || hour >= 18) {
        const currentTime = wibTime.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          success: false,
          message: `Sesi Anda telah berakhir.\nLogin hanya dapat dilakukan pada jam operasional 06.00–18.00 WIB.\nSekarang pukul ${currentTime} WIB.`,
        };
      }

      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const userData = await res.json();
      if (!res.ok) throw new Error(userData.message || "Login failed");

      setUser(userData);

      // ✅ Simpan ke sessionStorage agar hilang saat tab ditutup
      sessionStorage.setItem("user", JSON.stringify(userData));

      // 🔁 Pastikan localStorage tidak dipakai lagi
      try {
        localStorage.removeItem("user");
      } catch (_) {}

      return { success: true, user: userData };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    // ✅ Bersihkan dua-duanya
    try {
      sessionStorage.removeItem("user");
    } catch (_) {}
    try {
      localStorage.removeItem("user");
    } catch (_) {}
  };

  const value = { user, login, logout, loading, isAuthenticated: !!user };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

export default AuthContext;
