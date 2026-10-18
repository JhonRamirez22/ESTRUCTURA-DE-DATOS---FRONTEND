# Rutas Pasto - Frontend

Aplicación web para la gestión y el seguimiento de rutas de entrega en Pasto,
desarrollada como proyecto de la asignatura **Estructura de Datos**.

## Stack

Next.js 15 - React 18 - TypeScript - Tailwind CSS 4 - MapLibre GL - shadcn/ui

## Funcionalidades

- Panel de despacho con asignación de rutas y mapa interactivo
- Registro, listado y seguimiento de pedidos
- Vista del repartidor con control de entregas y reporte de ubicación
- Seguimiento del cliente y chat asociado al pedido
- Capa de tráfico y explicación de la metodología de ruteo
- Notificaciones por correo y SMS con consentimiento del cliente

## Requisitos

- Node.js 22
- pnpm 10

## Puesta en marcha

```bash
pnpm install
pnpm dev
```

## Pruebas

```bash
pnpm test        # pruebas unitarias con Vitest
pnpm test:e2e    # pruebas end-to-end con Playwright
```

## Estructura

```
src/app          rutas y páginas (App Router)
src/components   componentes de interfaz
src/lib          utilidades y lógica compartida
src/types        tipos del dominio
tests            pruebas unitarias y end-to-end
```

## Equipo

- @JhonRamirez22
- @miguelcebing
- @sthebanHV
