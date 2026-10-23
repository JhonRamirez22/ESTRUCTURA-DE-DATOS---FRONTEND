import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BackendAccessGuard from "@/components/BackendAccessGuard";

const { replace, pathname, mockFetch, router } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    replace,
    pathname: { value: "/dashboard" },
    mockFetch: vi.fn(),
    router: { replace },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => router,
}));

describe("BackendAccessGuard", () => {
  beforeEach(() => {
    replace.mockReset();
    mockFetch.mockReset();
    pathname.value = "/dashboard";
    vi.stubGlobal("fetch", mockFetch);
  });

