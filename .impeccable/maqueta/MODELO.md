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

Paleta marfil/beige/café, Public Sans, mapa oscuro con ruta verde única, la firma de línea de ruta (`RouteLine`), tráfico severo en rojo apagado, español como idioma base y todas las funciones.

## Reglas del modelo

1. **Respuesta:** la retroalimentación ocurre al pulsar, no al soltar (`:active` a 100 ms).
2. **Interrumpible:** nada bloquea la entrada. Un resorte parte siempre del valor visible y conserva la velocidad.
3. **Resortes:** amortiguamiento 1 por defecto. Solo se rebota (≈ 0,8) cuando el gesto traía velocidad (> 420 px/s). Respuesta 0,35 a 0,4 s.
4. **Proyección:** al soltar la hoja se proyecta el impulso con `v/1000 · d/(1 − d)`, `d = 0,998`, y se elige la altura más cercana.
5. **Bordes:** más allá de las alturas extremas hay resistencia progresiva (rubber-band), nunca un tope seco.
6. **Materiales:** nunca vidrio claro sobre vidrio claro. Superficies grandes, vidrio más denso. Los divisores de 1 px del contenedor pasan a desvanecimientos en los bordes del scroll.
7. **Origen espacial:** los avisos de confirmación nacen del botón que los abrió y vuelven por el mismo camino.
8. **Una sola cámara:** el mapa se encuadra al abrir, al cambiar de ruta o de modo; nunca con cada actualización GPS.
9. **Preferencias del sistema:** `prefers-reduced-motion` (fundidos en lugar de resortes), `prefers-reduced-transparency` (superficies sólidas) y `prefers-contrast: more` (bordes definidos), en ambos temas y en español e inglés.
10. **Vibración:** solo en compromisos (entrega confirmada, despacho), sin sonido, con interruptor.

## Tipografía

| Rol | Tamaño | Interlineado | Tracking |
