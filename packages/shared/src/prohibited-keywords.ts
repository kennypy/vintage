/**
 * Prohibited keywords for listing content moderation.
 * Covers drug-related slang, weapons, counterfeit indicators,
 * adult content, and common scam phrases in Brazilian Portuguese.
 *
 * Matching is case-insensitive and accent-insensitive.
 */

export const PROHIBITED_KEYWORDS: string[] = [
  // --- Drugs (BR slang & formal terms) ---
  'cocaina',
  'cocaine',
  'maconha',
  'cannabis',
  'marijuana',
  'crack',
  'heroina',
  'heroin',
  'metanfetamina',
  'anfetamina',
  'lsd',
  'ecstasy',
  'mdma',
  'ketamina',
  'oxi',
  'baseado',
  'skunk',
  'haxixe',
  'hashish',
  'loló',
  'lolo',
  'nóz moscada',
  'noz moscada entorpecente',
  'psilocibina',
  'cogumelo magico',
  'cogumelo mágico',
  'salvia divinorum',
  'bolinha',
  'rebite',
  'pó branco',
  'po branco',
  'cheira',
  'cheirar',
  'cheirinho da loló',
  'cheirinho da lolo',

  // --- Weapons ---
  'arma de fogo',
  'pistola',
  'revólver',
  'revolver',
  'espingarda',
  'fuzil',
  'metralhadora',
  'submetralhadora',
  'rifle',
  'carabina',
  'munição',
  'municao',
  'bala calibre',
  'silenciador',
  'supressor',
  'carregador de arma',
  'cano de arma',
  'gatilho de arma',
  'faca de combate',
  'soco inglês',
  'soco ingles',
  'taser ilegal',
  'bomba caseira',
  'explosivo',
  'detonador',
  'pólvora',
  'polvora',
  'dinamite',
  'granada',
  'colete à prova de balas',
  'colete a prova de balas',

  // --- Counterfeit / Piracy ---
  'réplica',
  'replica',
  'falsificado',
  'falsificada',
  'falso',
  'falsa',
  'imitação',
  'imitacao',
  'cópia pirata',
  'copia pirata',
  'grade a fake',
  'grade b fake',
  '1:1 fake',
  'super fake',
  'primeira linha falso',
  'imposto zero',
  'sem nota fiscal falsificada',
  'lacre violado',

  // --- Adult / Explicit content ---
  'conteúdo adulto',
  'conteudo adulto',
  'pornografia',
  'material sexual explícito',
  'material sexual explicito',
  'filme adulto',
  'fotos íntimas',
  'fotos intimas',
  'nudes',
  'sexo explícito',
  'sexo explicito',

  // --- Scam / Fraud phrases ---
  'pague e receba depois',
  'envio após pagamento fora da plataforma',
  'envio apos pagamento fora da plataforma',
  'pix fora do aplicativo',
  'deposito direto na conta',
  'depósito direto na conta',
  'negocio fora do app',
  'negócio fora do app',
  'contato pelo whatsapp para fechar',
  'venda fora da plataforma',
];

/**
 * Normalise a string: lowercase + remove accents so matching is
 * accent-insensitive (e.g. "réplica" matches "replica").
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check whether `text` contains any prohibited keyword.
 * Returns `{ matched: true, term }` on first match, otherwise `{ matched: false }`.
 */
export function containsProhibitedContent(text: string): { matched: boolean; term?: string } {
  const normalised = normalise(text);
  for (const keyword of PROHIBITED_KEYWORDS) {
    if (normalised.includes(normalise(keyword))) {
      return { matched: true, term: keyword };
    }
  }
  return { matched: false };
}
