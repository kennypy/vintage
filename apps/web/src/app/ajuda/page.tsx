import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Central de Ajuda',
  description:
    'Central de Ajuda da Vintage.br. Respostas para dúvidas sobre cadastro, compras, vendas, pagamentos, envio, devoluções, segurança e contato.',
  openGraph: {
    title: 'Central de Ajuda — Vintage.br',
    description:
      'Respostas para dúvidas sobre cadastro, compras, vendas, pagamentos, envio e segurança.',
    type: 'website',
  },
  alternates: {
    canonical: '/ajuda',
  },
};

interface Faq {
  q: string;
  a: string;
}

interface Section {
  id: string;
  title: string;
  items: Faq[];
}

const SECTIONS: Section[] = [
  {
    id: 'comecando',
    title: '1. Começando',
    items: [
      {
        q: 'Como me cadastro na Vintage.br?',
        a: 'Baixe o app ou acesse vintage.br, clique em "Criar conta", informe nome, e-mail, CPF e senha. Você precisa ter 18 anos ou mais.',
      },
      {
        q: 'Como verifico minha conta?',
        a: 'Acesse Perfil > Verificação. Confirme seu e-mail, telefone e CPF. A verificação aumenta a confiança dos compradores e é obrigatória para saque.',
      },
      {
        q: 'Esqueci minha senha. O que faço?',
        a: 'Na tela de login, clique em "Esqueci minha senha" e siga as instruções enviadas ao e-mail cadastrado.',
      },
      {
        q: 'Posso ter mais de uma conta?',
        a: 'Não. Cada pessoa pode ter apenas uma conta. Contas duplicadas são suspensas.',
      },
    ],
  },
  {
    id: 'vendendo',
    title: '2. Vendendo',
    items: [
      {
        q: 'Como criar um anúncio?',
        a: 'Clique em "Vender", tire fotos do item (mínimo 4, até 20), preencha título, descrição, preço, marca, tamanho e condição e publique.',
      },
      {
        q: 'Como definir um bom preço?',
        a: 'Pesquise itens similares, considere condição, marca e sazonalidade. Preço justo acelera a venda.',
      },
      {
        q: 'Como tirar boas fotos?',
        a: 'Luz natural, fundo neutro, mostre frente, costas, etiqueta e detalhes. Foto de qualidade aumenta suas chances de venda.',
      },
      {
        q: 'Quanto a Vintage.br cobra do vendedor?',
        a: 'Não cobramos taxa do vendedor. A taxa de serviço é paga pelo comprador.',
      },
      {
        q: 'Como envio o item vendido?',
        a: 'Gere a etiqueta pré-paga no app, embale o item e leve ao ponto de postagem (Correios ou Jadlog). Você tem 5 dias úteis para postar.',
      },
    ],
  },
  {
    id: 'comprando',
    title: '3. Comprando',
    items: [
      {
        q: 'Como faço uma oferta?',
        a: 'Na página do item, clique em "Fazer oferta" e proponha um valor. O vendedor tem 48h para aceitar, recusar ou contraoferecer.',
      },
      {
        q: 'Como pago?',
        a: 'Pagamento via PIX, processado pelo Mercado Pago. O valor fica retido (escrow) até você confirmar o recebimento.',
      },
      {
        q: 'Como acompanho meu pedido?',
        a: 'Em "Meus pedidos" você vê o status e o código de rastreio assim que o vendedor postar o item.',
      },
      {
        q: 'Quanto tempo demora para chegar?',
        a: 'Depende da transportadora e distância. PAC: 5-12 dias úteis; SEDEX: 1-3 dias úteis; Jadlog: similar.',
      },
    ],
  },
  {
    id: 'pagamentos',
    title: '4. Pagamentos e Carteira',
    items: [
      {
        q: 'Como saco o saldo da minha carteira?',
        a: 'Vá em Carteira > Sacar, informe a chave PIX e confirme. O saque é processado em até 1 dia útil. Saldo mínimo: R$10,00.',
      },
      {
        q: 'Quanto a Vintage.br cobra de taxa?',
        a: 'Taxa de serviço (Proteção ao Comprador) paga pelo comprador no checkout. O vendedor não paga taxa sobre o valor da venda.',
      },
      {
        q: 'Quando recebo o valor da venda?',
        a: 'Após a confirmação de recebimento pelo comprador (ou automaticamente após o prazo), o valor é creditado na sua carteira.',
      },
      {
        q: 'Como funciona o estorno?',
        a: 'Em caso de disputa a favor do comprador, o valor é estornado integralmente via PIX ou crédito na carteira.',
      },
    ],
  },
  {
    id: 'envio',
    title: '5. Envio e Entrega',
    items: [
      {
        q: 'Como gero a etiqueta de envio?',
        a: 'No pedido vendido, clique em "Gerar etiqueta". Você recebe o QR Code e a etiqueta pré-paga no app.',
      },
      {
        q: 'Qual o prazo para postar?',
        a: '5 dias úteis após a confirmação do pagamento. Depois disso o pedido é cancelado e o comprador reembolsado.',
      },
      {
        q: 'Como adiciono o código de rastreio?',
        a: 'Se usar a etiqueta pré-paga, o rastreio é automático. Caso contrário, insira manualmente em "Meus pedidos > Enviar".',
      },
      {
        q: 'E se o item se perder no transporte?',
        a: 'Com a etiqueta pré-paga da plataforma, a Vintage.br cobre o prejuízo do extravio. O comprador é reembolsado e o vendedor também recebe o valor da venda.',
      },
    ],
  },
  {
    id: 'devolucoes',
    title: '6. Devoluções e Disputas',
    items: [
      {
        q: 'Como abrir uma disputa?',
        a: 'Em "Meus pedidos", selecione o pedido e clique em "Tenho um problema". Descreva o ocorrido e envie fotos.',
      },
      {
        q: 'Quais provas devo enviar?',
        a: 'Fotos do item recebido (idealmente, com a embalagem), comparação com o anúncio, e vídeo do desembalagem quando possível.',
      },
      {
        q: 'Tenho direito de arrependimento?',
        a: 'Sim. Pelo Art. 49 do CDC, você pode desistir da compra em até 7 dias corridos do recebimento, sem justificativa.',
      },
      {
        q: 'Quanto tempo a Vintage.br demora para decidir?',
        a: 'Até 5 dias úteis após a abertura da disputa, ouvidas as duas partes.',
      },
    ],
  },
  {
    id: 'conta',
    title: '7. Conta e Segurança',
    items: [
      {
        q: 'Como altero minha senha?',
        a: 'Vá em Perfil > Segurança > Alterar senha.',
      },
      {
        q: 'Posso ativar autenticação em duas etapas (2FA)?',
        a: 'Sim. Em Perfil > Segurança > 2FA você pode ativar via SMS ou aplicativo autenticador.',
      },
      {
        q: 'Como excluo minha conta?',
        a: 'Em Perfil > Privacidade > Excluir conta. Seus dados pessoais são removidos em até 30 dias. Alguns registros fiscais são retidos por 5 anos de forma anonimizada.',
      },
      {
        q: 'Meus dados estão seguros?',
        a: 'Sim. Usamos criptografia (TLS em trânsito, AES-256 em repouso), bcrypt para senhas, e controles de acesso rigorosos. Consulte nossa Política de Privacidade.',
      },
    ],
  },
  {
    id: 'denuncias',
    title: '8. Denúncias e Bloqueios',
    items: [
      {
        q: 'Como denuncio um usuário ou anúncio?',
        a: 'Clique no botão "Denunciar" dentro do anúncio, perfil ou mensagem e descreva o motivo. Analisamos em até 24h úteis.',
      },
      {
        q: 'Como bloqueio um usuário?',
        a: 'No perfil do usuário, clique no menu "..." e selecione "Bloquear". Ele não poderá mais interagir com você.',
      },
      {
        q: 'Denúncias anônimas são aceitas?',
        a: 'Sim. Todas as denúncias são tratadas com confidencialidade.',
      },
    ],
  },
  {
    id: 'autenticidade',
    title: '9. Autenticidade',
    items: [
      {
        q: 'Como a Vintage.br verifica produtos de marcas?',
        a: 'Itens de marcas selecionadas podem passar por verificação da nossa equipe de autenticadores antes de serem enviados ao comprador.',
      },
      {
        q: 'O que é o Selo de Autenticidade?',
        a: 'Selo conferido a itens verificados manualmente pela equipe Vintage.br. Garante a originalidade antes do envio ao comprador.',
      },
      {
        q: 'E se eu receber um item falsificado?',
        a: 'Abra uma disputa imediatamente. Itens falsificados vendidos como originais geram reembolso integral ao comprador e podem resultar em banimento do vendedor.',
      },
    ],
  },
  {
    id: 'contato',
    title: '10. Contato',
    items: [
      {
        q: 'Como entro em contato com o suporte?',
        a: 'Pelo e-mail [SUPPORT_EMAIL_PLACEHOLDER]. Respondemos em até 24h úteis (segunda a sexta, das 9h às 18h).',
      },
      {
        q: 'Tenho uma dúvida sobre privacidade. Para quem envio?',
        a: 'Entre em contato com nosso DPO em [DPO_EMAIL_PLACEHOLDER].',
      },
      {
        q: 'Não encontrei minha dúvida aqui. O que faço?',
        a: 'Fale com o suporte pelo e-mail ou pela página de contato. Responderemos o mais rápido possível.',
      },
    ],
  },
];

export default function AjudaPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Central de Ajuda</h1>
      <p className="text-gray-600 mb-10">
        Encontre respostas para as dúvidas mais comuns sobre a Vintage.br. Se não encontrar o
        que procura, fale com o{' '}
        <Link href="/contato" className="text-brand-600 underline">
          nosso suporte
        </Link>
        .
      </p>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{section.title}</h2>
            <div className="space-y-2">
              {section.items.map((faq, i) => (
                <details
                  key={i}
                  className="group bg-white border border-gray-200 rounded-xl overflow-hidden"
                >
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-5 py-4 font-medium text-gray-800 hover:bg-gray-50 transition">
                    <span className="text-sm">{faq.q}</span>
                    <span className="text-gray-400 group-open:rotate-180 transition-transform">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 border-t border-gray-200 pt-6 text-sm text-gray-500">
        Ainda precisa de ajuda?{' '}
        <Link href="/contato" className="text-brand-600 underline">
          Fale com o suporte
        </Link>
        . Respondemos em até 24h úteis.
      </div>
    </div>
  );
}
