---
version: 1
slug: "src-app-dashboard-page-tsx"
primary_target: "src/app/dashboard/page.tsx"
related_targets: ["src/app/pedidos/page.tsx","src/app/personal/page.tsx","src/app/repartidor/page.tsx","src/app/cliente/page.tsx","src/app/acceso/page.tsx"]
---

Alcance: todas las pantallas operativas (acceso, despacho, pedidos, personal, repartidor, seguimiento). Modo: Operate.

## Direction contract

THESIS: Cada ruta es una línea de transporte urbano: paradas en orden sobre una línea, como la señalética de buses de Pasto. Rechaza la rejilla de tarjetas redondeadas de shadcn.

OWN-WORLD: Fondo marfil #f6f1e9, tinta café #32261f, barra superior café oscuro con texto marfil como un panel de paradero. Secciones separadas por franjas y filetes de 2px, no por tarjetas. Radio 4px. Botones rectangulares: primario café oscuro, secundario contorno de 2px. Campos con borde inferior grueso. Verde #3e9b6a solo para el recorrido seleccionado y lo verificado. Public Sans con cifras tabulares.

STORY: El despachador ve primero qué sale y quién está libre, analiza, despacha y luego sigue cada ruta como una línea con su parada actual. El repartidor ve su línea y una acción grande. El cliente ve en qué parada va su pedido.

FIRST VIEWPORT: Barra de paradero arriba con marca y navegación; título de 24 a 28px con cifras del día en línea; tres columnas sin tarjetas separadas por filetes: pedidos en salida, repartidores libres y propuesta en franja oscura con el botón principal.

FORM: Señalética de líneas de transporte urbano (Avante, Pasto). Elegido por Claude cuando el usuario delegó la elección, segundo sorteo. seed:2050d2f9a2791890

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
