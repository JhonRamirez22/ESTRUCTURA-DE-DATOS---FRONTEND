'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/lib/preferences';

export interface LoginCredentials {
  email: string;
  password: string;
}

export function InteractiveLogin({
  onSubmit,
}: {
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const emailInvalid = emailTouched && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const reducedMotion = useReducedMotion();
  const { t } = usePreferences();

  return (
    <motion.section className="ui-login-panel" layout={reducedMotion ? false : 'position'}>
      <div className="ui-login-mark">
        <Route size={26} aria-hidden="true" />
      </div>
      <h1>{t('login.title')}</h1>
      <p className="ui-login-intro">{t('login.intro')}</p>
      <form
        aria-busy={loading}
        aria-describedby={error ? 'login-error' : undefined}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          submitting.current = true;
          setLoading(true);
          setError(null);
          try {
            await onSubmit({ email: email.trim(), password });
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'No se pudo iniciar sesión. Intenta nuevamente.'
            );
          } finally {
            submitting.current = false;
            setLoading(false);
          }
        }}
      >
        <label htmlFor="email">{t('login.email')}</label>
        <input
          id="email"
          name="email"
          autoComplete="username"
          className="rp-input"
          type="email"
          required
          maxLength={254}
          value={email}
          disabled={loading}
          aria-invalid={emailInvalid}
          aria-describedby={emailInvalid ? 'email-hint' : undefined}
          onBlur={() => setEmailTouched(true)}
          onChange={(event) => setEmail(event.target.value)}
        />
        {emailInvalid ? (
          <p className="ui-login-error" id="email-hint">
            {t('login.email.invalid')}
          </p>
        ) : null}
        <label htmlFor="password">{t('login.password')}</label>
        <div className="ui-password-field">
          <input
            id="password"
            name="password"
            autoComplete="current-password"
            className="rp-input"
            type={visiblePassword ? 'text' : 'password'}
            required
            maxLength={128}
            value={password}
            disabled={loading}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="ui-password-toggle"
            aria-label={visiblePassword ? t('login.hide') : t('login.show')}
            data-tip="tip.showPassword"
            aria-pressed={visiblePassword}
            onClick={() => setVisiblePassword(!visiblePassword)}
            disabled={loading}
          >
            {visiblePassword ? (
              <EyeOff size={18} aria-hidden="true" />
