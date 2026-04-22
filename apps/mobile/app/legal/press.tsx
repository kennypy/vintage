import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LegalScreen } from '../../src/components/LegalScreen';
import { colors } from '../../src/theme/colors';

export default function PressScreen() {
  return (
    <LegalScreen
      title="Imprensa"
      intro="Materiais para jornalistas, criadores de conteúdo e parceiros que queiram cobrir a Vintage.br."
      sections={[
        {
          title: 'Sobre',
          body:
            'A Vintage.br é um marketplace C2C brasileiro de moda secondhand. Lançado em 2026, conecta pessoas físicas que querem comprar e vender roupas, calçados e acessórios usados, com pagamento via PIX, escrow e logística integrada. Nossa missão é tornar a moda mais consciente, circular e acessível.',
        },
        {
          title: 'Números (somente em entrevistas)',
          body:
            'Compartilhamos KPIs atualizados (GMV, usuários ativos, vendas concluídas) mediante solicitação formal por e-mail e sob embargo. Não comentamos números fora de contexto jornalístico.',
        },
        {
          title: 'Contato',
          body:
            'E-mail: suporte@vintage.br (assunto: "Imprensa"). Respondemos em até 48h úteis. Entrevistas com fundadores podem ser agendadas com antecedência mínima de 3 dias úteis.',
        },
        {
          title: 'Materiais',
          body:
            'Logos, fotos dos fundadores em alta resolução, capturas de tela do app e one-pager PDF estão disponíveis mediante solicitação. Pedimos que o crédito "Vintage.br" seja preservado nas publicações.',
        },
      ]}
      footer={
        <TouchableOpacity
          style={styles.link}
          onPress={() => Linking.openURL('mailto:suporte@vintage.br?subject=Imprensa')}
        >
          <Text style={styles.linkText}>Enviar e-mail de imprensa →</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  link: { marginTop: 8 },
  linkText: { color: colors.primary[600], fontWeight: '600' },
});
