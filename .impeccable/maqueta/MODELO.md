# Modelo de interfaz v2 (propuesto, pendiente de aprobación)

Maqueta jugable: `.impeccable/maqueta/index.html` (un solo archivo, datos de ejemplo de Pasto). Capturas de regresión en `.impeccable/maqueta/shots/`. No toca el backend, no añade dependencias y no sustituye todavía a `DESIGN.md`.

## Qué cambia

| Área | Hoy (Líneas de ruta v1) | Modelo v2 |
|---|---|---|
| Composición | Mapa y panel como bloques | Mapa a pantalla completa; el panel es una hoja de vidrio cálido |
| Móvil | Panel apilado | Hoja inferior con 3 alturas (mínima, media, completa), agarrable en cualquier momento |
| Escritorio y horizontal | Columnas | Panel lateral flotante (ancho del escenario ≥ 720 px) |
| Movimiento | Transiciones CSS | Resortes propios (respuesta y amortiguamiento), velocidad heredada al soltar y proyección de impulso |
| Materiales | Superficies planas | Tres niveles: escenario, hoja (vidrio grueso), controles (vidrio ligero) |
| Tipografía | Public Sans con valores sueltos | Escala con tracking y leading que cambian con el tamaño, en `rem` |
| Errores y acciones reversibles | Diálogos | Aviso con Deshacer 6 s; diálogo solo para lo irreversible |
| Búsqueda | No existe | Paleta de comandos `⌘K` / `Ctrl+K` |
| Carga | Indicadores | Esqueletos con la forma del contenido |

## Se conserva
