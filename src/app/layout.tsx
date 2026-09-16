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
