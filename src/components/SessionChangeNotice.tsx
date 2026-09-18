'use client';

import { useEffect, useState } from 'react';
import { onSessionChange, setSessionRole, type SessionRole } from '@/lib/apiClient';

const ROLE_LABELS: Record<SessionRole, string> = {
  dispatcher: 'de despacho',
  courier: 'de repartidor',
};

/**
 * Fija el rol de esta pestaña y avisa si otra pestaña inicia o cierra la misma sesión:
 * la cookie de ese rol se reemplazó y las escrituras de esta pestaña fallarían.
 */
export function SessionChangeNotice({ role }: { role: SessionRole }) {
  const [changed, setChanged] = useState(false);
