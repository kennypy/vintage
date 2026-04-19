'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiDelete, apiPost, clearAuthToken } from '@/lib/api';

/**
 * LGPD-compliant account deletion flow. Closes the parity gap called
 * out in the audit — the API's DELETE /users/me has existed; both
 * clients were missing a UI for it.
 *
 * Flow
 *   1. User types "EXCLUIR" into a confirmation field (prevents
 *      muscle-memory clicks).
 *   2. Password-auth users enter their current password.
 *      OAuth-only users click "Enviar código por email", receive a
 *      6-digit code, and type it in.
 *   3. Confirm → DELETE /users/me → token cleared, redirected home.
 *
 * Server-side (users.service.ts::deleteAccount) anonymises the row
 * and sets deletedAt; the 30-day hard-delete cron then sweeps the
 * anonymised row per LGPD Art. 18 retention rules.
 */
export default function DeletarContaPage() {
  const router = useRouter();
  const [method, setMethod] = useState<'password' | 'emailCode'>('password');
  const [password, setPassword] = useState('');
  const [confirmToken, setConfirmToken] = useState('');
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const confirmationArmed = typedConfirmation === 'EXCLUIR';

  const requestCode = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiPost('/users/me/delete-confirmation');
      setCodeSent(true);
      setNotice('Código enviado para seu email. Verifique a caixa de entrada e o spam.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmationArmed) {
      setError('Digite EXCLUIR em maiúsculas para confirmar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, string> = {};
      if (method === 'password' && password) payload.password = password;
      if (method === 'emailCode' && confirmToken) payload.confirmToken = confirmToken;
      if (reason.trim()) payload.reason = reason.trim().slice(0, 500);

      await apiDelete('/users/me', payload);
      clearAuthToken();
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a conta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Excluir conta</h1>
      <p className="text-sm text-gray-600 mb-6">
        Esta ação inicia a exclusão permanente da sua conta. Seus dados são
        anonimizados imediatamente e removidos em definitivo após 30 dias
        (prazo legal LGPD). Pedidos em andamento seguem seu curso.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        <strong>O que vai acontecer:</strong>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li>Seu perfil deixa de aparecer para outros usuários</li>
          <li>Seus anúncios ativos são arquivados</li>
          <li>Seus dados pessoais (CPF, email, telefone) são apagados</li>
          <li>Pagamentos recebidos e notas fiscais permanecem pelo prazo legal (5 anos)</li>
          <li>Quer uma cópia antes? Acesse <Link href="/conta/configuracoes" className="underline">Configurações</Link> → Exportar dados</li>
        </ul>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          {notice}
        </div>
      )}

      <div className="space-y-4">
        <fieldset className="border border-gray-200 rounded-xl p-4">
          <legend className="px-2 text-sm font-medium text-gray-700">Método de verificação</legend>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === 'password'}
                onChange={() => setMethod('password')}
              />
              Senha
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={method === 'emailCode'}
                onChange={() => setMethod('emailCode')}
              />
              Código por email (Google/Apple login)
            </label>
          </div>
        </fieldset>

        {method === 'password' && (
          <div>
            <label htmlFor="pw" className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
            <input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
              autoComplete="current-password"
            />
          </div>
        )}

        {method === 'emailCode' && (
          <div className="space-y-2">
            {!codeSent ? (
              <button
                type="button"
                onClick={requestCode}
                disabled={busy}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-sm rounded-lg disabled:opacity-50"
              >
                {busy ? 'Enviando…' : 'Enviar código por email'}
              </button>
            ) : (
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Código de 6 dígitos</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmToken}
                  onChange={(e) => setConfirmToken(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
            Motivo (opcional)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
            placeholder="Nos ajuda a melhorar. Nada aqui é obrigatório."
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
            Digite <strong>EXCLUIR</strong> para confirmar
          </label>
          <input
            id="confirm"
            type="text"
            value={typedConfirmation}
            onChange={(e) => setTypedConfirmation(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!confirmationArmed || busy}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Excluindo…' : 'Excluir minha conta'}
        </button>

        <Link href="/conta" className="block text-center text-sm text-gray-500 hover:text-gray-700">
          Cancelar e voltar
        </Link>
      </div>
    </div>
  );
}
