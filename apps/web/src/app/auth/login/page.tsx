'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { validateLoginForm, type FieldErrors } from '@vintage/shared';
import { apiPost, setAuthToken } from '@/lib/api';
import { TurnstileWidget } from '@/components/TurnstileWidget';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Client-side gate so the user gets immediate feedback on shape errors
    // (empty fields, malformed e-mail, sub-8-char password) without a
    // round-trip. The API still validates on every request — this is purely
    // a UX layer that mirrors validateLoginForm in @vintage/shared so web
    // and mobile show the same messages for the same input.
    const errs = validateLoginForm({ email, password });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);

    try {
      const response = await apiPost<
        | { accessToken: string; refreshToken: string }
        | { requiresTwoFa: true; tempToken: string; method: 'TOTP' | 'SMS'; phoneHint?: string }
      >('/auth/login', {
        email,
        password,
        // captchaToken is ignored by the backend CaptchaGuard while
        // CAPTCHA_ENFORCE=false. We ship the widget now so flipping the
        // flag post-launch doesn't require a coordinated web release.
        captchaToken,
      });

      if ('requiresTwoFa' in response) {
        // 2FA challenge: route to the verification page with the tempToken.
        const qs = new URLSearchParams({
          tempToken: response.tempToken,
          method: response.method,
        });
        if (response.phoneHint) qs.set('phoneHint', response.phoneHint);
        router.push(`/auth/2fa?${qs.toString()}`);
        return;
      }

      setAuthToken(response.accessToken);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">Entrar na sua conta</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
              required
              aria-invalid={Boolean(fieldErrors.password)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
            )}
          </div>

          <TurnstileWidget
            onToken={setCaptchaToken}
            onExpired={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="text-center">
            <Link href="/auth/forgot-password" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              Esqueceu a senha?
            </Link>
          </div>
        </form>

        {/* TODO(Phase 9): Re-enable Google / Apple OAuth after Google Cloud Console and Apple Developer setup. */}

        <p className="text-sm text-gray-500 text-center mt-6">
          Não tem conta?{' '}
          <Link href="/auth/register" className="text-brand-600 hover:text-brand-700 font-medium">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
