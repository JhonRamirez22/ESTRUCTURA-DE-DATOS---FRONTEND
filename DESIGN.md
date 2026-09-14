# Diseño: Líneas de ruta

Rutas Pasto se lee como la señalética de una línea de transporte urbano: cada ruta es una línea con sus paradas en orden. Reemplaza el aspecto de tarjetas redondeadas de shadcn/ui. La paleta cálida, Public Sans, el mapa oscuro y el recorrido verde único se conservan.

## Principios

1. **Franjas y filetes, no tarjetas.** Las secciones se separan con un encabezado y un filete de 2px. Una caja solo aparece cuando agrupa una decisión (la propuesta, la próxima parada).
2. **La línea es la firma.** Toda secuencia de paradas (propuesta, ruta activa, repartidor, seguimiento del cliente, acceso) se dibuja con `RouteLine` o `RouteStrip`.
3. **Verde solo para el recorrido y lo verificado.** El resto de la interfaz es café sobre marfil.
4. **Controles rectangulares y planos.** Radio de 4px, bordes de 2px, sin degradados ni sombras en reposo.

## Tokens (`src/app/globals.css`)

| Token | Valor | Uso |
|---|---|---|
| `--background` | `#f6f1e9` | Fondo marfil |
| `--foreground` | `#32261f` | Tinta |
| `--surface` | `#fffcf7` | Campos y superficie clara |
| `--board` | `#32261f` | Barra de paradero y franjas de decisión |
| `--board-ink` / `--board-soft` | `#fffcf7` / `#cdbfae` | Texto sobre la franja oscura |
| `--band` | `#eee5d9` | Fila seleccionada y avisos neutros |
| `--line` / `--line-strong` | `#ded2c4` / `#c9b9a8` | Filetes de filas y encabezados |
| `--accent` | `#6b4f3f` | Línea café de rutas no seleccionadas |
| `--route` / `--route-ink` | `#3e9b6a` / `#1f5c3e` | Recorrido seleccionado, acciones de avance, IA verificada |
| `--warn` / `--danger` | `#8a5a12` / `#8e2635` | Estados de atención y error |

Tipografía: Public Sans autoalojada. Títulos de pantalla de 24 a 28px (600), cifras de 24px con `tabular-nums`, cuerpo de 14 a 15px, notas de 12px.

Tailwind: `--radius-*` aplanados a 2-6px y `--shadow-sm/md` anulados, para que ninguna utilidad heredada vuelva a crear tarjetas blandas.

## Componentes

| Clase o componente | Qué es |
|---|---|
| Barra superior `.rp-shell-header` | Panel de paradero café oscuro; el destino activo lleva una barra verde de 4px debajo. En pantallas estrechas la navegación pasa a su propia fila |
| `.rl-page`, `.rl-page-head`, `.rl-figures` | Contenedor de pantalla; encabezado con filete de 2px y cifras del día en línea |
| `.rl-head` | Encabezado de sección con la marca de parada (círculo con borde de 3px) |
| `.rl-rows`, `.rl-row` | Listas por filas con filete; `.is-selected` usa la franja beige |
| `.rl-board` | Franja oscura para decisiones: propuesta de despacho, próxima parada, ETA del cliente |
| `.rl-notice` (`.is-ok`, `.is-warn`, `.is-error`) | Aviso en franja con la marca de parada en el color del estado |
| `.rl-state` | Estado como punto y texto, no como píldora |
| `RouteLine` (`src/components/RouteLine.tsx`) | Paradas sobre una línea vertical; estados `done` (punto lleno, tachado), `current` (punto oscuro con anillo), `pending` (anillo), `terminal` |
| `RouteStrip` | Progreso horizontal compacto de una ruta |
| Botones `.rp-button-*` | `primary` café oscuro, `go` verde para avanzar (despachar, entregar, iniciar ubicación), `secondary` contorno café, `quiet` contorno claro, `danger` contorno rojo, `map` superficie opaca sobre el mapa, `block` ancho completo de 52px |
| `.rp-input` | Campo claro con borde inferior de 2px que se oscurece al enfocar |

## Movimiento

Curvas `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` y `--ease-in-out`. Los botones ceden a `scale(0.97)` al pulsar (160ms). Las propuestas entran en 260ms; las entradas del panel en vivo, en 240ms. Con `prefers-reduced-motion` se quita el desplazamiento y se conserva el contenido.

## Accesibilidad

Objetivos táctiles de 44px o más (52px en acciones principales del teléfono), foco visible de 2px, estados con texto además del color y `sr-only` en `RouteLine` para leer el estado de cada parada.
