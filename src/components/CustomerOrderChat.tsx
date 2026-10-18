'use client';

import { apiFetch } from '@/lib/apiClient';

import { useEffect, useRef, useState, type FormEvent } from 'react';

interface CustomerOrderChatProps {
  guide: string;
}

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}

type AssistantConfiguration = 'checking' | 'configured' | 'not-configured' | 'unknown';

const MAX_MESSAGE_LENGTH = 700;
const AVAILABILITY_TIMEOUT_MS = 5_000;
// Four user turns remain below the API's 3,000-character conversation limit.
const MAX_HISTORY_TURNS = 4;
const SUGGESTED_QUESTIONS = ['¿Ya fue asignado?', '¿Ya viene?', '¿Cuánto falta?'];
const PROVIDER_NOTICE_SUMMARY =
  'A la IA solo se envían la intención normalizada y el estado del pedido; el ETA se comparte si lo preguntas y es aproximado. Ver privacidad y tráfico.';
const DEFAULT_PROVIDER_NOTICE =
  'Privacidad: la IA recibe solo la intención normalizada y el estado; el texto original no se comparte. ' +
  'No se envían guía, dirección, coordenadas, nombre, teléfono ni IDs. ' +
  'Si preguntas por la llegada, el ETA es aproximado; TomTom, si está disponible, solo cubre ' +
  'parte del primer tramo, no toda la ruta. El chat se limita a este pedido.';

export default function CustomerOrderChat({ guide }: CustomerOrderChatProps) {
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assistantConfiguration, setAssistantConfiguration] =
    useState<AssistantConfiguration>('checking');
  const [error, setError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState(DEFAULT_PROVIDER_NOTICE);
  const conversationRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);

    void apiFetch('/api/cliente/chat/estado', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('No se pudo comprobar el asistente.');
        }
        const payload: unknown = await response.json();
        if (!isAssistantConfiguration(payload)) {
          throw new Error('La configuración del asistente no tiene un formato válido.');
        }
        if (active) {
          setAssistantConfiguration(payload.configured ? 'configured' : 'not-configured');
        }
      })
      .catch(() => {
        if (active) {
          // Si falla la consulta de estado, permitimos probar el chat y mostramos el error real.
          setAssistantConfiguration('unknown');
        }
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const viewport = conversationRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [conversation, submitting]);
