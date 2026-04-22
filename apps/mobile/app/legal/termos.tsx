import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LegalScreen } from '../../src/components/LegalScreen';
import { colors } from '../../src/theme/colors';

export default function TermosScreen() {
  return (
    <LegalScreen
      title="Termos de Uso"
      intro="Versão 1.0.0 — Última atualização: 16 de abril de 2026. A Vintage.br é um marketplace C2C que conecta pessoas físicas. Atuamos exclusivamente como intermediária tecnológica — não somos parte no contrato de compra e venda."
      sections={[
        {
          title: '1. Cadastro e elegibilidade',
          body:
            'Você deve ter 18 anos ou mais, ser pessoa física residente no Brasil, fornecer CPF válido, e-mail e telefone verdadeiros, manter apenas uma conta por pessoa e manter as credenciais seguras.',
        },
        {
          title: '2. Como vender',
          body:
            'Publique fotos reais (mínimo 4, máximo 20). Descreva com veracidade marca, tamanho, condição, medidas e defeitos. Defina o preço livremente, respeitando as regras. Não contorne o sistema de pagamento da plataforma.',
        },
        {
          title: '3. Como comprar',
          body:
            'Compre pelo preço anunciado ou faça uma oferta. Pagamento via PIX, cartão ou boleto (Mercado Pago). Após o pagamento, o vendedor é notificado e deve enviar o item em até 5 dias úteis. A compra é concluída após a confirmação do recebimento.',
        },
        {
          title: '4. Escrow e taxas',
          body:
            'O valor pago fica retido em conta segregada até a confirmação do recebimento. Taxa de serviço (Proteção ao Comprador): 5% pago pelo comprador no checkout. O vendedor recebe 100% do valor anunciado. Saque via PIX com valor mínimo de R$10,00.',
        },
        {
          title: '5. Direito de arrependimento (Art. 49 do CDC)',
          body:
            'O comprador pode exercer o direito de arrependimento em até 7 dias corridos a partir do recebimento, sem necessidade de justificativa. Em caso de produto defeituoso ou em desconformidade com o anunciado, os custos de devolução ficam a cargo do vendedor.',
        },
        {
          title: '6. Disputas',
          body:
            'O comprador tem até 7 dias após o recebimento para abrir uma disputa caso o item não esteja conforme o anunciado. A equipe Vintage.br analisa em até 5 dias úteis. A decisão pode incluir estorno ao comprador, liberação ao vendedor ou acordo mediado.',
        },
        {
          title: '7. Itens proibidos',
          body:
            'É proibido anunciar itens falsificados, drogas, armas e munição, conteúdo adulto, itens perigosos, animais vivos e conteúdo pirata. Consulte as Diretrizes da Comunidade para a lista completa.',
        },
        {
          title: '8. Foro e legislação',
          body:
            'Estes Termos são regidos pelas leis brasileiras, incluindo o Código de Defesa do Consumidor (Lei 8.078/1990), o Marco Civil da Internet (Lei 12.965/2014) e a LGPD (Lei 13.709/2018). Foro da comarca do domicílio do consumidor.',
        },
      ]}
      footer={
        <TouchableOpacity
          style={styles.link}
          onPress={() => Linking.openURL('https://vintage.br/termos')}
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
