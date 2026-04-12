'use client';

import { useState } from 'react';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  icon: React.ReactNode;
  items: FaqItem[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Comprando na Vintage',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    items: [
      {
        q: 'Como comprar um item?',
        a: 'Encontre o item que deseja, clique em "Comprar agora" ou faca uma oferta ao vendedor. Ao finalizar a compra, pague via PIX. O vendedor tem 5 dias uteis para enviar o pedido.',
      },
      {
        q: 'O que acontece depois que compro?',
        a: 'Apos o pagamento via PIX, o valor fica retido com seguranca na Vintage ate voce confirmar o recebimento. O vendedor e notificado e tem 5 dias uteis para postar o item. Voce recebe o codigo de rastreio assim que o envio for feito. Quando o item chegar, voce tem 2 dias para verificar e confirmar que esta tudo certo. Se nao houver nenhuma acao, a compra e confirmada automaticamente.',
      },
      {
        q: 'Posso fazer uma oferta abaixo do preco?',
        a: 'Sim! Voce pode fazer ofertas de ate 50% do valor anunciado. O vendedor tem 48 horas para aceitar, recusar ou fazer uma contraproposta. Se aceitar, o item e reservado para voce concluir o pagamento.',
      },
      {
        q: 'Posso parcelar a compra?',
        a: 'Aceitamos PIX, cartao de credito (com parcelamento em ate 12x) e boleto bancario.',
      },
      {
        q: 'Como funciona o frete?',
        a: 'O comprador paga o frete. O valor e calculado automaticamente com base no CEP de origem e destino, peso e dimensoes do pacote. As opcoes de envio incluem Correios (PAC e SEDEX) e Jadlog. O prazo estimado e exibido antes da compra.',
      },
    ],
  },
  {
    title: 'Vendendo na Vintage',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
    items: [
      {
        q: 'Como faco para vender?',
        a: 'Clique em "Vender" no menu, tire fotos do item (ate 20 fotos, recomendamos pelo menos 4 — frente, costas, etiqueta e detalhes), preencha titulo, descricao, preco, tamanho e condicao, e publique. Seu anuncio fica visivel imediatamente para todos os compradores.',
      },
      {
        q: 'O que acontece quando vendo um item?',
        a: 'Quando alguem compra seu item, voce recebe uma notificacao imediata. Voce tem 5 dias uteis para embalar e postar o pacote. Apos a postagem, insira o codigo de rastreio ou use a etiqueta pre-paga gerada pela Vintage. Quando o comprador confirmar o recebimento (ou apos 2 dias sem disputa), o valor da venda e creditado na sua carteira Vintage.',
      },
      {
        q: 'Como recebo o pagamento?',
        a: 'O valor e creditado na sua carteira Vintage apos a confirmacao da entrega. Voce pode sacar para sua conta bancaria via PIX a qualquer momento, desde que o saldo minimo seja de R$10,00. O saque via PIX e instantaneo.',
      },
      {
        q: 'Quanto a Vintage cobra de taxa?',
        a: 'A Vintage nao cobra taxa do vendedor. A taxa de Protecao ao Comprador (R$3,50 + 5% do valor do item) e paga pelo comprador. O valor que voce define e o valor que voce recebe.',
      },
      {
        q: 'Como excluir ou editar um anuncio?',
        a: 'Acesse "Meus anuncios" no perfil, clique no anuncio que deseja alterar. Para editar, clique no icone de lapis. Para excluir, clique no icone de lixeira e confirme. Anuncios com uma venda em andamento nao podem ser excluidos.',
      },
      {
        q: 'Como dar mais visibilidade ao meu anuncio?',
        a: 'Voce pode usar o Destaque (R$4,90 por 3 dias) para subir seu anuncio no feed, o Spotlight (R$29,90 por 7 dias) para aparecer na secao de destaques, ou o Megafone (gratis por 7 dias em anuncios novos) para notificar compradores interessados na sua categoria.',
      },
    ],
  },
  {
    title: 'Protecao ao Comprador',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    items: [
      {
        q: 'Por que toda compra tem Protecao ao Comprador?',
        a: 'A Protecao ao Comprador existe para garantir que voce receba exatamente o que comprou. O pagamento fica retido com a Vintage ate voce confirmar que o item chegou conforme descrito. Se houver qualquer problema, voce pode abrir uma disputa e ser reembolsado. Isso torna a compra de segunda mao tao segura quanto comprar em uma loja.',
      },
      {
        q: 'Quanto custa a Protecao ao Comprador?',
        a: 'A taxa e de R$3,50 fixo + 5% do valor do item. Por exemplo, para um item de R$100,00, a taxa seria R$8,50 (R$3,50 + R$5,00). Essa taxa e adicionada automaticamente no checkout.',
      },
      {
        q: 'O que a Protecao ao Comprador cobre?',
        a: 'A protecao cobre: item significativamente diferente da descricao ou fotos, item com defeitos nao mencionados no anuncio, item incorreto (tamanho, cor ou modelo diferente do anunciado), item falsificado vendido como original, e item nao recebido dentro do prazo de entrega.',
      },
      {
        q: 'Como abrir uma disputa?',
        a: 'Voce tem ate 2 dias apos o recebimento para abrir uma disputa. Va em "Meus pedidos", selecione o pedido, clique em "Tenho um problema" e descreva o ocorrido com fotos. Recomendamos sempre tentar resolver diretamente com o vendedor primeiro pelo chat. Se nao houver acordo, a equipe Vintage analisa o caso e decide em ate 3 dias uteis.',
      },
    ],
  },
  {
    title: 'Item Nao Conforme',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    items: [
      {
        q: 'O que E considerado "nao conforme com a descricao"?',
        a: 'Um item e considerado nao conforme quando: o item tem manchas, rasgos, furos ou defeitos nao mencionados no anuncio; o tamanho real e diferente do anunciado (ex: anunciou M, enviou G); a cor e significativamente diferente das fotos; o item e falsificado mas foi vendido como original; a marca e diferente da anunciada; faltam pecas ou acessorios mencionados na descricao (ex: cinto, capuz removivel); o item tem cheiro forte de mofo, cigarro ou outros odores nao mencionados; o item foi descrito como "novo com etiqueta" mas nao tem etiqueta.',
      },
      {
        q: 'O que NAO e considerado "nao conforme com a descricao"?',
        a: 'Um item NAO e considerado nao conforme quando: o item simplesmente nao ficou bem em voce ou nao era do seu gosto — moda e subjetiva; pequenas variacoes de cor devido a diferencas de tela/monitor; sinais normais de uso em itens descritos como "Bom" ou "Satisfatorio"; o item tem o tamanho correto mas nao serve no seu corpo (tamanhos variam entre marcas); voce encontrou o mesmo item mais barato em outro lugar; o frete demorou mais do que o esperado (isso e responsabilidade da transportadora); voce simplesmente mudou de ideia apos a compra; o tecido tem textura diferente do que voce imaginou (se nao foi especificado na descricao).',
      },
      {
        q: 'O que acontece se a disputa for aprovada?',
        a: 'Se a equipe Vintage decidir a seu favor, voce recebe o reembolso integral (valor do item + frete + taxa de protecao) via credito na carteira Vintage ou estorno PIX. O vendedor recebe instrucoes para o item ser devolvido, com frete pago pela Vintage. Em casos de falsificacao, o anuncio e removido e o vendedor pode receber uma suspensao.',
      },
      {
        q: 'O que acontece se a disputa for negada?',
        a: 'Se a equipe Vintage entender que o item esta conforme descrito, o pagamento e liberado para o vendedor normalmente. Voce pode entrar em contato com o suporte para mais esclarecimentos, mas a decisao e final apos revisao.',
      },
    ],
  },
  {
    title: 'Envio e Entrega',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    items: [
      {
        q: 'Como enviar meu item vendido?',
        a: 'Apos a venda, va em "Meus pedidos" e clique em "Enviar". Voce pode usar a etiqueta pre-paga gerada pela Vintage (recomendado) ou enviar por conta propria. Com a etiqueta pre-paga, basta embalar o item, colar a etiqueta e levar ao ponto de postagem.',
      },
      {
        q: 'Como escanear o QR Code nos Correios?',
        a: 'Ao gerar a etiqueta de envio na Vintage, voce recebe um QR Code no app. No ponto de postagem dos Correios: (1) Abra o pedido em "Meus pedidos" e clique em "Ver QR Code". (2) Mostre o QR Code no balcao dos Correios — o atendente vai escanear. (3) O sistema dos Correios puxa automaticamente os dados de envio (origem, destino, peso). (4) Voce recebe o comprovante de postagem. (5) O rastreio e atualizado automaticamente no app. Dica: salve uma captura de tela do QR Code caso esteja sem internet no local. Algumas agencias dos Correios tambem tem terminais de autoatendimento onde voce mesmo pode escanear.',
      },
      {
        q: 'Qual o prazo para enviar?',
        a: 'Voce tem 5 dias uteis apos a confirmacao do pagamento para postar o item. Se nao enviar nesse prazo, o pedido e cancelado automaticamente e o comprador recebe o reembolso integral.',
      },
      {
        q: 'Quais transportadoras sao aceitas?',
        a: 'Trabalhamos com Correios (PAC e SEDEX) e Jadlog. O PAC e a opcao mais economica (5-12 dias uteis), SEDEX e a mais rapida (1-3 dias uteis), e Jadlog e uma alternativa com bons precos para pacotes maiores.',
      },
      {
        q: 'Como embalar meu item?',
        a: 'Embale com cuidado para proteger o item durante o transporte. Use um saco plastico para proteger de umidade, depois coloque em uma caixa de papelao ou envelope reforcado. Para itens delicados como sapatos, use papel amassado para preencher espacos vazios. Nao se esqueca de remover etiquetas de preco pessoal.',
      },
      {
        q: 'E se o item se perder no frete?',
        a: 'Se o rastreio mostrar que o item foi extraviado pela transportadora, o comprador recebe reembolso integral e o vendedor tambem recebe o valor da venda. A Vintage assume o prejuizo do extravio, desde que o envio tenha sido feito pela etiqueta pre-paga da plataforma.',
      },
    ],
  },
  {
    title: 'Conta e Seguranca',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    items: [
      {
        q: 'Como verificar minha conta?',
        a: 'Acesse Perfil > Verificacao e siga os passos: confirme seu e-mail, numero de celular e CPF. A verificacao aumenta a confianca dos compradores e e obrigatoria para sacar valores da carteira.',
      },
      {
        q: 'E seguro comprar na Vintage?',
        a: 'Sim. Todo pagamento e processado de forma segura e fica retido ate a confirmacao da entrega. Nunca transfira dinheiro diretamente para um vendedor fora da plataforma. Todas as conversas e transacoes ficam registradas para sua protecao.',
      },
      {
        q: 'Posso cancelar uma compra?',
        a: 'Voce pode solicitar o cancelamento antes do vendedor enviar o item. Apos o envio, nao e possivel cancelar — mas voce pode abrir uma disputa apos receber se o item nao estiver conforme descrito.',
      },
    ],
  },
  {
    title: 'Carteira e Pagamentos',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    items: [
      {
        q: 'Como funciona a carteira Vintage?',
        a: 'A carteira e onde ficam seus ganhos de vendas. Apos cada venda confirmada, o valor e creditado automaticamente. Voce pode usar o saldo para comprar outros itens na Vintage ou sacar via PIX para sua conta bancaria.',
      },
      {
        q: 'Qual o valor minimo para saque?',
        a: 'O valor minimo para saque e de R$10,00. O saque via PIX e processado instantaneamente, a qualquer hora do dia.',
      },
      {
        q: 'Indiquei um amigo. Como recebo o bonus?',
        a: 'Quando seu amigo se cadastra usando seu codigo de indicacao e faz a primeira compra, voces dois recebem R$10,00 de credito na carteira Vintage. O credito e adicionado automaticamente apos a confirmacao da primeira compra do indicado.',
      },
    ],
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function HelpPage() {
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const toggleSection = (index: number) => {
    setExpandedSection(expandedSection === index ? null : index);
    setExpandedItem(null);
  };

  const toggleItem = (key: string) => {
    setExpandedItem(expandedItem === key ? null : key);
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-100 text-brand-600 rounded-full mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Central de Ajuda</h1>
          <p className="text-lg text-gray-600">
            Encontre respostas para as perguntas mais comuns sobre compras, vendas, envios e protecao ao comprador.
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer">
            <div className="flex-shrink-0 w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">Chat ao vivo</p>
              <p className="text-xs text-gray-500">Respondemos em minutos</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition cursor-pointer">
            <div className="flex-shrink-0 w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">E-mail</p>
              <p className="text-xs text-gray-500">suporte@vintage.br</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-3">
          {FAQ_SECTIONS.map((section, sectionIndex) => (
            <div key={sectionIndex} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(sectionIndex)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-9 h-9 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center">
                    {section.icon}
                  </span>
                  <span className="font-semibold text-gray-900">{section.title}</span>
                </div>
                <span className="text-gray-400">
                  <ChevronIcon open={expandedSection === sectionIndex} />
                </span>
              </button>

              {expandedSection === sectionIndex && (
                <div className="border-t border-gray-100">
                  {section.items.map((faq, itemIndex) => {
                    const key = `${sectionIndex}-${itemIndex}`;
                    return (
                      <div key={key} className="border-b border-gray-50 last:border-b-0">
                        <button
                          onClick={() => toggleItem(key)}
                          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-gray-50 transition"
                        >
                          <span className="text-sm font-medium text-gray-800">{faq.q}</span>
                          <span className="text-gray-400 flex-shrink-0">
                            <ChevronIcon open={expandedItem === key} />
                          </span>
                        </button>
                        {expandedItem === key && (
                          <div className="px-5 pb-4">
                            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{faq.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
