'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface SecurityStatus {
  cpfVerified: boolean;
  twoFaEnabled: boolean;
  twoFaMethod: 'TOTP' | 'SMS';
  twoFaPhoneHint: string | null;
  isContaProtegida: boolean;
  recentLogins: Array<{ platform: string | null; success: boolean; createdAt: string }>;
}

interface TwoFaSetup {
  secret: string;
  qrCodeDataUrl: string;
  otpAuthUrl: string;
}

type Mode = 'idle' | 'totp-setup' | 'sms-phone' | 'sms-code' | 'disable';

export default function SegurancaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // TOTP state
  const [totpSetup, setTotpSetup] = useState<TwoFaSetup | null>(null);
  // Blob URL for the QR code. The API returns it as a data: URL, but the
  // CSP blocks data: in img-src (see apps/web/next.config.mjs), so we
  // convert to a same-origin blob: URL which the CSP does allow.
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!totpSetup?.qrCodeDataUrl) {
      setQrBlobUrl(null);
      return;
    }
    // Decode the data URL manually. fetch(dataUrl) would be blocked by
    // the CSP's connect-src (which also excludes data:), so we parse
    // the base64 payload directly — pure client-side math, no network.
    const dataUrl = totpSetup.qrCodeDataUrl;
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) {
      setQrBlobUrl(null);
      return;
    }
    const header = dataUrl.slice(0, commaIdx);
    const payload = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^data:([^;,]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const isBase64 = header.includes(';base64');
    let url: string | null = null;
    try {
      let blob: Blob;
      if (isBase64) {
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
      } else {
        blob = new Blob([decodeURIComponent(payload)], { type: mime });
      }
      url = URL.createObjectURL(blob);
      setQrBlobUrl(url);
    } catch {
      setQrBlobUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [totpSetup?.qrCodeDataUrl]);

  // SMS state
  const [phoneInput, setPhoneInput] = useState('+55');
  const [smsPhoneHint, setSmsPhoneHint] = useState<string | null>(null);

  // Shared code input
  const [code, setCode] = useState('');

  const flash = (type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 3000);
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

  useEffect(() => { void refresh(); }, [refresh]);

  const resetMode = () => {
    setMode('idle');
    setTotpSetup(null);
    setCode('');
    setPhoneInput('+55');
    setSmsPhoneHint(null);
  };

  // ── TOTP ──────────────────────────────────────────────────────────
  const handleStartTotp = async () => {
    setBusy(true);
    try {
      const data = await apiPost<TwoFaSetup>('/auth/2fa/setup', {});
      setTotpSetup(data);
      setCode('');
      setMode('totp-setup');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Não foi possível iniciar.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmTotp = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await apiPost('/auth/2fa/enable', { token: code });
      resetMode();
      await refresh();
      flash('success', '2FA ativado.');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!totpSetup?.secret) return;
    if (typeof window === 'undefined') return;
    try {
      await window.navigator.clipboard.writeText(totpSetup.secret);
      flash('success', 'Chave copiada.');
    } catch {
      flash('error', 'Não foi possível copiar.');
    }
  };

  // ── SMS ───────────────────────────────────────────────────────────
  const handleStartSms = () => {
    setPhoneInput('+55');
    setCode('');
    setSmsPhoneHint(null);
    setMode('sms-phone');
  };

  const handleSendSms = async () => {
    const phone = phoneInput.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      flash('error', 'Informe o telefone em formato E.164 (ex: +5511999998888).');
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ success: boolean; phoneHint: string }>('/auth/2fa/sms/setup', {
        phone,
      });
      setSmsPhoneHint(res.phoneHint);
      setCode('');
      setMode('sms-code');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Não foi possível enviar o SMS.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSms = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await apiPost('/auth/2fa/sms/enable', { token: code });
      resetMode();
      await refresh();
      flash('success', 'SMS 2FA ativado.');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendSms = async () => {
    setBusy(true);
    try {
      const res = await apiPost<{ success: boolean; phoneHint?: string }>(
        '/auth/2fa/sms/resend',
        {},
      );
      if (res.phoneHint) setSmsPhoneHint(res.phoneHint);
      flash('success', 'Código reenviado.');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Não foi possível reenviar.');
    } finally {
      setBusy(false);
    }
  };

  // ── Disable ───────────────────────────────────────────────────────
  const handleStartDisable = () => {
    setCode('');
    setMode('disable');
  };

  const handleConfirmDisable = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await apiPost('/auth/2fa/disable', { token: code });
      resetMode();
      await refresh();
      flash('success', '2FA desativado.');
    } catch (err) {
      flash('error', err instanceof Error && err.message ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!status) return null;

  const enabled = status.twoFaEnabled;
  const method = status.twoFaMethod;

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
        <h1 className="text-base font-semibold text-gray-900 mb-1">Autenticação em 2 etapas</h1>
        <p className="text-sm text-gray-500 mb-4">
          Escolha app autenticador (TOTP) ou SMS. Você receberá o segundo fator a cada login.
        </p>

        {enabled ? (
          <>
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 mb-4">
              {method === 'SMS'
                ? `SMS ativo${status.twoFaPhoneHint ? ` (${status.twoFaPhoneHint})` : ''}`
                : 'Autenticador ativo'}
            </div>
            <div>
              <button
                type="button"
                onClick={handleStartDisable}
                disabled={busy}
                className="px-5 py-2 border border-red-400 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-40"
              >
                Desativar 2FA
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartTotp}
              disabled={busy}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
            >
              Configurar com app autenticador
            </button>
            <button
              type="button"
              onClick={handleStartSms}
              disabled={busy}
              className="px-5 py-2 border border-brand-500 text-brand-600 text-sm font-medium rounded-lg hover:bg-brand-50 disabled:opacity-40"
            >
              Configurar por SMS
            </button>
          </div>
        )}
      </section>

      {/* Flow-specific modals */}
      {mode !== 'idle' && (
        <section className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              {mode === 'totp-setup' && 'Configurar autenticador'}
              {mode === 'sms-phone' && 'Configurar SMS'}
              {mode === 'sms-code' && 'Confirmar telefone'}
              {mode === 'disable' && 'Desativar 2FA'}
            </h2>
            <button
              type="button"
              onClick={resetMode}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>

          {mode === 'totp-setup' && totpSetup && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                1. Abra seu app autenticador (Google Authenticator, Authy…) e escaneie:
              </p>
              <div className="flex items-center justify-center bg-gray-50 p-4 rounded-lg">
                {qrBlobUrl ? (
                  <img src={qrBlobUrl} alt="QR code 2FA" width={180} height={180} />
                ) : (
                  <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-gray-400">
                    Gerando QR…
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-600">
                Ou informe manualmente:
                <button
                  type="button"
                  onClick={copySecret}
                  className="block w-full mt-2 px-3 py-2 font-mono text-center bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100"
                >
                  {totpSetup.secret}
                </button>
              </div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Código TOTP"
              />
              <div>
                <button
                  type="button"
                  onClick={handleConfirmTotp}
                  disabled={busy || code.length !== 6}
                  className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
                >
                  {busy ? 'Ativando…' : 'Ativar 2FA'}
                </button>
              </div>
            </div>
          )}

          {mode === 'sms-phone' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Informe seu celular em formato E.164 (com DDI):
              </p>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+5511999998888"
                className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Telefone 2FA"
              />
              <div>
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={busy}
                  className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
                >
                  {busy ? 'Enviando…' : 'Enviar código'}
                </button>
              </div>
            </div>
          )}

          {mode === 'sms-code' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Digite o código enviado para {smsPhoneHint ?? 'seu telefone'}. Válido por 5 minutos.
              </p>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Código SMS"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSms}
                  disabled={busy || code.length !== 6}
                  className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40"
                >
                  {busy ? 'Ativando…' : 'Ativar SMS 2FA'}
                </button>
                <button
                  type="button"
                  onClick={handleResendSms}
                  disabled={busy}
                  className="text-sm text-brand-600 font-medium hover:text-brand-700 disabled:opacity-40"
                >
                  {busy ? 'Reenviando…' : 'Reenviar código'}
                </button>
              </div>
            </div>
          )}

          {mode === 'disable' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {method === 'SMS'
                  ? 'Solicite um código SMS e informe-o abaixo.'
                  : 'Informe o código atual do seu app autenticador.'}
              </p>
              {method === 'SMS' && (
                <button
                  type="button"
                  onClick={handleResendSms}
                  disabled={busy}
                  className="px-5 py-2 border border-brand-500 text-brand-600 text-sm font-medium rounded-lg hover:bg-brand-50 disabled:opacity-40"
                >
                  {busy ? 'Enviando…' : 'Enviar código SMS'}
                </button>
              )}
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="block w-40 px-3 py-2 border border-gray-300 rounded-lg text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
                aria-label="Código 2FA"
              />
              <div>
                <button
                  type="button"
                  onClick={handleConfirmDisable}
                  disabled={busy || code.length !== 6}
                  className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40"
                >
                  {busy ? 'Desativando…' : 'Desativar 2FA'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

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
