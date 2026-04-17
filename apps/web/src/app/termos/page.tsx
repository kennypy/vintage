import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description:
    'Termos de Uso da Vintage.br em conformidade com o Código de Defesa do Consumidor, Marco Civil da Internet e Lei 14.181/2021.',
  openGraph: {
    title: 'Termos de Uso — Vintage.br',
    description:
      'Regras de uso do marketplace Vintage.br para compradores e vendedores.',
    type: 'article',
  },
  alternates: {
    canonical: '/termos',
  },
};

export default function TermosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Termos de Uso</h1>
      <p className="text-sm text-gray-500 mb-8">
        Versão 1.0.0 — Última atualização: 16 de abril de 2026
      </p>

      <article className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. Objeto</h2>
          <p>
            Estes Termos de Uso regulam o acesso e a utilização da plataforma Vintage.br
            (aplicativo móvel e site), um <strong>marketplace C2C</strong> (consumer-to-consumer)
            que conecta pessoas físicas interessadas em comprar e vender artigos de moda
            secondhand.
          </p>
          <p>
            A Vintage.br atua <strong>exclusivamente como intermediária tecnológica</strong>,
            facilitando a transação entre comprador e vendedor. Não somos parte no contrato de
            compra e venda e não detemos a propriedade dos itens anunciados.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">2. Definições</h2>
          <ul className="list-disc pl-6">
            <li><strong>Usuário:</strong> pessoa física maior de 18 anos cadastrada na plataforma.</li>
            <li><strong>Comprador:</strong> usuário que adquire um item anunciado.</li>
            <li><strong>Vendedor:</strong> usuário que anuncia um item para venda.</li>
            <li><strong>Anúncio:</strong> publicação feita pelo vendedor com descrição, fotos e preço de um item.</li>
            <li><strong>Oferta:</strong> proposta de compra feita por valor inferior ao preço anunciado.</li>
            <li><strong>Carteira:</strong> saldo virtual mantido na plataforma, com valores a receber de vendas ou créditos.</li>
            <li><strong>PIX:</strong> meio de pagamento instantâneo utilizado para todas as transações.</li>
            <li><strong>Taxa de serviço:</strong> taxa de Proteção ao Comprador cobrada no checkout.</li>
            <li><strong>Escrow:</strong> retenção do valor pago até a confirmação do recebimento do item.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. Cadastro e Elegibilidade</h2>
          <p>Para usar a Vintage.br você deve:</p>
          <ul className="list-disc pl-6">
            <li>Ter 18 anos ou mais;</li>
            <li>Ser pessoa física residente no Brasil;</li>
            <li>Fornecer CPF válido, e-mail e telefone verdadeiros;</li>
            <li>Manter apenas uma conta por pessoa (contas duplicadas podem ser suspensas);</li>
            <li>Manter as credenciais de acesso confidenciais e seguras.</li>
          </ul>
          <p>
            Você é responsável por todas as atividades realizadas com sua conta. Suspeitas de
            acesso indevido devem ser comunicadas imediatamente ao suporte.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">4. Como Vender</h2>
          <p>O vendedor se compromete a:</p>
          <ul className="list-disc pl-6">
            <li>Publicar fotos reais do item (mínimo 4 fotos recomendadas, máximo 20);</li>
            <li>Descrever com veracidade a marca, tamanho, condição, medidas e quaisquer defeitos;</li>
            <li>Definir preço de forma livre, respeitando as regras da plataforma;</li>
            <li>Manter o anúncio atualizado e removê-lo se o item não estiver mais disponível;</li>
            <li>Não contornar o sistema de pagamento da plataforma.</li>
          </ul>
          <p>Anúncios podem ser editados a qualquer momento, exceto quando há uma venda em andamento.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">5. Como Comprar</h2>
          <p>
            Compradores podem comprar um item diretamente pelo preço anunciado ou fazer uma
            oferta. O pagamento é realizado via <strong>PIX</strong>, processado pelo nosso
            parceiro Mercado Pago. Após o pagamento, o vendedor é notificado e deve enviar o
            item dentro do prazo. A compra é concluída após a confirmação de recebimento pelo
            comprador.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Pagamento, Escrow e Taxas</h2>
          <p>
            A Vintage.br adota o sistema de <strong>escrow</strong>: o valor pago pelo comprador
            fica retido em conta segregada até a confirmação do recebimento do item. Caso o
            comprador não manifeste problema dentro do prazo, o valor é liberado automaticamente
            para a carteira do vendedor.
          </p>
          <p>
            <strong>Taxa de serviço (Proteção ao Comprador):</strong> 5% do valor do item — paga
            pelo comprador no checkout (valor placeholder, pode ser alterado mediante aviso
            prévio). O vendedor recebe 100% do valor anunciado.
          </p>
          <p>
            <strong>Saques:</strong> o vendedor pode sacar o saldo da carteira para sua conta
            bancária via PIX a qualquer momento (valor mínimo de R$10,00). O processamento é
            instantâneo e o crédito ocorre em até 1 dia útil.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Envio e Logística</h2>
          <p>
            Os envios são feitos através das transportadoras parceiras (Correios e Jadlog). O
            vendedor deve postar o item em até 5 dias úteis após a confirmação do pagamento e
            inserir o <strong>código de rastreio obrigatoriamente</strong>. A falta de postagem
            no prazo resulta em cancelamento automático com reembolso integral ao comprador.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            8. Direito de Arrependimento (Art. 49 do CDC)
          </h2>
          <p>
            Conforme o artigo 49 do Código de Defesa do Consumidor, o comprador pode exercer o
            <strong> direito de arrependimento</strong> em até <strong>7 dias corridos</strong> a
            partir do recebimento do item, sem necessidade de justificativa, quando a compra for
            realizada fora do estabelecimento comercial (internet). Nos casos de produto
            defeituoso ou em desconformidade com o anunciado, os custos de devolução ficam a
            cargo do vendedor.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">9. Disputas</h2>
          <p>
            O comprador tem <strong>até 7 dias após o recebimento</strong> para abrir uma
            disputa caso o item não esteja conforme o anunciado. A equipe Vintage.br analisa a
            disputa e emite decisão em até <strong>5 dias úteis</strong>. A decisão pode incluir
            estorno integral ao comprador, liberação do valor ao vendedor ou acordo mediado.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">10. Avaliações</h2>
          <p>
            Após cada transação concluída, comprador e vendedor podem avaliar um ao outro com
            nota de 1 a 5 estrelas e um comentário. Avaliações devem ser sinceras e não podem
            conter ofensas, dados pessoais de terceiros, conteúdo ilegal ou spam. O usuário
            avaliado tem direito de resposta pública e pode reportar avaliações abusivas para
            moderação.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">11. Itens Proibidos</h2>
          <p>
            É proibido anunciar itens falsificados, drogas, armas e munição, conteúdo adulto,
            itens perigosos, animais vivos, conteúdo pirata, entre outros. A lista detalhada
            pode ser consultada em{' '}
            <Link href="/diretrizes-comunidade" className="text-brand-600 underline">
              Diretrizes da Comunidade
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">12. Conduta Proibida</h2>
          <ul className="list-disc pl-6">
            <li>Assédio, discurso de ódio ou qualquer forma de discriminação;</li>
            <li>Fraude, manipulação de avaliações ou uso de contas falsas;</li>
            <li>Spam, propaganda não autorizada ou uso indevido da plataforma;</li>
            <li>Tentativas de contornar o sistema de pagamento ou o escrow;</li>
            <li>Compartilhamento de dados pessoais de terceiros sem consentimento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">13. Moderação</h2>
          <p>
            A equipe de moderação da Vintage.br responde a denúncias em até{' '}
            <strong>24 horas úteis</strong>. Em casos graves (fraude, conteúdo ilegal, risco à
            segurança), adotamos medidas imediatas, incluindo remoção de anúncio, suspensão de
            conta e cooperação com autoridades.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">14. Suspensão e Encerramento</h2>
          <p>
            Podemos suspender ou encerrar contas em caso de violação destes Termos, das{' '}
            <Link href="/diretrizes-comunidade" className="text-brand-600 underline">
              Diretrizes da Comunidade
            </Link>{' '}
            ou da legislação aplicável. Sempre que possível, notificamos o usuário com aviso
            prévio, exceto em situações graves que demandem ação imediata.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">15. Propriedade Intelectual</h2>
          <p>
            Todo o conteúdo da plataforma (marca, design, código-fonte, textos) pertence à
            Vintage.br. O usuário mantém a titularidade das fotos e descrições que publica e
            concede à Vintage.br uma licença não exclusiva, mundial e gratuita de uso exclusivo
            para exibi-los dentro da plataforma e em peças promocionais correlatas.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">16. Limitação de Responsabilidade</h2>
          <p>
            A Vintage.br atua como intermediária e não garante a qualidade, autenticidade ou
            conformidade dos itens anunciados pelos vendedores. A responsabilidade pelos itens é
            do vendedor. Nos termos do Código de Defesa do Consumidor (quando aplicável) e da
            Lei 14.181/2021 (superendividamento), a Vintage.br responde pelos serviços de
            intermediação que presta, nos limites legais.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">17. LGPD</h2>
          <p>
            O tratamento dos seus dados pessoais é disciplinado em nossa{' '}
            <Link href="/privacidade" className="text-brand-600 underline">
              Política de Privacidade
            </Link>
            , parte integrante destes Termos.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            18. Marco Civil da Internet
          </h2>
          <p>
            Em cumprimento ao Marco Civil da Internet (Lei 12.965/2014), conservamos registros
            de acesso à aplicação por <strong>6 meses</strong>. Conforme o artigo 19 do Marco
            Civil, a Vintage.br, na qualidade de provedor de aplicação, só poderá ser
            responsabilizada civilmente por conteúdo gerado por terceiros se, após ordem
            judicial específica, não tomar providências para indisponibilizar o conteúdo
            apontado como infringente.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">19. Alterações dos Termos</h2>
          <p>
            Podemos atualizar estes Termos de Uso. Em caso de alteração material, notificaremos
            os usuários por e-mail e/ou dentro do aplicativo, solicitando nova aceitação antes
            da continuidade do uso.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">20. Foro</h2>
          <p>
            Fica eleito o foro da comarca de <strong>[ADDRESS_PLACEHOLDER]</strong> para dirimir
            eventuais controvérsias, sem prejuízo do direito do consumidor de ajuizar ação no
            foro do seu domicílio, conforme o artigo 101, I, do Código de Defesa do Consumidor.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">21. Canal Complementar</h2>
          <p>
            Como canal complementar, o consumidor pode registrar reclamações na plataforma{' '}
            <a
              href="https://www.consumidor.gov.br"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Consumidor.gov.br
            </a>
            , mantida pela Secretaria Nacional do Consumidor (SENACON).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">22. Contato</h2>
          <p>
            Para dúvidas sobre estes Termos, fale com nosso suporte em{' '}
            <span className="text-brand-600">[SUPPORT_EMAIL_PLACEHOLDER]</span>.
          </p>
        </section>

        <p className="text-sm text-gray-500 pt-6 border-t border-gray-200">
          Última atualização: 16 de abril de 2026 — Versão 1.0.0
        </p>
      </article>
    </div>
  );
}
