import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';

const FAQS = [
  {
    q: 'Como faço para vender?',
    a: 'Toque em "Vender" na barra inferior, preencha os dados do seu item (título, fotos, preço, condição) e publique. Seu anúncio ficará visível para todos os compradores.',
  },
  {
    q: 'Como recebo o pagamento?',
    a: 'Quando uma venda é concluída, o valor é creditado na sua carteira Vintage. Você pode sacar a qualquer momento via PIX.',
  },
  {
    q: 'Como funciona o frete?',
    a: 'O comprador paga o frete. Você escolhe enviar via Correios (PAC ou SEDEX) ou Jadlog. Após a venda, imprimimos a etiqueta para você.',
  },
  {
    q: 'O que fazer se houver problema com a compra?',
    a: 'Você tem até 7 dias após o recebimento para abrir uma disputa. Entre em contato com o vendedor primeiro. Se não resolver, acione o suporte Vintage.',
  },
  {
    q: 'Como excluir um anúncio?',
    a: 'Acesse "Meus anúncios" no perfil, toque no ícone de lixeira ao lado do anúncio e confirme a exclusão.',
  },
  {
    q: 'Posso parcelar a compra?',
    a: 'No momento aceitamos PIX e pagamento à vista. Parcelamento via cartão estará disponível em breve.',
  },
];

export default function AjudaScreen() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="help-circle" size={48} color={colors.primary[600]} />
        </View>
        <Text style={styles.title}>Central de Ajuda</Text>
        <Text style={styles.subtitle}>Como podemos te ajudar?</Text>
      </View>

      <View style={styles.contactSection}>
        <TouchableOpacity style={styles.contactCard}>
          <Ionicons name="chatbubble-outline" size={24} color={colors.primary[600]} />
          <View style={styles.contactInfo}>
            <Text style={styles.contactTitle}>Chat ao vivo</Text>
            <Text style={styles.contactSub}>Respondemos em minutos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.contactCard}>
          <Ionicons name="mail-outline" size={24} color={colors.primary[600]} />
          <View style={styles.contactInfo}>
            <Text style={styles.contactTitle}>E-mail</Text>
            <Text style={styles.contactSub}>Respondemos em até 24h</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Perguntas frequentes</Text>
        {FAQS.map((faq, index) => (
          <TouchableOpacity
            key={index}
            style={styles.faqItem}
            onPress={() => setExpanded(expanded === index ? null : index)}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{faq.q}</Text>
              <Ionicons
                name={expanded === index ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.neutral[400]}
              />
            </View>
            {expanded === index && (
              <Text style={styles.faqAnswer}>{faq.a}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  hero: { alignItems: 'center', padding: 28, backgroundColor: colors.neutral[0] },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.neutral[900] },
  subtitle: { fontSize: 14, color: colors.neutral[500], marginTop: 4 },
  contactSection: { margin: 12, gap: 8 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.neutral[0], borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: colors.neutral[200],
  },
  contactInfo: { flex: 1 },
  contactTitle: { fontSize: 15, fontWeight: '600', color: colors.neutral[800] },
  contactSub: { fontSize: 12, color: colors.neutral[400], marginTop: 2 },
  section: { backgroundColor: colors.neutral[0], marginTop: 4, padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.neutral[900], marginBottom: 12 },
  faqItem: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.neutral[200],
    paddingVertical: 14,
  },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQuestion: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.neutral[800], paddingRight: 8 },
  faqAnswer: { fontSize: 14, color: colors.neutral[600], marginTop: 10, lineHeight: 22 },
});
