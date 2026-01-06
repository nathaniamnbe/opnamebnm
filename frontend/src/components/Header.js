"use client";
import { useAuth } from "../context/AuthContext";
import alfaLogo from "../images/Alfamart-Emblem.png";

const Header = () => {
  const { user, logout } = useAuth();

  return (
    <>
      <style jsx>{`
        /* ... (Animation keyframes tetap sama) ... */
        @keyframes logoSlideIn {
          0% { opacity: 0; transform: translateX(-100px) rotate(-20deg); }
          60% { opacity: 1; transform: translateX(10px) rotate(5deg); }
          80% { transform: translateX(-5px) rotate(-2deg); }
          100% { opacity: 1; transform: translateX(0) rotate(0deg); }
        }
        @keyframes logoPopOut {
          0% { opacity: 0; transform: scale(0) rotate(-180deg); }
          60% { opacity: 1; transform: scale(1.2) rotate(10deg); }
          80% { transform: scale(0.9) rotate(-5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes floatingIdle {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          25% { transform: translateY(-8px) rotate(2deg); }
          50% { transform: translateY(-4px) rotate(-2deg); }
          75% { transform: translateY(-6px) rotate(1deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(220, 38, 38, 0.3)); }
          50% { filter: drop-shadow(0 0 8px rgba(220, 38, 38, 0.6)); }
        }

        /* PERBAIKAN DI SINI: Mengubah .alfamart-logo menjadi .header-logo */
        .header-logo {
          height: 40px; /* Ukuran diperkecil agar pas di header */
          width: auto;  /* Menjaga aspek rasio gambar */
          object-fit: contain;
          animation: logoSlideIn 1.2s ease-out forwards;
          opacity: 0;
          transform: translateX(-100px);
        }

        .building-logo {
          height: 45px;
          animation: logoPopOut 1.5s ease-out forwards,
            floatingIdle 3s ease-in-out 1.5s infinite,
            pulseGlow 2s ease-in-out 1.5s infinite;
          opacity: 0;
          transform: scale(0);
        }

        @media (max-width: 768px) {
          .desktop-header { display: none !important; }
          .mobile-header { display: block !important; }
        }
      `}</style>

      <header
        style={{
          backgroundColor: "var(--alfamart-red)",
          color: "var(--white)",
          padding: "12px 0",
          boxShadow: "var(--shadow)",
          width: "100%",
        }}
      >
        <div style={{ width: "100%", padding: "0 40px" }}>
          
          {/* Desktop Layout */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
            className="desktop-header"
          >
            {/* Bagian Kiri: Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* ClassName header-logo sekarang akan membaca style di atas */}
              <img 
                src={alfaLogo} 
                alt="Alfamart" 
                className="header-logo" 
                style={{position: 'static', transform: 'none'}} 
              />
              <img
                src="/Building-Logo.png"
                alt="Building & Maintenance"
                className="building-logo"
              />
              <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, textAlign: "center" }}>
                Sistem Opname
              </h1>
            </div>

            {/* Bagian Kanan: User & Logout */}
            {user && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "24px",
                }}
              >
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: "12px", opacity: "0.9" }}>
                    {user.role === "pic" ? user.store : user.company}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="btn btn-outline"
                  style={{
                    borderColor: "var(--white)",
                    color: "var(--white)",
                    padding: "8px 20px",
                    fontSize: "14px",
                    minWidth: "auto",
                    marginTop: "0"
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Mobile Layout */}
          <div className="mobile-header" style={{ display: "none" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              {/* Perbaikan ukuran mobile: Hapus width 100px jika ingin mengikuti CSS class, atau sesuaikan inline style */}
              <img 
                src={alfaLogo} 
                alt="Alfamart" 
                className="header-logo" 
                style={{position: 'static', height: '40px', width: 'auto'}} 
              />
              <img
                src="/Building-Logo.png"
                alt="Building & Maintenance"
                className="building-logo"
                style={{ height: "38px" }}
              />
            </div>
            {user && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "14px" }}>{user.name}</div>
                  <div style={{ fontSize: "11px", opacity: "0.9" }}>{user.role === "pic" ? user.store : user.company}</div>
                </div>
                <button onClick={logout} className="btn btn-outline" style={{ borderColor: "white", color: "white", padding: "6px 12px", fontSize: "12px" }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;