'use client';

import { apiFetch } from '@/lib/apiClient';
import { usePreferences } from '@/lib/preferences';

import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import { RouteLine } from '@/components/RouteLine';
import AppShell from '@/components/AppShell';
import { InteractiveLogin, type LoginCredentials } from '@/components/ui/interactive-login';

export default function AccessPage() {
  const { t } = usePreferences();
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
