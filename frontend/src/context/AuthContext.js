"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/** KONFIG */
const STORAGE_KEY = "AUTH_SESSION";
const DEFAULT_TTL_MINUTES = 60; // masa berlaku session
const IDLE_TIMEOUT_MINUTES = 30; // auto-logout kalau idle

const AuthCtx = createContext(null);

function now() {
  return Date.now();
}
function minutes(n) {
  return n * 60 * 1000;
}

/** Util simpan/baca session dgn expiry */
function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.exp || now() > obj.exp) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

function writeSession(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // idle timer
  const idleTimerRef = useRef(null);
  const lastActiveRef = useRef(now());

  /** Restart idle timer setiap ada aktivitas */
  const bumpActivity = () => {
    lastActiveRef.current = now();
    // perbarui session.lastActive juga agar sinkron antar tab
    const s = readSession();
    if (s) {
      s.lastActive = lastActiveRef.current;
      writeSession(s);
    }
    startIdleTimer();
  };

  const startIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      // cek idle
      const idleMs = now() - lastActiveRef.current;
      if (idleMs >= minutes(IDLE_TIMEOUT_MINUTES)) {
        logout("Sesi berakhir karena tidak ada aktivitas.");
      } else {
        startIdleTimer(); // safety loop
      }
    }, minutes(IDLE_TIMEOUT_MINUTES));
  };

  /** LOGIN: panggil ini setelah server mengembalikan user+token */
  const login = (nextUser, nextToken, ttlMinutes = DEFAULT_TTL_MINUTES) => {
    const session = {
      user: nextUser,
      token: nextToken,
      exp: now() + minutes(ttlMinutes),
      lastActive: now(),
    };
    writeSession(session);
    setUser(nextUser);
    setToken(nextToken);
    lastActiveRef.current = session.lastActive;
    startIdleTimer();
  };

  /** LOGOUT */
  const logout = (reason) => {
    clearSession();
    setUser(null);
    setToken(null);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    // optional: tampilkan toast/modal reason di sini
    // mis. console.warn(reason);
  };

  /** Init: load session kalau masih valid */
  useEffect(() => {
    const s = readSession();
    if (s?.user && s?.token) {
      setUser(s.user);
      setToken(s.token);
      lastActiveRef.current = s.lastActive || now();
      startIdleTimer();
    }
    setLoading(false);

    // Dengarkan aktivitas user → reset idle
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, bumpActivity));

    // Sinkron antar tab (kalau logout di tab lain)
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const cur = readSession();
        if (!cur) {
          // di-tab ini logout juga
          setUser(null);
          setToken(null);
        } else {
          // perbarui data jika berbeda
          setUser(cur.user);
          setToken(cur.token);
          lastActiveRef.current = cur.lastActive || now();
          startIdleTimer();
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bumpActivity));
      window.removeEventListener("storage", onStorage);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const value = { user, token, loading, login, logout };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
