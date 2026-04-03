export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Termos de Uso</h1>
      <p className="text-sm text-gray-400 mb-8">Ultima atualizacao: 1 de abril de 2026</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. Aceitacao dos Termos</h2>
          <p>
            Ao acessar e usar a plataforma Vintage.br, voce concorda com estes Termos de Uso.
            Se voce nao concordar com algum dos termos, nao deve utilizar nossos servicos.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">2. Descricao do Servico</h2>
          <p>
            A Vintage.br e uma plataforma de marketplace que conecta vendedores e compradores
            de artigos de moda de segunda mao. Nos facilitamos as transacoes, mas nao somos
            parte na compra e venda entre os usuarios.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. Cadastro e Conta</h2>
          <p>
            Para utilizar certos recursos da plataforma, voce deve criar uma conta fornecendo
            informacoes verdadeiras e completas. Voce e responsavel por manter a confidencialidade
            da sua senha e por todas as atividades realizadas em sua conta.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">4. Compra e Venda</h2>
          <p>
            Vendedores devem descrever seus itens de forma precisa e honesta. Compradores devem
            efetuar o pagamento conforme acordado. A Vintage.br oferece protecao ao comprador
            para casos em que o item recebido nao corresponda ao anuncio.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">5. Pagamentos</h2>
          <p>
            Os pagamentos sao processados atraves de parceiros de pagamento seguros. Aceitamos
            PIX, cartao de credito e boleto bancario. Os valores das vendas ficam retidos ate
            a confirmacao de recebimento pelo comprador.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Envio e Entrega</h2>
          <p>
            O vendedor e responsavel por enviar o item no prazo estipulado apos a confirmacao
            do pagamento. O envio deve ser feito atraves dos metodos disponibilizados na
            plataforma (Correios ou Jadlog).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Conduta Proibida</h2>
          <p>
            E proibido: vender itens falsificados, utilizar a plataforma para fraudes,
            assediar outros usuarios, publicar conteudo ofensivo ou ilegal, manipular
            avaliacoes ou contornar o sistema de pagamento da plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">8. Propriedade Intelectual</h2>
          <p>
            Todo o conteudo da plataforma Vintage.br, incluindo marca, design e codigo, e
            de nossa propriedade. Os usuarios mantem os direitos sobre o conteudo que publicam,
            mas concedem a Vintage.br uma licenca para exibi-lo na plataforma.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">9. Contato</h2>
          <p>
            Para duvidas sobre estes Termos, entre em contato conosco pelo e-mail{' '}
            <span className="text-brand-600">suporte@vintage.br</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
