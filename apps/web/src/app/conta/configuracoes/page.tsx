'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  twoFaEnabled?: boolean;
  language?: string;
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [language, setLanguage] = useState('pt-BR');
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);

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
    Promise.all([
      apiGet<UserProfile>('/users/me'),
      apiGet<{ twoFaEnabled: boolean }>('/auth/security-status').catch(() => null),
    ])
      .then(([profile, sec]) => {
        setUser(profile);
        setLanguage(profile.language ?? 'pt-BR');
        setTwoFaEnabled(!!(sec?.twoFaEnabled ?? profile.twoFaEnabled));
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
      // Persisted client-side only for now — backend does not accept a language field.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('vintage_language', code);
      }
      flash('success', 'Idioma atualizado.');
    } catch {
      setLanguage(prev);
      flash('error', 'Não foi possível atualizar o idioma.');
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
        <h2 className="text-base font-semibold text-gray-900 mb-1">Conta</h2>
        <p className="text-sm text-gray-500 mb-4">Seu email atual: <strong>{user.email}</strong></p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/conta/perfil"
            className="inline-block px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            Editar perfil
          </Link>
          <Link
            href="/conta/alterar-email"
            className="inline-block px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Alterar email
          </Link>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Autenticação em 2 fatores</h2>
            <p className="text-sm text-gray-500">
              {twoFaEnabled
                ? 'Ativa — exige um código do seu app autenticador a cada login.'
                : 'Adicione uma camada extra de segurança à sua conta.'}
            </p>
          </div>
          {twoFaEnabled ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 whitespace-nowrap">
              Ativo
            </span>
          ) : (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 whitespace-nowrap">
              Desativado
            </span>
          )}
        </div>
        <div className="mt-4">
          <Link
            href="/conta/seguranca"
            className="inline-block px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
          >
            {twoFaEnabled ? 'Gerenciar 2FA' : 'Configurar 2FA'}
          </Link>
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

      <section className="bg-white border border-red-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-red-900 mb-2">Zona perigosa</h2>
        <p className="text-sm text-gray-600 mb-4">
          Exclusão permanente da sua conta. Seus dados pessoais são
          anonimizados imediatamente e removidos em definitivo após 30 dias,
          conforme a LGPD.
        </p>
        <Link
          href="/conta/deletar-conta"
          className="inline-block px-5 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50"
        >
          Excluir minha conta
        </Link>
      </section>
    </div>
  );
}
