import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rutas Pasto",
    short_name: "Rutas Pasto",
    description: "Seguimiento y operación de entregas en Pasto, Nariño.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#0c0d10",
    lang: "es-CO",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
