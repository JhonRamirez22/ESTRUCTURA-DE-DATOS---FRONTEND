import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from 'next/headers';
import { PREFERENCES_BOOT_SCRIPT, PreferencesProvider } from '@/lib/preferences';
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
  const requestHeaders = await headers();
  const nonce = /'nonce-([^']+)'/.exec(requestHeaders.get('content-security-policy') ?? '')?.[1];
  return (
    <html
      lang="es"
      className="h-full antialiased"
      // El script previo ajusta tema e idioma antes de hidratar.
      suppressHydrationWarning
    >
      <head>
        {/* El navegador oculta el nonce tras cargar; React no debe compararlo al hidratar. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
