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

  const sendQuestion = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || submitting) {
      return;
    }

    const nextConversation = [...conversation, { role: 'user' as const, content: question }];
    setConversation(nextConversation);
    setDraft('');
    setError(null);
    setSubmitting(true);

    try {
      const messages = nextConversation
        .filter((message) => message.role === 'user')
        .slice(-MAX_HISTORY_TURNS)
        .map((message) => ({ role: 'user' as const, content: message.content }));
      const response = await apiFetch('/api/cliente/chat', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guide, messages }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const payload: unknown = await response.json();
      if (!isChatResponse(payload)) {
        throw new Error('El asistente devolvió una respuesta inválida. Inténtalo de nuevo.');
      }

      setConversation((current) => [...current, { role: 'assistant', content: payload.reply }]);
      if (payload.providerNotice) {
        setProviderNotice(payload.providerNotice);
      }
    } catch (sendError) {
      setConversation(conversation);
      setDraft((currentDraft) => currentDraft || question);
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'No se pudo enviar la pregunta. Comprueba tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectSuggestedQuestion = (question: string): void => {
    setDraft(question);
    questionRef.current?.focus();
  };

  return (
    <section
      aria-labelledby="customer-order-chat-title"
      className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--surface)] "
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900" id="customer-order-chat-title">
            ¿Tienes dudas sobre este pedido?
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Resuelve dudas sobre esta guía. La conexión con el proveedor se confirma al enviar.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            assistantConfiguration === 'configured'
              ? 'bg-emerald-50 text-emerald-800'
              : assistantConfiguration === 'checking'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-amber-50 text-amber-900'
          }`}
        >
          <span
            aria-hidden="true"
