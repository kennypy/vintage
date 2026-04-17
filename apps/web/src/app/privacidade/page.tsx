import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  description:
    'Política de Privacidade da Vintage.br em conformidade com a LGPD (Lei 13.709/2018). Saiba quais dados coletamos, como tratamos e seus direitos como titular.',
  openGraph: {
    title: 'Política de Privacidade — Vintage.br',
    description:
      'Política de Privacidade da Vintage.br em conformidade com a LGPD (Lei 13.709/2018).',
    type: 'article',
  },
  alternates: {
    canonical: '/privacidade',
  },
};

export default function PrivacidadePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Política de Privacidade</h1>
      <p className="text-sm text-gray-500 mb-8">
        Versão 1.0.0 — Última atualização: 16 de abril de 2026
      </p>

      <article className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. Introdução e Controlador</h2>
          <p>
            Esta Política de Privacidade descreve como a Vintage.br trata seus dados pessoais, em
            conformidade com a <strong>Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD)</strong>,
            o <strong>Marco Civil da Internet (Lei 12.965/2014)</strong> e o <strong>Código de
            Defesa do Consumidor (Lei 8.078/1990)</strong>.
          </p>
          <p>
            O controlador dos dados pessoais tratados pela plataforma é:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Razão social:</strong> [LEGAL_ENTITY_PLACEHOLDER]
            </li>
            <li>
              <strong>CNPJ:</strong> [CNPJ_PLACEHOLDER]
            </li>
            <li>
              <strong>Endereço:</strong> [ADDRESS_PLACEHOLDER]
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            2. Encarregado pelo Tratamento de Dados (DPO)
          </h2>
          <p>
            Em cumprimento ao artigo 41 da LGPD, designamos um Encarregado pelo Tratamento de
            Dados Pessoais (Data Protection Officer). Você pode contatá-lo para qualquer dúvida,
            solicitação ou denúncia relacionada aos seus dados pessoais:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>E-mail:</strong>{' '}
              <span className="text-brand-600">[DPO_EMAIL_PLACEHOLDER]</span>
            </li>
            <li>
              <strong>Canal ANPD:</strong> Você também pode encaminhar reclamações à Autoridade
              Nacional de Proteção de Dados (ANPD) através de{' '}
              <a
                href="https://www.gov.br/anpd/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline"
              >
                www.gov.br/anpd
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. Dados que Coletamos</h2>
          <p>Coletamos apenas os dados necessários para operar a plataforma e oferecer nossos serviços:</p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Dados de cadastro:</strong> nome completo, e-mail, telefone, CPF, data de
              nascimento, senha (armazenada com hash bcrypt).
            </li>
            <li>
              <strong>Dados de transação:</strong> informações de compras, vendas, pagamentos
              PIX, valores, histórico da carteira e repasses.
            </li>
            <li>
              <strong>Mensagens:</strong> conversas entre compradores e vendedores realizadas
              dentro da plataforma, para mediação de eventuais disputas.
            </li>
            <li>
              <strong>Fotos de anúncios:</strong> imagens dos itens anunciados, hospedadas em
              armazenamento seguro.
            </li>
            <li>
              <strong>Dados do dispositivo:</strong> identificador do aparelho, modelo, sistema
              operacional, versão do aplicativo.
            </li>
            <li>
              <strong>Endereço IP e logs de acesso:</strong> coletados conforme exigência do
              Marco Civil da Internet (Art. 15).
            </li>
            <li>
              <strong>Localização aproximada:</strong> CEP para cálculo de frete e logística, e
              região para exibir itens próximos. Não coletamos localização GPS precisa sem
              consentimento explícito.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            4. Bases Legais (Art. 7º da LGPD)
          </h2>
          <p>
            Cada atividade de tratamento está ancorada em uma base legal específica prevista no
            artigo 7º da LGPD:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Consentimento (Art. 7º, I):</strong> envio de comunicações de marketing,
              uso de cookies não essenciais, solicitações opcionais de localização GPS.
            </li>
            <li>
              <strong>Execução de contrato (Art. 7º, V):</strong> criação e manutenção da conta,
              processamento de compras e vendas, intermediação de pagamentos, envio dos itens
              via transportadoras, mediação de disputas.
            </li>
            <li>
              <strong>Legítimo interesse (Art. 7º, IX):</strong> prevenção de fraude, segurança
              da plataforma, análise estatística agregada, melhoria de produtos.
            </li>
            <li>
              <strong>Cumprimento de obrigação legal/regulatória (Art. 7º, II):</strong>{' '}
              conservação de registros de acesso (Marco Civil), obrigações fiscais, combate à
              lavagem de dinheiro e financiamento ao terrorismo.
            </li>
            <li>
              <strong>Exercício regular de direitos (Art. 7º, VI):</strong> defesa em processos
              judiciais, administrativos e arbitrais.
            </li>
            <li>
              <strong>Proteção ao crédito (Art. 7º, X):</strong> quando aplicável para análise
              de risco e prevenção de inadimplência.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            5. Compartilhamento com Operadores e Sub-processadores
          </h2>
          <p>
            Compartilhamos dados estritamente necessários com parceiros operadores que atuam em
            nosso nome para viabilizar os serviços:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong>Mercado Pago:</strong> processamento de pagamentos PIX, escrow e repasses.
            </li>
            <li>
              <strong>Correios, Jadlog e Kangu:</strong> cálculo de frete, geração de etiquetas
              e rastreamento de envios.
            </li>
            <li>
              <strong>Supabase:</strong> banco de dados principal e autenticação.
            </li>
            <li>
              <strong>Cloudflare R2:</strong> armazenamento de imagens dos anúncios e anexos.
            </li>
            <li>
              <strong>Fly.io:</strong> hospedagem da infraestrutura do servidor de aplicação.
            </li>
            <li>
              <strong>Upstash:</strong> cache, filas e Redis gerenciado.
            </li>
            <li>
              <strong>Meilisearch:</strong> motor de busca de anúncios.
            </li>
            <li>
              <strong>Expo / EAS:</strong> distribuição e notificações push do aplicativo móvel.
            </li>
            <li>
              <strong>Resend:</strong> envio de e-mails transacionais (confirmações, alertas).
            </li>
          </ul>
          <p>
            Também podemos compartilhar dados com autoridades públicas quando legalmente
            obrigados (ordem judicial, requisição de autoridade competente ou cumprimento de
            obrigação legal).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Transferência Internacional</h2>
          <p>
            Alguns dos nossos sub-processadores hospedam dados em servidores fora do Brasil
            (Estados Unidos e União Europeia). Nesses casos, adotamos as salvaguardas previstas
            no artigo 33 da LGPD, incluindo cláusulas contratuais padrão, certificações de
            adequação e mecanismos específicos reconhecidos pela ANPD para garantir que seus
            dados continuem protegidos no mesmo nível exigido pela legislação brasileira.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Retenção de Dados</h2>
          <ul className="list-disc pl-6">
            <li>
              <strong>Dados de cadastro:</strong> mantidos enquanto sua conta estiver ativa. Em
              caso de exclusão, dados pessoais são apagados em até 30 dias, exceto registros
              anonimizados retidos por até 5 anos para cumprimento de obrigações fiscais,
              tributárias e regulatórias.
            </li>
            <li>
              <strong>Registros de acesso à aplicação (logs):</strong> 6 meses, conforme
              exigência do Marco Civil da Internet (Art. 15).
            </li>
            <li>
              <strong>Mensagens e conversas:</strong> mantidas enquanto a conta estiver ativa e
              apagadas junto com a conta, ressalvados os casos de disputa em andamento.
            </li>
            <li>
              <strong>Registros de pagamento e nota fiscal:</strong> 5 anos, conforme legislação
              tributária brasileira.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">
            8. Direitos do Titular (Art. 18 da LGPD)
          </h2>
          <p>A qualquer momento, você pode exercer os seguintes direitos sobre seus dados pessoais:</p>
          <ul className="list-disc pl-6">
            <li>Confirmação da existência de tratamento;</li>
            <li>Acesso aos dados tratados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>
              Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em
              desconformidade;
            </li>
            <li>Portabilidade a outro fornecedor, observando segredos comercial e industrial;</li>
            <li>Eliminação dos dados tratados com base no consentimento;</li>
            <li>Informação sobre entidades públicas e privadas com as quais foi compartilhado;</li>
            <li>Informação sobre a possibilidade de não fornecer consentimento e consequências;</li>
            <li>Revogação do consentimento;</li>
            <li>Oposição a tratamento realizado com fundamento em uma das hipóteses legais.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">9. Como Exercer seus Direitos</h2>
          <p>Para exercer qualquer um dos direitos acima, você pode:</p>
          <ul className="list-disc pl-6">
            <li>
              Enviar um e-mail ao DPO em{' '}
              <span className="text-brand-600">[DPO_EMAIL_PLACEHOLDER]</span>.
            </li>
            <li>
              Acessar o formulário na sua conta em <strong>Perfil &gt; Privacidade</strong>.
            </li>
          </ul>
          <p>
            Responderemos em até 15 dias, conforme prazos previstos pela ANPD. Para validar sua
            identidade, podemos solicitar documentos adicionais.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">10. Segurança dos Dados</h2>
          <p>
            Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados,
            incluindo: criptografia em trânsito (TLS) e em repouso (AES-256), senhas
            armazenadas exclusivamente em hash bcrypt, controle de acesso baseado em papéis,
            revisão periódica de permissões, autenticação de dois fatores (2FA), monitoramento
            de segurança, testes de intrusão e resposta a incidentes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">11. Cookies e Rastreadores</h2>
          <p>
            Utilizamos cookies essenciais (autenticação, sessão, segurança) e, mediante seu
            consentimento, cookies analíticos e de preferência. Você pode gerenciar suas
            preferências no banner de cookies ou nas configurações do seu navegador. Não
            utilizamos cookies de publicidade comportamental de terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">12. Menores de Idade</h2>
          <p>
            O uso da Vintage.br é restrito a maiores de 18 anos. Não coletamos conscientemente
            dados de menores. Caso identifiquemos um cadastro de menor de idade, a conta será
            encerrada e os dados eliminados, salvo quando a retenção for legalmente exigida.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">13. Alterações desta Política</h2>
          <p>
            Podemos atualizar esta Política de Privacidade periodicamente. Quando a alteração
            for material, notificaremos você por e-mail e/ou dentro do aplicativo e, quando
            exigido por lei, solicitaremos nova aceitação antes da continuidade dos serviços.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">14. Contato e ANPD</h2>
          <p>
            Para dúvidas, solicitações ou reclamações, entre em contato com nosso DPO pelo
            e-mail <span className="text-brand-600">[DPO_EMAIL_PLACEHOLDER]</span> ou com o
            suporte geral em <span className="text-brand-600">[SUPPORT_EMAIL_PLACEHOLDER]</span>.
          </p>
          <p>
            Se entender que seus direitos não foram atendidos, você pode apresentar reclamação
            à <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong> em{' '}
            <a
              href="https://www.gov.br/anpd/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              www.gov.br/anpd
            </a>
            .
          </p>
        </section>

        <p className="text-sm text-gray-500 pt-6 border-t border-gray-200">
          Última atualização: 16 de abril de 2026 — Versão 1.0.0
        </p>
      </article>
    </div>
  );
}
