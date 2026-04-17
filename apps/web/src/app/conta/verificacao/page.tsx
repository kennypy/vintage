'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, apiPostForm } from '@/lib/api';

interface VerificationStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  cpfVerified: boolean;
  identityStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  identitySubmittedAt?: string;
}

const STATUS_PT: Record<string, string> = {
  NONE: 'Não enviado',
  PENDING: 'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
};

const STATUS_COLORS: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-600',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function VerificacaoPage() {
  const router = useRouter();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('vintage_token') : null;
    if (!token) {
      router.push('/auth/login');
      return;
    }
    apiGet<VerificationStatus>('/users/me/verification')
      .then((data) => setStatus(data))
      .catch(() => setStatus({ emailVerified: false, phoneVerified: false, cpfVerified: false, identityStatus: 'NONE' }))
      .finally(() => setLoading(false));
  }, [router]);

  const handleRequestEmailVerify = async () => {
    try {
      await apiPost('/auth/resend-verification');
      setNotice('E-mail de verificação enviado.');
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice('Não foi possível reenviar o e-mail.');
      setTimeout(() => setNotice(null), 2500);
    }
  };

  const handleIdentityUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiPostForm('/users/me/identity-document', formData);
      setNotice('Documento enviado. Analisaremos em até 48h.');
      setStatus((prev) => prev ? { ...prev, identityStatus: 'PENDING', identitySubmittedAt: new Date().toISOString() } : prev);
      setTimeout(() => setNotice(null), 3000);
    } catch {
      setNotice('Falha ao enviar documento. Tente novamente.');
      setTimeout(() => setNotice(null), 2500);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-64 bg-white border border-gray-200 rounded-xl" />;
  }
  if (!status) return null;

  const identity = status.identityStatus ?? 'NONE';

  return (
    <div className="space-y-4">
      {notice && (
        <div className="p-3 rounded-xl text-sm bg-blue-50 border border-blue-200 text-blue-700">
          {notice}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Verificações</h2>
        <div className="space-y-3">
          <Row
            label="E-mail"
            verified={status.emailVerified}
            action={!status.emailVerified ? <button type="button" onClick={handleRequestEmailVerify} className="text-sm text-brand-600 hover:text-brand-700 font-medium">Reenviar e-mail</button> : null}
          />
          <Row label="Telefone" verified={status.phoneVerified} />
          <Row label="CPF" verified={status.cpfVerified} />
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Documento de identidade</h2>
        <p className="text-sm text-gray-500 mb-4">
          Envie uma foto clara do seu RG ou CNH. Isso aumenta a confiança dos compradores e libera saques maiores.
        </p>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-700">Status</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[identity]}`}>
            {STATUS_PT[identity]}
          </span>
        </div>

        {identity !== 'APPROVED' && (
          <label className="block w-full py-3 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition text-center cursor-pointer disabled:opacity-50">
            {uploading ? 'Enviando…' : identity === 'REJECTED' ? 'Reenviar documento' : 'Enviar documento'}
            <input
              type="file"
              accept="image/*,application/pdf"
              hidden
              disabled={uploading}
              onChange={handleIdentityUpload}
            />
          </label>
        )}

        {identity === 'APPROVED' && (
          <p className="text-sm text-green-700">Identidade verificada. Nada mais a fazer.</p>
        )}
      </section>
    </div>
  );
}

function Row({ label, verified, action }: { label: string; verified: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{verified ? 'Verificado' : 'Não verificado'}</p>
      </div>
      {verified ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">Verificado</span>
      ) : (
        action ?? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Pendente</span>
      )}
    </div>
  );
}
