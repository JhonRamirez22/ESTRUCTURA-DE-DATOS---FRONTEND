import Link from 'next/link';
import AppShell from '@/components/AppShell';
import InterfaceIcon from '@/components/InterfaceIcon';

export default function Home() {
  return (
    <AppShell active="home">
      <main className="rp-home">
        <section className="rp-home-intro">
          <div>
            <h1>Del pedido pendiente a la puerta, sin perder el hilo.</h1>
            <p className="rp-home-lead">
              Registra pedidos, organiza las paradas y sigue el avance de cada entrega.
              Las calles de Pasto conectan el recorrido; tu equipo lleva el control.
            </p>
            <div className="rp-access-meta"><InterfaceIcon name="locate" /><span>Servicio local en Pasto, Nariño</span></div>
          </div>
          <section className="rp-home-actions" aria-labelledby="home-actions-title">
            <h2 id="home-actions-title">¿Qué necesitas hacer?</h2>
            <Link className="rp-entry-link" href="/acceso">
              <InterfaceIcon name="route" />
              <span><strong>Soy repartidor o despachador</strong><p>Acceso privado para reparto y despacho.</p></span>
              <InterfaceIcon name="arrow" className="rp-entry-arrow" />
            </Link>
            <Link className="rp-entry-link" href="/cliente">
              <InterfaceIcon name="package" />
              <span><strong>Soy cliente</strong><p>Consulta el avance de tu envío con la guía.</p></span>
              <InterfaceIcon name="arrow" className="rp-entry-arrow" />
            </Link>
          </section>
        </section>

        <section className="rp-home-section" aria-label="Cómo funciona el seguimiento">
          <h2>Operación privada; seguimiento por guía</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            <div><dt className="mb-2 text-sm font-semibold">Rutas por calles</dt><dd><p>Orden de visita optimizado con tiempos viales de OSRM.</p></dd></div>
            <div><dt className="mb-2 text-sm font-semibold">Ubicación del equipo</dt><dd><p>El repartidor comparte su posición desde el GPS del teléfono.</p></dd></div>
            <div><dt className="mb-2 text-sm font-semibold">Consulta para clientes</dt><dd><p>Estado, recorrido y llegada aproximada, vinculados a una guía privada.</p></dd></div>
          </dl>
        </section>

        <section className="rp-home-section rp-home-method" aria-labelledby="route-method-title">
          <div>
            <h2 id="route-method-title">Rutas por calles, con un orden que se puede explicar.</h2>
            <p className="mt-4">La optimización compara tiempos de la red vial. Si TomTom aporta una señal confiable, se ajustan solo segmentos muestreados; sin señal se conserva el costo vial base.</p>
          </div>
          <ol>
            <li><h3>Tiempos de la red vial</h3><p>OSRM calcula duraciones por calles y el backend las normaliza a minutos.</p></li>
            <li><h3>Orden inicial con vecino más cercano</h3><p>Desde la posición del repartidor, se elige la siguiente parada de menor costo pendiente.</p></li>
            <li><h3>Mejora local con 2-opt</h3><p>Reordena grupos de paradas para bajar el costo del recorrido abierto: es una heurística, no una garantía de óptimo.</p></li>
          </ol>
        </section>

        <section className="rp-home-section rp-home-method" aria-labelledby="customer-updates-title">
          <h2 id="customer-updates-title">Información útil, ligada a tu pedido</h2>
          <dl className="space-y-6">
            <div><dt className="mb-2 text-sm font-semibold">Asistente del pedido</dt><dd><p>Responde sobre estado, asignación, recorrido o ETA. La consulta se normaliza: no se envía el texto libre original al proveedor de IA.</p></dd></div>
            <div><dt className="mb-2 text-sm font-semibold">Avisos opcionales</dt><dd><p>El cliente puede autorizar correo, SMS o ambos para avisos de asignación y cercanía. Cada canal requiere estar configurado.</p></dd></div>
          </dl>
        </section>

        <footer className="rp-home-footer">
          <p>El ETA es aproximado y depende de la última posición GPS y los tiempos viales disponibles.</p>
          <p>Grafo dirigido y min-heap para Dijkstra/A*; cola para GPS, pila para recálculos y listas dobles para cachés LRU.</p>
        </footer>
      </main>
    </AppShell>
  );
}
