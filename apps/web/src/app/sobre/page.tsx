import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sobre a Vintage.br',
  description:
    'Conheça a Vintage.br — marketplace C2C de moda secondhand do Brasil. Missão, equipe, imprensa e carreiras.',
  openGraph: {
    title: 'Sobre a Vintage.br',
    description:
      'Marketplace C2C de moda secondhand do Brasil com PIX e escrow.',
    type: 'website',
  },
  alternates: {
    canonical: '/sobre',
  },
};

export default function SobrePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Sobre a Vintage.br</h1>

      <article className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Nossa Missão</h2>
          <p>
            Acreditamos em uma moda mais consciente, acessível e circular. A Vintage.br
            existe para prolongar a vida útil de roupas, calçados e acessórios, reduzir o
            desperdício têxtil e permitir que brasileiros comprem e vendam moda com segurança.
            Cada peça que muda de dono é um pequeno passo contra o fast fashion e a favor da
            economia circular.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">O Que Oferecemos</h2>
          <ul className="list-disc pl-6">
            <li>
              <strong>Marketplace C2C seguro:</strong> conectamos pessoas físicas com
              Proteção ao Comprador em toda transação.
            </li>
            <li>
              <strong>Pagamento PIX:</strong> rápido, barato e universal no Brasil, integrado
              ao Mercado Pago.
            </li>
            <li>
              <strong>Escrow:</strong> o dinheiro fica retido até a confirmação do
              recebimento — segurança para comprador e vendedor.
            </li>
            <li>
              <strong>Logística integrada:</strong> etiqueta pré-paga e rastreamento com
              Correios e Jadlog.
            </li>
            <li>
              <strong>Verificação de autenticidade:</strong> itens selecionados passam por
              autenticação manual antes do envio.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Nosso Time</h2>
          <p>
            Somos uma equipe pequena e dedicada de pessoas apaixonadas por moda e
            tecnologia, trabalhando para oferecer a melhor experiência possível. [PLACEHOLDER:
            bio do time a ser preenchida.]
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Para Imprensa</h2>
          <p>
            Jornalistas e criadores de conteúdo podem entrar em contato pelo e-mail{' '}
            <span className="text-brand-600">[SUPPORT_EMAIL_PLACEHOLDER]</span> (assunto:
            &ldquo;Imprensa&rdquo;). Respondemos solicitações de entrevistas, dados e materiais
            de apoio em até 48h úteis.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Carreiras</h2>
          <p>
            Estamos sempre em busca de talentos para se juntar à Vintage.br. Acompanhe
            nossas vagas abertas ou envie um e-mail com seu currículo para{' '}
            <span className="text-brand-600">[SUPPORT_EMAIL_PLACEHOLDER]</span> (assunto:
            &ldquo;Carreiras&rdquo;).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Entidade Legal</h2>
          <p>
            A plataforma é operada por <strong>[LEGAL_ENTITY_PLACEHOLDER]</strong>, CNPJ{' '}
            <strong>[CNPJ_PLACEHOLDER]</strong>, com sede em{' '}
            <strong>[ADDRESS_PLACEHOLDER]</strong>.
          </p>
        </section>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link
            href="/listings"
            className="inline-block px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 transition text-center"
          >
            Explorar peças
          </Link>
          <Link
            href="/sell"
            className="inline-block px-6 py-3 border-2 border-brand-600 text-brand-600 rounded-xl font-medium hover:bg-brand-50 transition text-center"
          >
            Começar a vender
          </Link>
        </div>
      </article>
    </div>
  );
}
