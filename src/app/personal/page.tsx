'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/lib/preferences';
import { SessionChangeNotice } from '@/components/SessionChangeNotice';
import DemoGpsButton from '@/components/DemoGpsButton';
import PasswordChangeForm from '@/components/PasswordChangeForm';
import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';
import { isCourierLocationFresh } from '@/lib/courierLocation';

type CourierStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE';

interface Courier {
  id: string;
  name: string;
  phone: string;
  status: CourierStatus;
  lastLocationAt: string | null;
}

interface CourierDraft {
  name: string;
  phone: string;
  email: string;
  password: string;
}

interface AccessDraft {
  courierId: string;
  email: string;
  password: string;
}

const EMPTY_DRAFT: CourierDraft = { name: '', phone: '', email: '', password: '' };
const MIN_PASSWORD = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Personal: alta y baja de repartidores con su acceso, y cambio de credenciales del equipo. */
export default function StaffPage() {
  const { t } = usePreferences();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourierDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessDraft | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ courierId: string; message: string } | null>(null);
