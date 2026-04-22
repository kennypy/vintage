'use client';

import { useState } from 'react';
import { useApiQuery } from '@/lib/useApiQuery';

interface ReferralEntry {
  id: string;
  refereeName: string;
  rewardedAt: string | null;
  invitedAt: string;
}

interface MyReferrals {
  code: string;
  rewardAmountBrl: number;
  totalRewardsBrl: number;
  totalInvited: number;
  totalRewarded: number;
  referrals: ReferralEntry[];
}

const formatBrl = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReferralsPage() {
  const { data, loading, error } = useApiQuery<MyReferrals>('/referrals/me', {
    requireAuth: true,
  });
  const [copied, setCopied] = useState(false);

  if (loading) return <p className="p-6 text-gray-500">Carregando…</p>;
  if (error) return <p className="p-6 text-sm text-red-600" role="alert">{error}</p>;
  if (!data) return <p className="p-6 text-gray-500">Não foi possível carregar suas indicações.</p>;

  const copy = async () => {
    try {
      await window.navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const shareMessage = `Use meu código de indicação ${data.code} para ganhar R$ ${formatBrl(data.rewardAmountBrl)} na sua primeira compra no Vintage.br.`;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">
        Convide amigas, ganhe R$ {formatBrl(data.rewardAmountBrl)}
      </h1>
      <p className="mt-2 text-gray-600">
        Vocês duas ganham R$ {formatBrl(data.rewardAmountBrl)} de crédito quando a sua convidada faz a primeira compra.
      </p>

      <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-gray-500">Seu código</p>
        <p className="mt-2 text-4xl font-extrabold tracking-widest text-brand-600">{data.code}</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={copy}
            className="rounded-lg border border-brand-600 px-4 py-2 font-semibold text-brand-600 hover:bg-brand-50"
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMessage)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
          >
            Compartilhar
          </a>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Convidadas" value={data.totalInvited.toString()} />
        <Stat label="Recompensadas" value={data.totalRewarded.toString()} />
        <Stat label="Ganhos" value={`R$ ${formatBrl(data.totalRewardsBrl)}`} />
      </div>

      <h2 className="mt-8 mb-3 text-lg font-bold">Histórico</h2>
      {data.referrals.length === 0 ? (
        <p className="text-center text-gray-500">Você ainda não convidou ninguém.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-xl bg-white">
          {data.referrals.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-4">
              <span>{r.refereeName}</span>
              <span
                className={
                  r.rewardedAt
                    ? 'text-green-600 font-semibold'
                    : 'text-gray-500'
                }
              >
                {r.rewardedAt ? `✓ R$ ${formatBrl(data.rewardAmountBrl)}` : 'Pendente'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3 text-center shadow-sm">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
