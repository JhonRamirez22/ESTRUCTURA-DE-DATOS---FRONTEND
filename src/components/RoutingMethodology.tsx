export default function RoutingMethodology() {
  return (
    <details
      aria-label="Método de optimización y estructuras de datos"
      className="group mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--surface)] "
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-offset-4 marker:hidden focus-visible:outline-2 focus-visible:outline-emerald-600 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold text-slate-900">
            Cómo se calcula el despacho
          </span>
          <span className="mt-1 block text-xs text-slate-600">
            Algoritmos, datos viales y alcance del asistente
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 group-open:bg-emerald-50">
          Ver método
        </span>
      </summary>

      <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
            Asignación
          </p>
          <h3 className="mt-2 text-sm font-semibold text-slate-900">Cercanía y balanceo</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            El backend reparte los pedidos entre los repartidores elegidos según proximidad y carga.
            Los factores externos solo se aplican tras validación; si fallan, continúa el cálculo
            determinista.
          </p>
        </article>

        <article className="rounded-xl bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
            Orden de paradas
          </p>
          <h3 className="mt-2 text-sm font-semibold text-slate-900">Nearest neighbor + 2-opt</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            La matriz de tiempos viales guía un orden inicial; 2-opt prueba mejoras. Es una
            heurística rápida para un recorrido abierto, no una garantía de óptimo matemático ni un
            regreso al origen.
          </p>
        </article>

