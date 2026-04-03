export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Politica de Privacidade</h1>
      <p className="text-sm text-gray-400 mb-8">Ultima atualizacao: 1 de abril de 2026</p>

      <div className="prose prose-gray max-w-none space-y-6 text-gray-600 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. Dados que Coletamos</h2>
          <p>
            Coletamos informacoes fornecidas por voce ao criar uma conta (nome, e-mail, CPF),
            dados de uso da plataforma e informacoes de pagamento necessarias para processar
            transacoes. Tambem coletamos dados de navegacao atraves de cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">2. Como Usamos seus Dados</h2>
          <p>
            Seus dados sao utilizados para: fornecer e melhorar nossos servicos, processar
            pagamentos, enviar notificacoes sobre suas compras e vendas, garantir a seguranca
            da plataforma e cumprir obrigacoes legais.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. Compartilhamento de Dados</h2>
          <p>
            Compartilhamos seus dados apenas quando necessario: com parceiros de pagamento
            (Mercado Pago) para processar transacoes, com transportadoras (Correios, Jadlog)
            para entregas, e com autoridades quando exigido por lei.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">4. Protecao de Dados (LGPD)</h2>
          <p>
            A Vintage.br esta em conformidade com a Lei Geral de Protecao de Dados (LGPD).
            Voce tem o direito de: acessar seus dados, corrigir informacoes incorretas,
            solicitar a exclusao dos seus dados, revogar consentimento e portar seus dados.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">5. Seguranca</h2>
          <p>
            Utilizamos criptografia, controles de acesso e monitoramento continuo para
            proteger seus dados. Senhas sao armazenadas com hash bcrypt e nunca sao
            acessiveis em texto puro.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Cookies</h2>
          <p>
            Utilizamos cookies essenciais para o funcionamento da plataforma e cookies
            analiticos para entender como voce usa nossos servicos. Voce pode gerenciar
            suas preferencias de cookies a qualquer momento.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Retencao de Dados</h2>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa. Apos o encerramento da
            conta, seus dados pessoais sao removidos em ate 30 dias, exceto quando a
            retencao for necessaria para cumprimento de obrigacoes legais.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">8. Contato do DPO</h2>
          <p>
            Para exercer seus direitos ou esclarecer duvidas sobre privacidade, entre
            em contato com nosso Encarregado de Protecao de Dados pelo e-mail{' '}
            <span className="text-brand-600">privacidade@vintage.br</span>.
          </p>
        </section>
      </div>
    </div>
  );
}
