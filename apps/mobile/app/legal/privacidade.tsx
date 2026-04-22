import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LegalScreen } from '../../src/components/LegalScreen';
import { colors } from '../../src/theme/colors';

export default function PrivacidadeScreen() {
  return (
    <LegalScreen
      title="Política de Privacidade"
      intro="Versão 1.0.0 — Última atualização: 16 de abril de 2026. Esta política descreve como a Vintage.br coleta, usa, compartilha e protege seus dados pessoais, em conformidade com a LGPD (Lei 13.709/2018)."
      sections={[
        {
          title: '1. Dados coletados',
          body:
            'Cadastrais: nome, CPF, data de nascimento, e-mail, telefone. Endereço: CEP, logradouro, cidade, estado. Financeiros: chave PIX, dados bancários para saque (processados pelo Mercado Pago). Uso: IP, dispositivo, histórico de anúncios, buscas e mensagens. Documentos de KYC: quando aplicável (Serpro/Caf).',
        },
        {
          title: '2. Base legal (art. 7º da LGPD)',
          body:
            'Execução de contrato (cadastro, pagamento, logística), cumprimento de obrigação legal (fiscal, antifraude, LGPD, Marco Civil), legítimo interesse (segurança, prevenção a fraudes) e consentimento (marketing, notificações opcionais).',
        },
        {
          title: '3. Compartilhamento',
          body:
            'Mercado Pago (pagamentos e saques), Correios e Jadlog (logística), Serpro/Caf (verificação de identidade), Meilisearch (busca), PostHog (analytics anonimizado), AWS S3 (armazenamento de imagens criptografadas). Nunca vendemos seus dados.',
        },
        {
          title: '4. Seus direitos (art. 18 da LGPD)',
          body:
            'Você pode: confirmar a existência de tratamento, acessar, corrigir, anonimizar, bloquear ou eliminar dados, portar para outro fornecedor, revogar consentimento e solicitar informação sobre compartilhamentos. Atenda pelas configurações da conta ou pelo e-mail privacidade@vintage.br.',
        },
        {
          title: '5. Retenção',
          body:
            'Dados cadastrais: pelo tempo da conta ativa + 5 anos após encerramento (prescrição consumerista). Dados fiscais: 5 anos (Lei 8.212/1991). Logs de segurança: 6 meses (Marco Civil). Após os prazos, os dados são anonimizados ou excluídos.',
        },
        {
          title: '6. Segurança',
          body:
            'Criptografia em trânsito (TLS 1.3) e em repouso (AES-256-GCM para CPF, chaves PIX e documentos). Autenticação com JWT + refresh token rotacionado. Rate limiting, CSRF, CSP e monitoramento contínuo de anomalias. Notificações de incidentes em até 72 horas conforme exigido pela LGPD.',
        },
        {
          title: '7. Menores de 18',
          body:
            'A Vintage.br é destinada exclusivamente a maiores de 18 anos. Não coletamos conscientemente dados de menores. Se identificada uma conta de menor, ela será encerrada.',
        },
        {
          title: '8. Encarregado de dados (DPO)',
          body:
            'Contato: privacidade@vintage.br. Você também pode reclamar diretamente à Autoridade Nacional de Proteção de Dados (ANPD) em gov.br/anpd.',
        },
      ]}
      footer={
        <TouchableOpacity
          style={styles.link}
          onPress={() => Linking.openURL('https://vintage.br/privacidade')}
        >
          <Text style={styles.linkText}>Ler versão completa no site →</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  link: { marginTop: 8 },
  linkText: { color: colors.primary[600], fontWeight: '600' },
});
