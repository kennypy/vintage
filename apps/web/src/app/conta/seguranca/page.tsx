'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface SecurityStatus {
  cpfVerified: boolean;
  twoFaEnabled: boolean;
  isContaProtegida: boolean;
  recentLogins: Array<{ platform: string | null; success: boolean; createdAt: string }>;
}

interface TwoFaSetup {
  secret: string;
  qrCodeDataUrl: string;
  otpAuthUrl: string;
}

export default function SegurancaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<TwoFaSetup | null>(null);
  const [token, setToken] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const flash = (type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 2500);
  };

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<SecurityStatus>('/auth/security-status');
      setStatus(data);
    } catch {
      router.push('/auth/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleStartSetup = async () => {
    setBusy(true);
    try {
      const data = await apiPost<TwoFaSetup>('/auth/2fa/setup', {});
      setSetup(data);
      setToken('');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Não foi possível iniciar a configuração.';
      flash('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnable = async () => {
    if (token.length !== 6) {
      flash('error', 'O código deve ter 6 dígitos.');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/auth/2fa/enable', { token });
      setSetup(null);
      setToken('');
      await refresh();
      flash('success', '2FA ativado. Guarde bem seu app autenticador.');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Código inválido.';
      flash('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (disableToken.length !== 6) {
      flash('error', 'Informe o código atual do autenticador (6 dígitos).');
      return;
    }
    setBusy(true);
    try {
      await apiPost('/auth/2fa/disable', { token: disableToken });
      setDisableToken('');
      await refresh();
      flash('success', '2FA desativado.');
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : 'Código inválido.';
      flash('error', msg);
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!setup?.secret) return;
    if (typeof window === 'undefined') return;
    try {
      await window.navigator.clipboard.writeText(setup.secret);
      flash('success', 'Chave copiada.');
    } catch {
      flash('error', 'Não foi possível copiar.');
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!status) return null;

  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={`p-3 rounded-xl text-sm border ${
            notice.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {notice.msg}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-base font-semibold text-gray-900 mb-1">Autenticação em 2 fatores</h1>
        <p className="text-sm text-gray-500 mb-4">
          Protege sua conta exigindo um código do seu app autenticador a cada login.
        </p>

        {status.twoFaEnabled ? (
          <>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 mb-4">
              {status.isContaProtegida ? 'Conta protegida ativa' : '2FA ativo'}
            </div>
            <div className="space-y-3">
              <label htmlFor="disableToken" className="block text-sm font-medium text-gray-700">
                Para desativar, informe o código atual do seu autenticador:
              </label>
              <input
                id="disableToken"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={disableToken}
                onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="123456"
              />
              <div>
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={busy || disableToken.length !== 6}
                  className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40"
                >
                  {busy ? 'Desativando…' : 'Desativar 2FA'}
                </button>
              </div>
            </div>
          </>
        ) : !setup ? (
          <button
            type="button"
            onClick={handleStartSetup}
            disabled={busy}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? 'Preparando…' : 'Configurar 2FA'}
          </button>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              1. Abra seu app autenticador (Google Authenticator, Authy, 1Password…) e escaneie o QR code abaixo:
            </p>
            <div className="flex items-center justify-center bg-gray-50 p-4 rounded-lg">
              {/* Data URL QR — render via plain img so we don't require next/image remote config */}
              <img src={setup.qrCodeDataUrl} alt="QR code 2FA" width={180} height={180} />
            </div>
            <div className="text-sm text-gray-600">
              Ou informe manualmente esta chave:
              <button
                type="button"
                onClick={copySecret}
                className="block w-full mt-2 px-3 py-2 font-mono text-center bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
              >
                {setup.secret}
              </button>
            </div>
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                2. Informe o código de 6 dígitos gerado pelo app:
              </label>
              <input
                id="token"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="123456"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmEnable}
                disabled={busy || token.length !== 6}
                className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
              >
                {busy ? 'Ativando…' : 'Ativar 2FA'}
              </button>
              <button
                type="button"
                onClick={() => { setSetup(null); setToken(''); }}
                className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Acessos recentes</h2>
        {status.recentLogins.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum acesso registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {status.recentLogins.map((ev, i) => (
              <li key={i} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {ev.platform === 'ios' ? 'iPhone' : ev.platform === 'android' ? 'Android' : ev.platform === 'web' ? 'Web' : 'Desconhecido'}
                  </p>
                  <p className="text-xs text-gray-500">{new Date(ev.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    ev.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {ev.success ? 'OK' : 'Falhou'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

