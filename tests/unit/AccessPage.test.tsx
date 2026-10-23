import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccessPage from "@/app/acceso/page";

vi.mock("@/components/AppShell", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
const mockFetch = vi.fn();

describe("acceso con correo y contraseña", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function submit() {
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
