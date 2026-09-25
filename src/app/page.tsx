import Link from 'next/link';
import { Tx } from '@/lib/preferences';
import AppShell from '@/components/AppShell';
import InterfaceIcon from '@/components/InterfaceIcon';

export default function Home() {
  return (
    <AppShell active="home">
      <main className="rp-home">
        <section className="rp-home-intro">
          <div>
            <h1><Tx k="home.title" /></h1>
            <p className="rp-home-lead">
              <Tx k="home.lead" />
            </p>
            <div className="rp-access-meta"><InterfaceIcon name="locate" /><span><Tx k="home.area" /></span></div>
          </div>
          <section className="rp-home-actions" aria-labelledby="home-actions-title">
            <h2 id="home-actions-title"><Tx k="home.question" /></h2>
            <Link className="rp-entry-link" href="/acceso">
              <InterfaceIcon name="route" />
              <span><strong><Tx k="home.staff" /></strong><p><Tx k="home.staff.meta" /></p></span>
              <InterfaceIcon name="arrow" className="rp-entry-arrow" />
            </Link>
            <Link className="rp-entry-link" href="/solicitar">
              <InterfaceIcon name="route" />
              <span><strong><Tx k="home.request" /></strong><p><Tx k="home.request.meta" /></p></span>
              <InterfaceIcon name="arrow" className="rp-entry-arrow" />
            </Link>
            <Link className="rp-entry-link" href="/cliente">
              <InterfaceIcon name="package" />
              <span><strong><Tx k="home.client" /></strong><p><Tx k="home.client.meta" /></p></span>
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
