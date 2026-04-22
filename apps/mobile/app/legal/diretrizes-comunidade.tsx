import { LegalScreen } from '../../src/components/LegalScreen';

export default function DiretrizesScreen() {
  return (
    <LegalScreen
      title="Diretrizes da Comunidade"
      intro="A Vintage.br é construída com base em confiança e respeito. Estas diretrizes valem para todo conteúdo publicado e toda interação dentro da plataforma."
      sections={[
        {
          title: 'O que é permitido',
          body:
            '• Roupas, calçados, bolsas e acessórios secondhand autênticos.\n• Itens novos sem uso (NWT — "new with tags") de marcas reais.\n• Fotos originais, feitas pelo vendedor.\n• Descrições sinceras, com defeitos e medidas reais.',
        },
        {
          title: 'O que não é permitido',
          body:
            '• Itens falsificados, réplicas ou "dupes".\n• Roupa íntima usada, meias usadas, uniformes escolares usados.\n• Armas de fogo, munição, drogas e parafernália.\n• Itens adultos, conteúdo sexualmente explícito.\n• Animais vivos ou produtos derivados de espécies ameaçadas.\n• Produtos eletrônicos, medicamentos, suplementos.\n• Conteúdo pirata, software sem licença.\n• Itens que requerem registro legal (veículos, imóveis).',
        },
        {
          title: 'Fotos e descrições',
          body:
            '• Use fotos originais da peça real (mínimo 4 ângulos).\n• Não use fotos da internet, catálogo da marca ou outros anúncios.\n• Mostre defeitos de perto: manchas, puídos, costuras soltas.\n• Não inclua rostos, dados pessoais ou logos/marcas de outras plataformas.\n• Informe marca, tamanho, medidas (comprimento, busto, ombros, manga), cor e condição.',
        },
        {
          title: 'Mensagens e conduta',
          body:
            'Sem assédio, discriminação, discurso de ódio ou ameaças. Sem pedir ou compartilhar contatos pessoais para fechar negócio fora da plataforma — quem faz isso perde a Proteção ao Comprador. Sem spam, links externos ou tentativas de coletar dados.',
        },
        {
          title: 'Autenticidade',
          body:
            'Para itens de marcas premium (Louis Vuitton, Gucci, Prada, Chanel, etc.), oferecemos verificação manual pré-envio. Anunciar réplica como autêntica é motivo de banimento imediato.',
        },
        {
          title: 'Consequências',
          body:
            'Violações levam a: remoção do anúncio, suspensão temporária, banimento permanente e/ou reporte às autoridades competentes. Denúncias de usuários são analisadas em até 48h úteis pela equipe de moderação.',
        },
      ]}
    />
  );
}
