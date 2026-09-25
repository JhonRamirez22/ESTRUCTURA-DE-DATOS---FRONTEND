"use client";

import { apiFetch } from "@/lib/apiClient";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface PageAccessDecision {
  allowed: boolean;
  redirectTo: string | null;
}

type GuardState = "checking" | "allowed" | "unavailable";

const INTERNAL_REDIRECTS = new Set(["/acceso", "/dashboard", "/repartidor"]);

export default function BackendAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [state, setState] = useState<GuardState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const verifyAccess = useCallback(async (signal: AbortSignal): Promise<void> => {
    setState("checking");
    setError(null);

    try {
      const response = await apiFetch(
        `/api/auth/access?path=${encodeURIComponent(pathname)}`,
        { cache: "no-store", signal },
      );
      if (!response.ok) {
        throw new Error("El servicio de acceso no respondió.");
      }

      const decision = (await response.json()) as PageAccessDecision;
      if (decision.allowed === true) {
        setState("allowed");
        return;
      }
      const redirectTo = decision.redirectTo;
      if (typeof redirectTo !== "string" || !INTERNAL_REDIRECTS.has(redirectTo)) {
        throw new Error("El backend devolvió una decisión de acceso inválida.");
      }

      if (redirectTo === "/acceso") {
        const accessUrl = new URL("/acceso", window.location.origin);
        accessUrl.searchParams.set("retorno", `${pathname}${window.location.search}`);
        router.replace(`${accessUrl.pathname}${accessUrl.search}`);
        return;
      }

      router.replace(redirectTo);
    } catch (requestError) {
      if (signal.aborted) return;
      setState("unavailable");
      setError(
