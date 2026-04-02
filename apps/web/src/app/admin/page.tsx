'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface Overview {
  totalUsers: number;
  bannedUsers: number;
  totalListings: number;
  activeListings: number;
  completedOrders: number;
  pendingOrders: number;
  totalRevenueBrl: number;
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<Overview>('/admin/analytics/overview')
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-red-600">Erro: {error}</p>;
  }

  if (!data) {
    return <p className="text-gray-500">Carregando...</p>;
  }

  const cards = [
    { label: 'Usuarios', value: data.totalUsers },
    { label: 'Banidos', value: data.bannedUsers },
    { label: 'Anuncios Ativos', value: data.activeListings },
    { label: 'Total Anuncios', value: data.totalListings },
    { label: 'Vendas Concluidas', value: data.completedOrders },
    { label: 'Pedidos Pendentes', value: data.pendingOrders },
    { label: 'Receita Total', value: formatBrl(data.totalRevenueBrl) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Painel Administrativo</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <p className="text-sm text-gray-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
