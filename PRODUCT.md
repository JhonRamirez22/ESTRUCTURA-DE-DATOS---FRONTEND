# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Despachador** (principal): trabaja sentado, con monitor grande, todo el turno, atendiendo de 3 a 10 repartidores. Registra pedidos, selecciona cuáles enviar, analiza una propuesta, confirma el despacho y supervisa las rutas.
- **Repartidor**: usa el teléfono en la calle, con una mano y poca atención. Comparte GPS, sigue su recorrido y marca entregas.
- **Cliente**: abre un enlace de seguimiento en el móvil una o dos veces por pedido. Pantalla corta y tranquilizadora, con pocos datos ajenos.

## Product Purpose
Aplicación web/PWA de mensajería y despacho en el área urbana de Pasto, Nariño, Colombia. Organiza pedidos, asigna repartidores, calcula el orden de visita, dibuja el recorrido por calles y permite seguimiento. También es un proyecto de Estructura de Datos con estructuras y algoritmos propios. Éxito de la interfaz: el despachador despacha un lote en menos de un minuto y con pocos clics; el repartidor ve una acción principal grande por pantalla; la IA se muestra como evidencia verificable, no como ruido; la demo se entiende en 5 minutos sin explicaciones.

## Positioning
Reparto con ruta optimizada por calles reales donde una IA propone el orden y un algoritmo propio lo verifica antes de aplicarlo.

## Operating Context
Despacho en escritorio (1280 px o más) y repartidores en móvil. Producción: frontend en Vercel, API en AWS ECS y PostgreSQL en RDS. Interfaz en español. Presentación académica el 25 de octubre de 2026, sobre producción con cuenta y datos de demostración.

## Capabilities and Constraints
- Se conservan sin cambios: el mapa y sus capas, la paleta cálida (marfil, beige, café), Public Sans, el texto en español, los controles accesibles existentes (foco visible, objetivos táctiles de 44 px) y la PWA.
- **No se tocan las funciones de IA ni el backend.** El rediseño es solo de presentación del frontend.
- Sin dependencias nuevas.
- Un solo cliente (single-tenant). Avisos por correo y SMS apagados.
- Debe funcionar en escritorio y en teléfono.

## Evidence on Hand
Datos sintéticos de Pasto (scripts de demostración). Capturas autenticadas no disponibles todavía; el diagnóstico inicial salió del código.

## Product Principles
1. Una tarea principal por pantalla; lo secundario no compite con ella.
2. La IA se muestra como resultado verificado (cuánto ahorra y quién lo confirmó), no como explicación.
3. Operación primero: menos texto, estados claros, acciones con consecuencias visibles.
4. El repartidor decide con un vistazo y un pulgar.

## Accessibility & Inclusion
Contraste legible en la paleta cálida, foco visible, objetivos táctiles de al menos 44 px, textos en español claros y respeto a `prefers-reduced-motion`.
