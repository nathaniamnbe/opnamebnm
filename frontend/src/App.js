"use client";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import "./styles/theme.css";

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--gray-100)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "48px",
              marginBottom: "16px",
              color: "var(--alfamart-red)",
            }}
          >
            🏪
          </div>
          <h2 style={{ color: "var(--alfamart-red)" }}>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--gray-100)" }}>
      <Header />
      <Dashboard />
    </div>
  );
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('auth') === 'true') {
    const role = urlParams.get('role');
    const email = urlParams.get('email');
    const cabang = urlParams.get('cabang');
    sessionStorage.setItem('authenticated', 'true');
    sessionStorage.setItem('userRole', role);
    sessionStorage.setItem('loggedInUserEmail', email);
    sessionStorage.setItem('loggedInUserCabang', cabang);
    window.history.replaceState({}, document.title, "/");
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
