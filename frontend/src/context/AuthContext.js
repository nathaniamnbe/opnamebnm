"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";
const AuthContext = createContext();

// ⏰ Batas idle (1 jam)
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // timer untuk idle logout (disimpan di ref supaya tidak berubah-ubah)
  const idleTimerRef = useRef(null);

  // — util: mulai/ulang timer idle
  const startIdleTimer = () => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // waktu habis => logout
      logout(true);
    }, INACTIVITY_LIMIT_MS);
  };

  // — util: handler setiap ada aktivitas user
  const onUserActivity = () => {
    // reset timer hanya jika sudah login
    if (user) startIdleTimer();
  };

  useEffect(() => {
    // migrasi: pastikan auto-login lama tidak nyangkut
    try {
      localStorage.removeItem("user");
    } catch {}
    // per-tab session
    const savedUser = sessionStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        sessionStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  // Pas user sudah login → pasang listener aktivitas & timer idle
  useEffect(() => {
    // daftar event yang dianggap “aktivitas”
    const events = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
      "wheel",
      "visibilitychange",
    ];

    if (user) {
      // mulai timer pertama kali
      startIdleTimer();
      // pasang listeners
      events.forEach((evt) =>
        window.addEventListener(evt, onUserActivity, { passive: true })
      );
    }

    // cleanup saat logout / unmount
    return () => {
      clearTimeout(idleTimerRef.current);
      events.forEach((evt) => window.removeEventListener(evt, onUserActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // hanya bereaksi saat status login berubah

  const login = async (username, password) => {
    try {
      const now = new Date();
      const wibTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
      );
      const hour = wibTime.getHours();
      if (hour < 6 || hour >= 24) {
        const currentTime = wibTime.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          success: false,
          message: `Sesi Anda telah berakhir.\nLogin hanya 06.00–18.00 WIB.\nSekarang pukul ${currentTime} WIB.`,
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
      sessionStorage.setItem("user", JSON.stringify(userData));
      try {
        localStorage.removeItem("user");
      } catch {}

      // mulai timer idle segera setelah login
      startIdleTimer();

      return { success: true, user: userData };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: error.message };
    }
  };

  // isAuto param dipakai agar bisa kasih pesan berbeda kalau mau
  const logout = (isAuto = false) => {
    setUser(null);
    try {
      sessionStorage.removeItem("user");
    } catch {}
    try {
      localStorage.removeItem("user");
    } catch {}
    clearTimeout(idleTimerRef.current);

    // (opsional) beri notifikasi sederhana
    if (isAuto) {
      // Hindari alert jika tidak diinginkan—boleh diganti toast/Modal
      // alert("Sesi berakhir karena tidak ada aktivitas selama 1 jam.");
      console.log("Auto-logout by inactivity.");
    }
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
