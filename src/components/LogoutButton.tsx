"use client";

import { apiFetch } from "@/lib/apiClient";
import InterfaceIcon from "./InterfaceIcon";

export default function LogoutButton() {
  const logout = async (): Promise<void> => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith("rutas-pasto:assigned-route:") || key === "rutas-pasto:courier-id") {
            window.localStorage.removeItem(key);
          }
        }
        if ("caches" in window) {
          await Promise.all(
            (await window.caches.keys())
              .filter((key) => key.startsWith("rutas-pasto-routes"))
              .map((key) => window.caches.delete(key)),
          );
        }
      } catch {
        // El service worker nuevo también elimina la caché privada heredada al activarse.
      }
      window.location.replace("/");
    }
  };

  return (
    <button
      className="rp-logout"
      onClick={() => void logout()}
      type="button"
    >
      <InterfaceIcon name="logout" /> Salir
    </button>
  );
}
