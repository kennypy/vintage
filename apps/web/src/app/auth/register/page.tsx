'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, setAuthToken } from '@/lib/api';
import { TurnstileWidget } from '@/components/TurnstileWidget';

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  // ISO 8601 yyyy-mm-dd, bound to the native <input type="date">.
  const [birthDate, setBirthDate] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCpfChange = (value: string) => {
    setCpf(formatCPF(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!acceptTerms) {
      setError('Você precisa aceitar os termos de uso.');
      return;
    }

    if (!birthDate) {
      setError('Data de nascimento é obrigatória.');
      return;
    }
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) {
      setError('Data de nascimento inválida.');
      return;
    }
    const ageYears = (Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 18) {
      setError('Você precisa ter pelo menos 18 anos para criar uma conta.');
      return;
    }

    setLoading(true);

    try {
      const response = await apiPost<{ accessToken: string }>('/auth/register', {
        name,
        email,
        cpf: cpf.replace(/\D/g, ''),
        password,
        birthDate,
        // Null when Turnstile isn't configured or the widget hasn't
        // solved yet — the backend CaptchaGuard no-ops unless
        // CAPTCHA_ENFORCE=true, so the server rejects only when
        // the ops flag is flipped on.
        captchaToken,
      });
      setAuthToken(response.accessToken);
      // Post-signup walkthrough prompts identity verification while
      // the intent is fresh. "Explorar primeiro" skips to the feed.
      router.push('/auth/welcome');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-8">Criar sua conta</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
            <input
              id="cpf"
              type="text"
              value={cpf}
              onChange={(e) => handleCpfChange(e.target.value)}
              placeholder="000.000.000-00"
              maxLength={14}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
              Data de nascimento
            </label>
            <input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">Você precisa ter 18 anos ou mais.</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-1 text-brand-600 focus:ring-brand-600"
            />
            <span className="text-xs text-gray-600">
              Li e aceito os{' '}
              <Link href="/terms" className="text-brand-600 hover:text-brand-700 underline">
                Termos de Uso
              </Link>{' '}
              e a{' '}
              <Link href="/privacy" className="text-brand-600 hover:text-brand-700 underline">
                Política de Privacidade
              </Link>
            </span>
          </label>

          <TurnstileWidget
            onToken={setCaptchaToken}
            onExpired={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition disabled:opacity-50"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        {/* TODO(Phase 9): Wire Google / Apple OAuth after Google Cloud Console and Apple Developer setup. */}

        <p className="text-sm text-gray-500 text-center mt-6">
          Já tem conta?{' '}
          <Link href="/auth/login" className="text-brand-600 hover:text-brand-700 font-medium">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
