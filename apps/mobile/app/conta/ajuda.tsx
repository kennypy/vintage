import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/contexts/ThemeContext';

interface FaqItem {
  q: string;
  a: string;
}

interface FaqSection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: FaqItem[];
}

const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Comprando na Vintage',
    icon: 'bag-handle-outline',
    items: [
      {
        q: 'Como comprar um item?',
        a: 'Encontre o item que deseja, toque em "Comprar agora" ou faça uma oferta ao vendedor. Ao finalizar a compra, pague via PIX. O vendedor tem 5 dias úteis para enviar o pedido.',
      },
      {
        q: 'O que acontece depois que compro?',
        a: 'Após o pagamento via PIX, o valor fica retido com segurança na Vintage até você confirmar o recebimento. O vendedor é notificado e tem 5 dias úteis para postar o item. Você recebe o código de rastreio assim que o envio for feito. Quando o item chegar, você tem 2 dias para verificar e confirmar que está tudo certo. Se não houver nenhuma ação, a compra é confirmada automaticamente.',
      },
      {
        q: 'Posso fazer uma oferta abaixo do preço?',
        a: 'Sim! Você pode fazer ofertas de até 50% do valor anunciado. O vendedor tem 48 horas para aceitar, recusar ou fazer uma contraproposta. Se aceitar, o item é reservado para você concluir o pagamento.',
      },
      {
        q: 'Posso parcelar a compra?',
        a: 'Aceitamos PIX, cartão de crédito (com parcelamento em até 12x) e boleto bancário.',
      },
      {
        q: 'Como funciona o frete?',
        a: 'O comprador paga o frete. O valor é calculado automaticamente com base no CEP de origem e destino, peso e dimensões do pacote. As opções de envio incluem Correios (PAC e SEDEX) e Jadlog. O prazo estimado é exibido antes da compra.',
      },
    ],
  },
  {
    title: 'Vendendo na Vintage',
    icon: 'pricetag-outline',
    items: [
      {
        q: 'Como faço para vender?',
        a: 'Toque em "Vender" na barra inferior, tire fotos do item (até 20 fotos, recomendamos pelo menos 4 — frente, costas, etiqueta e detalhes), preencha título, descrição, preço, tamanho e condição, e publique. Seu anúncio fica visível imediatamente para todos os compradores.',
      },
      {
        q: 'O que acontece quando vendo um item?',
        a: 'Quando alguém compra seu item, você recebe uma notificação imediata. Você tem 5 dias úteis para embalar e postar o pacote. Após a postagem, insira o código de rastreio ou use a etiqueta pré-paga gerada pela Vintage. Quando o comprador confirmar o recebimento (ou após 2 dias sem disputa), o valor da venda é creditado na sua carteira Vintage.',
      },
      {
        q: 'Como recebo o pagamento?',
        a: 'O valor é creditado na sua carteira Vintage após a confirmação da entrega. Você pode sacar para sua conta bancária via PIX a qualquer momento, desde que o saldo mínimo seja de R$10,00. O saque via PIX é instantâneo.',
      },
      {
        q: 'Quanto a Vintage cobra de taxa?',
        a: 'A Vintage não cobra taxa do vendedor. A taxa de Proteção ao Comprador (R$3,50 + 5% do valor do item) é paga pelo comprador. O valor que você define é o valor que você recebe.',
      },
      {
        q: 'Como excluir ou editar um anúncio?',
        a: 'Acesse "Meus anúncios" no perfil, toque no anúncio que deseja alterar. Para editar, toque no ícone de lápis. Para excluir, toque no ícone de lixeira e confirme. Anúncios com uma venda em andamento não podem ser excluídos.',
      },
      {
        q: 'Como dar mais visibilidade ao meu anúncio?',
        a: 'Você pode usar o Destaque (R$4,90 por 3 dias) para subir seu anúncio no feed, o Spotlight (R$29,90 por 7 dias) para aparecer na seção de destaques, ou o Megafone (grátis por 7 dias em anúncios novos) para notificar compradores interessados na sua categoria.',
      },
    ],
  },
  {
    title: 'Proteção ao Comprador',
    icon: 'shield-checkmark-outline',
    items: [
      {
        q: 'Por que toda compra tem Proteção ao Comprador?',
        a: 'A Proteção ao Comprador existe para garantir que você receba exatamente o que comprou. O pagamento fica retido com a Vintage até você confirmar que o item chegou conforme descrito. Se houver qualquer problema, você pode abrir uma disputa e ser reembolsado. Isso torna a compra de segunda mão tão segura quanto comprar em uma loja.',
      },
      {
        q: 'Quanto custa a Proteção ao Comprador?',
        a: 'A taxa é de R$3,50 fixo + 5% do valor do item. Por exemplo, para um item de R$100,00, a taxa seria R$8,50 (R$3,50 + R$5,00). Essa taxa é adicionada automaticamente no checkout.',
      },
      {
        q: 'O que a Proteção ao Comprador cobre?',
        a: 'A proteção cobre: item significativamente diferente da descrição ou fotos, item com defeitos não mencionados no anúncio, item incorreto (tamanho, cor ou modelo diferente do anunciado), item falsificado vendido como original, e item não recebido dentro do prazo de entrega.',
      },
      {
        q: 'Como abrir uma disputa?',
        a: 'Você tem até 2 dias após o recebimento para abrir uma disputa. Vá em "Meus pedidos", selecione o pedido, toque em "Tenho um problema" e descreva o ocorrido com fotos. Recomendamos sempre tentar resolver diretamente com o vendedor primeiro pelo chat. Se não houver acordo, a equipe Vintage analisa o caso e decide em até 3 dias úteis.',
      },
    ],
  },
  {
    title: 'Item Não Conforme (como descrito)',
    icon: 'alert-circle-outline',
    items: [
      {
        q: 'O que É considerado "não conforme com a descrição"?',
        a: 'Um item é considerado não conforme quando:\n\n• O item tem manchas, rasgos, furos ou defeitos que não foram mencionados no anúncio\n• O tamanho real é diferente do anunciado (ex: anunciou M, enviou G)\n• A cor é significativamente diferente das fotos (ex: anunciou preto, é azul marinho)\n• O item é falsificado, mas foi vendido como original\n• A marca é diferente da anunciada\n• Faltam peças ou acessórios mencionados na descrição (ex: cinto, capuz removível)\n• O item tem cheiro forte de mofo, cigarro ou outros odores não mencionados\n• O item foi descrito como "novo com etiqueta" mas não tem etiqueta',
      },
      {
        q: 'O que NÃO é considerado "não conforme com a descrição"?',
        a: 'Um item NÃO é considerado não conforme quando:\n\n• O item simplesmente não ficou bem em você ou não era do seu gosto — moda é subjetiva\n• Pequenas variações de cor devido a diferenças de tela/monitor\n• Sinais normais de uso em itens descritos como "Bom" ou "Satisfatório"\n• O item tem o tamanho correto, mas não serve no seu corpo (tamanhos variam entre marcas)\n• Você encontrou o mesmo item mais barato em outro lugar\n• O frete demorou mais do que o esperado (isso é responsabilidade da transportadora)\n• Você simplesmente mudou de ideia após a compra\n• O tecido tem textura diferente do que você imaginou (se não foi especificado na descrição)',
      },
      {
        q: 'O que acontece se a disputa for aprovada?',
        a: 'Se a equipe Vintage decidir a seu favor, você recebe o reembolso integral (valor do item + frete + taxa de proteção) via crédito na carteira Vintage ou estorno PIX. O vendedor recebe instruções para o item ser devolvido, com frete pago pela Vintage. Em casos de falsificação, o anúncio é removido e o vendedor pode receber uma suspensão.',
      },
      {
        q: 'O que acontece se a disputa for negada?',
        a: 'Se a equipe Vintage entender que o item está conforme descrito, o pagamento é liberado para o vendedor normalmente. Você pode entrar em contato com o suporte para mais esclarecimentos, mas a decisão é final após revisão.',
      },
    ],
  },
  {
    title: 'Envio e Entrega',
    icon: 'cube-outline',
    items: [
      {
        q: 'Como enviar meu item vendido?',
        a: 'Após a venda, vá em "Meus pedidos" e toque em "Enviar". Você pode usar a etiqueta pré-paga gerada pela Vintage (recomendado) ou enviar por conta própria. Com a etiqueta pré-paga, basta embalar o item, colar a etiqueta e levar ao ponto de postagem.',
      },
      {
        q: 'Como escanear o QR Code nos Correios?',
        a: 'Ao gerar a etiqueta de envio na Vintage, você recebe um QR Code no app. No ponto de postagem dos Correios:\n\n1. Abra o pedido em "Meus pedidos" e toque em "Ver QR Code"\n2. Mostre o QR Code no balcão dos Correios — o atendente vai escanear\n3. O sistema dos Correios puxa automaticamente os dados de envio (origem, destino, peso)\n4. Você recebe o comprovante de postagem\n5. O rastreio é atualizado automaticamente no app\n\nDica: salve uma captura de tela do QR Code caso esteja sem internet no local. Algumas agências dos Correios também têm terminais de autoatendimento onde você mesmo pode escanear.',
      },
      {
        q: 'Qual o prazo para enviar?',
        a: 'Você tem 5 dias úteis após a confirmação do pagamento para postar o item. Se não enviar nesse prazo, o pedido é cancelado automaticamente e o comprador recebe o reembolso integral.',
      },
      {
        q: 'Quais transportadoras são aceitas?',
        a: 'Trabalhamos com Correios (PAC e SEDEX) e Jadlog. O PAC é a opção mais econômica (5-12 dias úteis), SEDEX é a mais rápida (1-3 dias úteis), e Jadlog é uma alternativa com bons preços para pacotes maiores.',
      },
      {
        q: 'Como embalar meu item?',
        a: 'Embale com cuidado para proteger o item durante o transporte. Use um saco plástico para proteger de umidade, depois coloque em uma caixa de papelão ou envelope reforçado. Para itens delicados como sapatos, use papel amassado para preencher espaços vazios. Não se esqueça de remover etiquetas de preço pessoal.',
      },
      {
        q: 'E se o item se perder no frete?',
        a: 'Se o rastreio mostrar que o item foi extraviado pela transportadora, o comprador recebe reembolso integral e o vendedor também recebe o valor da venda. A Vintage assume o prejuízo do extravio, desde que o envio tenha sido feito pela etiqueta pré-paga da plataforma.',
      },
    ],
  },
  {
    title: 'Conta e Segurança',
    icon: 'person-circle-outline',
    items: [
      {
        q: 'Como verificar minha conta?',
        a: 'Acesse Perfil > Verificação e siga os passos: confirme seu e-mail, número de celular e CPF. A verificação aumenta a confiança dos compradores e é obrigatória para sacar valores da carteira.',
      },
      {
        q: 'É seguro comprar na Vintage?',
        a: 'Sim. Todo pagamento é processado de forma segura e fica retido até a confirmação da entrega. Nunca transfira dinheiro diretamente para um vendedor fora da plataforma. Todas as conversas e transações ficam registradas para sua proteção.',
      },
      {
        q: 'Posso cancelar uma compra?',
        a: 'Você pode solicitar o cancelamento antes do vendedor enviar o item. Após o envio, não é possível cancelar — mas você pode abrir uma disputa após receber se o item não estiver conforme descrito.',
      },
    ],
  },
  {
    title: 'Carteira e Pagamentos',
    icon: 'wallet-outline',
    items: [
      {
        q: 'Como funciona a carteira Vintage?',
        a: 'A carteira é onde ficam seus ganhos de vendas. Após cada venda confirmada, o valor é creditado automaticamente. Você pode usar o saldo para comprar outros itens na Vintage ou sacar via PIX para sua conta bancária.',
      },
      {
        q: 'Qual o valor mínimo para saque?',
        a: 'O valor mínimo para saque é de R$10,00. O saque via PIX é processado instantaneamente, a qualquer hora do dia.',
      },
      {
        q: 'Indiquei um amigo. Como recebo o bônus?',
        a: 'Quando seu amigo se cadastra usando seu código de indicação e faz a primeira compra, vocês dois recebem R$10,00 de crédito na carteira Vintage. O crédito é adicionado automaticamente após a confirmação da primeira compra do indicado.',
      },
    ],
  },
];

export default function AjudaScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const openSupport = () => router.push('/conta/suporte');
  const openEmail = () => {
    Linking.openURL('mailto:suporte@vintage.br').catch(() => { /* mail client unavailable */ });
  };

  const toggleSection = (index: number) => {
    setExpandedSection(expandedSection === index ? null : index);
    setExpandedItem(null);
  };

  const toggleItem = (key: string) => {
    setExpandedItem(expandedItem === key ? null : key);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: theme.card }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="help-circle" size={48} color={colors.primary[600]} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Central de Ajuda</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Como podemos te ajudar?</Text>
      </View>

      <View style={styles.contactSection}>
        <TouchableOpacity
          onPress={openSupport}
          style={[styles.contactCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="chatbubble-outline" size={24} color={colors.primary[600]} />
          <View style={styles.contactInfo}>
            <Text style={[styles.contactTitle, { color: theme.text }]}>Abrir um ticket</Text>
            <Text style={[styles.contactSub, { color: theme.textTertiary }]}>Respondemos em até 24h</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openEmail}
          style={[styles.contactCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <Ionicons name="mail-outline" size={24} color={colors.primary[600]} />
          <View style={styles.contactInfo}>
            <Text style={[styles.contactTitle, { color: theme.text }]}>E-mail</Text>
            <Text style={[styles.contactSub, { color: theme.textTertiary }]}>suporte@vintage.br</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </TouchableOpacity>
      </View>

      {FAQ_SECTIONS.map((section, sectionIndex) => (
        <View key={sectionIndex} style={[styles.section, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection(sectionIndex)}
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.primary[50] }]}>
                <Ionicons name={section.icon} size={20} color={colors.primary[600]} />
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            </View>
            <Ionicons
              name={expandedSection === sectionIndex ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textTertiary}
            />
          </TouchableOpacity>

          {expandedSection === sectionIndex && section.items.map((faq, itemIndex) => {
            const key = `${sectionIndex}-${itemIndex}`;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.faqItem, { borderBottomColor: theme.border }]}
                onPress={() => toggleItem(key)}
              >
                <View style={styles.faqHeader}>
                  <Text style={[styles.faqQuestion, { color: theme.text }]}>{faq.q}</Text>
                  <Ionicons
                    name={expandedItem === key ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.textTertiary}
                  />
                </View>
                {expandedItem === key && (
                  <Text style={[styles.faqAnswer, { color: theme.textSecondary }]}>{faq.a}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: 'center', padding: 28 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary[50], justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 14, marginTop: 4 },
  contactSection: { margin: 12, gap: 8 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 16, borderWidth: 1,
  },
  contactInfo: { flex: 1 },
  contactTitle: { fontSize: 15, fontWeight: '600' },
  contactSub: { fontSize: 12, marginTop: 2 },
  section: { marginTop: 8, marginHorizontal: 0 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sectionIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  faqItem: {
    borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 16,
  },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQuestion: { flex: 1, fontSize: 14, fontWeight: '500', paddingRight: 8 },
  faqAnswer: { fontSize: 13, marginTop: 10, lineHeight: 22 },
});
