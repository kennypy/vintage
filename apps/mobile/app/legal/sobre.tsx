import { LegalScreen } from '../../src/components/LegalScreen';

export default function SobreScreen() {
  return (
    <LegalScreen
      title="Sobre a Vintage.br"
      intro="Marketplace C2C de moda secondhand do Brasil. PIX, escrow e logística integrada."
      sections={[
        {
          title: 'Nossa missão',
          body:
            'Acreditamos em uma moda mais consciente, acessível e circular. A Vintage.br existe para prolongar a vida útil de roupas, calçados e acessórios, reduzir o desperdício têxtil e permitir que brasileiros comprem e vendam moda com segurança. Cada peça que muda de dono é um pequeno passo contra o fast fashion.',
        },
        {
          title: 'O que oferecemos',
          body:
            '• Marketplace C2C seguro com Proteção ao Comprador.\n• Pagamento PIX integrado ao Mercado Pago.\n• Escrow: o dinheiro fica retido até a confirmação do recebimento.\n• Etiqueta pré-paga e rastreamento com Correios e Jadlog.\n• Verificação de autenticidade para itens selecionados.',
        },
        {
          title: 'Para imprensa',
          body:
            'Jornalistas e criadores de conteúdo podem entrar em contato pelo e-mail suporte@vintage.br (assunto: "Imprensa"). Respondemos solicitações de entrevistas, dados e materiais de apoio em até 48h úteis.',
        },
        {
          title: 'Carreiras',
          body:
            'Estamos sempre em busca de talentos. Envie seu currículo para suporte@vintage.br (assunto: "Carreiras").',
        },
      ]}
    />
  );
}
