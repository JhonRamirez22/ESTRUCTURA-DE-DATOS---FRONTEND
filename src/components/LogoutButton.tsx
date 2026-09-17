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
