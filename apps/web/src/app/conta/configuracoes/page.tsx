'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  twoFAEnabled?: boolean;
  language?: string;
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-brand-600' : 'bg-gray-200'
      }`}
      aria-pressed={value}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [language, setLanguage] = useState('pt-BR');
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<UserProfile>('/users/me')
      .then((data) => {
        setUser(data);
        setLanguage(data.language ?? 'pt-BR');
        setTwoFAEnabled(!!data.twoFAEnabled);
      })
      .catch(() => {
        router.push('/auth/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const flash = (type: 'success' | 'error', msg: string) => {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 2500);
  };

  const saveLanguage = async (code: string) => {
    const prev = language;
    setLanguage(code);
    try {
      await apiPatch('/users/me', { language: code });
      flash('success', 'Idioma atualizado.');
    } catch {
      setLanguage(prev);
      flash('error', 'Não foi possível atualizar o idioma.');
    }
  };

  const toggle2FA = async (next: boolean) => {
    const prev = twoFAEnabled;
    setTwoFAEnabled(next);
    try {
      await apiPatch('/users/me', { twoFAEnabled: next });
      flash('success', next ? '2FA ativada.' : '2FA desativada.');
    } catch {
      setTwoFAEnabled(prev);
      flash('error', 'Não foi possível atualizar a autenticação em 2 fatores.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    if (newPassword !== confirmPassword) {
      flash('error', 'As senhas não coincidem.');
      return;
    }
    setSavingPassword(true);
    try {
      await apiPost('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      flash('success', 'Senha alterada com sucesso.');
    } catch {
      flash('error', 'Não foi possível alterar a senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!user) return null;

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
        <h2 className="text-base font-semibold text-gray-900 mb-4">Idioma</h2>
        <div className="space-y-2">
          {[
            { code: 'pt-BR', label: 'Português (Brasil)' },
            { code: 'en-US', label: 'English (US)' },
          ].map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => saveLanguage(lang.code)}
              className={`w-full flex items-center justify-between px-3 py-2.5 border rounded-lg text-sm transition ${
                language === lang.code
                  ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{lang.label}</span>
              {language === lang.code && <span className="text-xs">Selecionado</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Autenticação em 2 fatores</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">2FA</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {twoFAEnabled
                ? 'Ativa — use um app autenticador para entrar.'
                : 'Adiciona uma camada extra de segurança à sua conta.'}
            </p>
          </div>
          <Toggle value={twoFAEnabled} onChange={toggle2FA} />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Alterar senha</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label htmlFor="curpass" className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
            <input
              id="curpass"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="newpass" className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
            <input
              id="newpass"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="confirmpass" className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
            <input
              id="confirmpass"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition disabled:opacity-40"
          >
            {savingPassword ? 'Salvando…' : 'Atualizar senha'}
          </button>
        </form>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Preferências de notificação</h2>
        <p className="text-sm text-gray-500">
          Gerencie canais e categorias de notificação na{' '}
          <a href="/notifications" className="text-brand-600 hover:text-brand-700 font-medium underline">
            aba de preferências
          </a>{' '}
          dentro de Notificações.
        </p>
      </section>
    </div>
  );
}
