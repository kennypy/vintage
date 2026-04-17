import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Diretrizes da Comunidade',
  description:
    'Regras de conduta e lista de itens proibidos na Vintage.br. Zero tolerância a assédio, fraude, falsificações e conteúdo nocivo.',
  openGraph: {
    title: 'Diretrizes da Comunidade — Vintage.br',
    description:
      'Regras de conduta e lista de itens proibidos na Vintage.br.',
    type: 'article',
  },
  alternates: {
    canonical: '/diretrizes-comunidade',
  },
};

export default function DiretrizesComunidadePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Diretrizes da Comunidade</h1>
      <p className="text-sm text-gray-500 mb-8">
        Última atualização: 16 de abril de 2026
      </p>

      <article className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <p>
            A Vintage.br é uma comunidade construída com base em confiança, respeito e
            sustentabilidade. Estas Diretrizes se aplicam a todos os usuários e têm{' '}
            <strong>zero tolerância</strong> a comportamentos abusivos, fraudulentos ou
            ilegais. O descumprimento pode resultar em remoção de anúncios, suspensão ou
            banimento permanente.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Zero Tolerância</h2>
          <p>Não aceitamos, em nenhuma hipótese:</p>
          <ul className="list-disc pl-6">
            <li>Assédio, intimidação, ameaças ou bullying;</li>
            <li>Fraude, estelionato ou tentativa de enganar outros usuários;</li>
            <li>Produtos falsificados vendidos como originais;</li>
            <li>Itens perigosos ou que coloquem a segurança de alguém em risco;</li>
            <li>Conteúdo sexual explícito ou pornografia;</li>
            <li>Discurso de ódio, racismo, LGBTfobia, xenofobia, capacitismo ou misoginia;</li>
            <li>Incitação à violência, autoflagelação ou terrorismo.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Itens Proibidos</h2>
          <p>É terminantemente proibido anunciar, oferecer, comercializar ou tentar vender:</p>
          <ul className="list-disc pl-6">
            <li>Produtos <strong>falsificados, réplicas e imitações</strong> vendidos como originais;</li>
            <li>Drogas ilícitas, entorpecentes, psicoativos e parafernália relacionada;</li>
            <li>Armas de fogo, armas brancas, munição, coletes balísticos ou equipamentos táticos;</li>
            <li>Equipamentos de segurança usados (capacetes, coletes, cadeirinhas infantis) com risco à segurança;</li>
            <li>Animais vivos, partes de animais em extinção, taxidermia ilegal;</li>
            <li>Alimentos perecíveis, bebidas alcoólicas sem registro ou produtos ingeríveis caseiros;</li>
            <li>Medicamentos (com ou sem receita), suplementos não regulados, cosméticos manipulados sem registro;</li>
            <li>Pornografia, conteúdo sexual explícito ou material adulto físico/digital;</li>
            <li>Itens roubados, furtados ou suspeitos de origem ilícita;</li>
            <li>Ingressos (shows, eventos, viagens) e vouchers resgatáveis;</li>
            <li>Software pirata, mídias físicas pirateadas, chaves de ativação não autorizadas, contas de jogos/streaming;</li>
            <li>Dispositivos de burla (chips clonados, jammers, skimmers, cartões pré-pagos de terceiros);</li>
            <li>Itens que contenham dados pessoais de terceiros (cartões de memória, HDs, smartphones não formatados);</li>
            <li>Produtos de tabaco, narguilé, cigarros eletrônicos e vapes;</li>
            <li>Serviços de qualquer natureza (a Vintage.br é um marketplace de produtos físicos);</li>
            <li>Partes do corpo humano, fluidos ou materiais biológicos;</li>
            <li>Materiais combustíveis, inflamáveis, radioativos ou tóxicos;</li>
            <li>Itens culturais protegidos, antiguidades ilegais de exportação, fósseis e bens tombados.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Comportamento Proibido</h2>
          <ul className="list-disc pl-6">
            <li>Assédio e ameaças por mensagens, avaliações ou qualquer canal da plataforma;</li>
            <li>Discurso de ódio ou preconceito em anúncios, mensagens ou perfil;</li>
            <li>Tentar negociar fora da plataforma para burlar a Proteção ao Comprador;</li>
            <li>Criar <em>aliases</em>, perfis fake ou <em>sockpuppet accounts</em>;</li>
            <li>Ofertas falsas, manipulação de preços ou uso coordenado para distorcer resultados;</li>
            <li>Manipulação de avaliações (auto-avaliações, <em>review bombing</em>, compra de avaliações);</li>
            <li>Spam, propaganda não solicitada ou encaminhamento a sites externos;</li>
            <li>Solicitação de dados pessoais sensíveis fora do necessário para a transação.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Se Você For Denunciado</h2>
          <p>
            Todas as denúncias são analisadas em até <strong>24 horas úteis</strong>. Dependendo
            da gravidade, as consequências podem ser:
          </p>
          <ul className="list-disc pl-6">
            <li><strong>Aviso:</strong> notificação de conduta em desacordo com estas Diretrizes;</li>
            <li><strong>Remoção do anúncio:</strong> o item é retirado e o vendedor é avisado;</li>
            <li><strong>Suspensão temporária:</strong> acesso bloqueado por período determinado;</li>
            <li><strong>Banimento permanente:</strong> encerramento definitivo da conta em casos graves ou reincidência;</li>
            <li><strong>Comunicação às autoridades:</strong> em casos que envolvam crime, cooperamos com as autoridades competentes.</li>
          </ul>
          <p>Você tem direito de recorrer da decisão em até 7 dias, enviando um e-mail ao suporte com as provas que julgar pertinentes.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Como Denunciar</h2>
          <p>Se você identificar alguma violação, denuncie pelos canais:</p>
          <ul className="list-disc pl-6">
            <li>Botão <strong>&ldquo;Denunciar&rdquo;</strong> nos anúncios, perfis e mensagens dentro do aplicativo;</li>
            <li>
              E-mail:{' '}
              <span className="text-brand-600">[SUPPORT_EMAIL_PLACEHOLDER]</span>;
            </li>
            <li>
              Para denúncias envolvendo dados pessoais, contate o DPO em{' '}
              <span className="text-brand-600">[DPO_EMAIL_PLACEHOLDER]</span>.
            </li>
          </ul>
          <p>
            Denúncias podem ser feitas de forma anônima. Tratamos todas com seriedade e
            confidencialidade.
          </p>
        </section>

        <section>
          <p>
            Para informações adicionais, consulte nossos{' '}
            <Link href="/termos" className="text-brand-600 underline">
              Termos de Uso
            </Link>{' '}
            e nossa{' '}
            <Link href="/privacidade" className="text-brand-600 underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        <p className="text-sm text-gray-500 pt-6 border-t border-gray-200">
          Última atualização: 16 de abril de 2026
        </p>
      </article>
    </div>
  );
}
