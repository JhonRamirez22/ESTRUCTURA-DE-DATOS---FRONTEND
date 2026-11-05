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
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: " contraseña privada " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ingresar" }));
  }

  it("envía credenciales sin recortar la contraseña y sin permitir seleccionar rol", async () => {
    mockFetch.mockResolvedValue(Response.json({ authenticated: true, redirectTo: "/dashboard" }));
    const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    render(<AccessPage />);
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
      email: "a@example.com",
      password: " contraseña privada ",
      returnTo: null,
    });
    expect(screen.queryByLabelText("Código de acceso")).toBeNull();
  });

  it("muestra un error recuperable cuando el servidor devuelve texto en vez de JSON", async () => {
    mockFetch.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));
    render(<AccessPage />);
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "El servicio de acceso no respondió",
    );
    expect((screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("muestra rechazo de credenciales sin navegar", async () => {
    mockFetch.mockResolvedValue(
      Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 }),
    );
    render(<AccessPage />);
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Correo o contraseña incorrectos.",
    );
  });
});
