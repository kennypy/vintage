import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contato',
  description:
    'Canais de contato da Vintage.br — suporte, imprensa, privacidade (DPO) e endereço físico. Atendimento em até 24h úteis.',
  openGraph: {
    title: 'Contato — Vintage.br',
    description: 'Fale com o suporte, imprensa ou DPO da Vintage.br.',
    type: 'website',
  },
  alternates: {
    canonical: '/contato',
  },
};

export default function ContatoPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Contato</h1>

      <p className="text-gray-600 mb-8">
        Estamos aqui para ajudar. Antes de entrar em contato, confira nossa{' '}
        <Link href="/ajuda" className="text-brand-600 underline">
          Central de Ajuda
        </Link>{' '}
        — a maioria das dúvidas já está respondida por lá. O tempo médio de resposta é de{' '}
        <strong>24 horas úteis</strong>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div className="border border-gray-200 rounded-xl p-5 bg-white">
          <h2 className="font-semibold text-gray-900 mb-1">Suporte geral</h2>
          <p className="text-sm text-gray-500 mb-2">
            Dúvidas sobre compras, vendas, pagamentos e envios.
          </p>
          <p className="text-brand-600 text-sm">[SUPPORT_EMAIL_PLACEHOLDER]</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 bg-white">
          <h2 className="font-semibold text-gray-900 mb-1">Privacidade (DPO)</h2>
          <p className="text-sm text-gray-500 mb-2">
            Exercício de direitos LGPD, dúvidas sobre dados pessoais.
          </p>
          <p className="text-brand-600 text-sm">[DPO_EMAIL_PLACEHOLDER]</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 bg-white">
          <h2 className="font-semibold text-gray-900 mb-1">Imprensa</h2>
          <p className="text-sm text-gray-500 mb-2">
            Jornalistas e criadores. Assunto: &ldquo;Imprensa&rdquo;.
          </p>
          <p className="text-brand-600 text-sm">[SUPPORT_EMAIL_PLACEHOLDER]</p>
        </div>

        <div className="border border-gray-200 rounded-xl p-5 bg-white">
          <h2 className="font-semibold text-gray-900 mb-1">Denúncias</h2>
          <p className="text-sm text-gray-500 mb-2">
            Fraude, conteúdo impróprio, violação das Diretrizes.
          </p>
          <p className="text-brand-600 text-sm">[SUPPORT_EMAIL_PLACEHOLDER]</p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6 space-y-4 text-gray-700">
        <div>
          <h2 className="font-semibold text-gray-900 mb-1">Endereço físico</h2>
          <p>
            <strong>[LEGAL_ENTITY_PLACEHOLDER]</strong>
            <br />
            CNPJ: [CNPJ_PLACEHOLDER]
            <br />
            [ADDRESS_PLACEHOLDER]
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-1">Horário de atendimento</h2>
          <p>Segunda a sexta, das 9h às 18h (horário de Brasília).</p>
        </div>

        <div className="text-sm text-gray-500 pt-4">
          <strong>SLA:</strong> respondemos solicitações de suporte em até 24 horas úteis.
          Solicitações relacionadas a disputas em andamento são priorizadas.
        </div>
      </div>
    </div>
  );
}
