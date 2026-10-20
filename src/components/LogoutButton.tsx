"use client";

import { apiFetch } from "@/lib/apiClient";
import InterfaceIcon from "./InterfaceIcon";
import { usePreferences } from "@/lib/preferences";

export default function LogoutButton() {
  const { t } = usePreferences();
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
      data-tip="tip.logout"
      onClick={() => void logout()}
      type="button"
    >
      <InterfaceIcon name="logout" /> <span className="rp-logout-text">{t("shell.logout")}</span>
    </button>
  );
}
