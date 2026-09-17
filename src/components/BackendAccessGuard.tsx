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
