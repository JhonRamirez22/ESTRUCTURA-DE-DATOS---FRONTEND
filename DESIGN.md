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
