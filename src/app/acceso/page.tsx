'use client';

import { apiFetch } from '@/lib/apiClient';

import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { InteractiveLogin, type LoginCredentials } from '@/components/ui/interactive-login';

export default function AccessPage() {
  const signIn = async ({ email, password }: LoginCredentials): Promise<void> => {
    const requested = new URLSearchParams(window.location.search).get('retorno');
    const response = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnTo: requested }),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('El servicio de acceso no respondió. Intenta nuevamente en unos segundos.');
    }
    const payload = (await response.json()) as {
      error?: string;
      authenticated?: boolean;
      redirectTo?: string;
    };
    if (!response.ok || payload.authenticated !== true || !payload.redirectTo)
      throw new Error(payload.error ?? 'No se pudo iniciar sesión.');
    window.location.assign(payload.redirectTo);
  };
  return (
    <AppShell active="home">
      <main className="rp-access">
        <div className="rp-access-story">
          <Link className="ui-back-link" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            Inicio
          </Link>
          <h2>
            Una ciudad.
            <br />
            Cada entrega
            <br />
            en orden.
          </h2>
          <p>
            Coordina los pedidos, encuentra la próxima parada y acompaña cada recorrido por las
            calles de Pasto.
          </p>
          <div className="rp-access-meta">
            <MapPin size={16} aria-hidden="true" />
            <span>Pasto, Nariño</span>
          </div>
        </div>
        <InteractiveLogin onSubmit={signIn} />
      </main>
    </AppShell>
  );
}
