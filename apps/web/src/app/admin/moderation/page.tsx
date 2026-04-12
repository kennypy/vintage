'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface Report {
  id: string;
  reporterId: string;
  reporterName?: string;
  targetType: 'listing' | 'user';
  targetId: string;
  targetTitle?: string;
  reason: string;
  description?: string;
  status: string;
  createdAt: string;
}

interface PaginatedReports {
  data: Report[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_LABELS: Record<string, string> = {
  SUSPEND_LISTING: 'Suspender anúncio',
  BAN_USER: 'Banir usuário',
  DISMISS: 'Ignorar denúncia',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<PaginatedReports>(
        `/moderation/reports?page=${page}&pageSize=20`,
      );
      setReports(data.data);
      setTotal(data.total);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleAction = async (reportId: string, action: string) => {
    setProcessing(reportId);
    try {
      await apiPost(`/moderation/reports/${reportId}/review`, { action });
      await fetchReports();
    } catch {
      // keep state
    } finally {
      setProcessing(null);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Moderação de conteúdo</h1>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando denúncias...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            Nenhuma denúncia pendente. Tudo limpo!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="px-4 py-3 font-medium text-gray-600">Motivo</th>
                <th className="px-4 py-3 font-medium text-gray-600">Descrição</th>
                <th className="px-4 py-3 font-medium text-gray-600">Data</th>
                <th className="px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        report.targetType === 'listing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {report.targetType === 'listing' ? 'Anúncio' : 'Usuário'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{report.reason}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {report.description || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(report.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {report.targetType === 'listing' && (
                        <button
                          onClick={() => handleAction(report.id, 'SUSPEND_LISTING')}
                          disabled={processing === report.id}
                          className="text-xs px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                        >
                          {ACTION_LABELS.SUSPEND_LISTING}
                        </button>
                      )}
                      <button
                        onClick={() => handleAction(report.id, 'BAN_USER')}
                        disabled={processing === report.id}
                        className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition disabled:opacity-50"
                      >
                        {ACTION_LABELS.BAN_USER}
                      </button>
                      <button
                        onClick={() => handleAction(report.id, 'DISMISS')}
                        disabled={processing === report.id}
                        className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
                      >
                        {ACTION_LABELS.DISMISS}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              {total} denúncia{total !== 1 ? 's' : ''} pendente{total !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
