import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from 'next/headers';
import "./globals.css";

// La tipografía se sirve desde /public/fonts; compilar no requiere descargar fuentes.
export const metadata: Metadata = {
  title: "Rutas Pasto · Centro de despacho",
  description: "Optimización y seguimiento de rutas de entrega en Pasto, Nariño.",
  appleWebApp: {
    capable: true,
    title: "Rutas Pasto",
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // El nonce CSP se genera por petición; no puede hidratar un documento precompilado/cacheado.
  await headers();
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
