"use client";
import React from "react";

export default function WarningModal({ title, message, onClose }) {
  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff8e1",
          padding: "20px 30px",
          borderRadius: "10px",
          boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
          textAlign: "center",
          maxWidth: "360px",
        }}
      >
        <div
          style={{
            fontSize: "40px",
            color: "#f4b400",
            marginBottom: "10px",
          }}
        >
          ⚠
        </div>

        <h3 style={{ color: "#b67a00", fontWeight: 700, marginBottom: "6px" }}>
          {title || "Warning"}
        </h3>

        <p
          style={{
            color: "#5a4b00",
            fontSize: "0.95rem",
            textAlign: "center",
            marginBottom: "10px",
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </p>

        <button
          onClick={onClose}
          style={{
            marginTop: "10px",
            background: "#f4b400",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "6px 16px",
            cursor: "pointer",
            fontWeight: "600",
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
