"use client";

import { createContext, useContext, useState, useEffect } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user data exists in localStorage on component mount
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        console.error("Error parsing saved user data:", error);
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

const login = async (username, password) => {
  try {
    // ✅ Ambil waktu lokal WIB
    const now = new Date();
    const wibTime = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" })
    );
    const hour = wibTime.getHours();

    // ✅ Batasi jam operasional 06:00 - 18:00 WIB
    if (hour < 6 || hour >= 15) {
      const currentTime = wibTime.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        success: false,
        message: `Sesi Anda telah berakhir.\nLogin hanya dapat dilakukan pada jam operasional 06.00–18.00 WIB.\nSekarang pukul ${currentTime} WIB.`,
      };
    }

    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const userData = await response.json();

    if (!response.ok) {
      throw new Error(userData.message || "Login failed");
    }

    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    return { success: true, user: userData };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: error.message };
  }
};


  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  const value = {
    user,
    login,
    logout,
    loading,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
  