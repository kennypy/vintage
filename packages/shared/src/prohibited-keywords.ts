/**
 * Prohibited keywords for listing content moderation.
 * Covers drug-related slang, weapons, counterfeit indicators,
 * adult content, and common scam phrases in Brazilian Portuguese.
 *
 * Matching is case-insensitive, accent-insensitive, space-insensitive,
 * leet-speak-resistant, and punctuation-insensitive.
 */

export const PROHIBITED_KEYWORDS: string[] = [
  // --- Drugs (BR slang & formal terms) ---
  'cocaina',
  'cocaine',
  'cokaine',   // common misspelling
  'kokaine',   // phonetic variant
  'coacine',   // transposition evasion
  'maconha',
  'cannabis',
  'marijuana',
  'marihuana',
  'crack',
  'heroina',
  'heroin',
  'heroina',
  'metanfetamina',
  'metanfetamine',
  'anfetamina',
  'anfetamine',
  'lsd',
  'ecstasy',
  'mdma',
  'ketamina',
  'ketamine',
  'oxi',
  'baseado',
  'skunk',
  'haxixe',
  'hashish',
  'lolo',
  'noz moscada entorpecente',
  'psilocibina',
  'cogumelo magico',
  'salvia divinorum',
  'bolinha',
  'rebite',
  'po branco',
  'cheirinho da lolo',

  // --- Weapons ---
  'arma de fogo',
  'pistola',
  'revolver',
  'espingarda',
  'fuzil',
  'metralhadora',
  'submetralhadora',
  'rifle',
  'carabina',
  'municao',
  'bala calibre',
  'silenciador',
  'supressor',
  'carregador de arma',
  'cano de arma',
  'gatilho de arma',
  'faca de combate',
  'soco ingles',
  'taser ilegal',
  'bomba caseira',
  'explosivo',
  'detonador',
  'polvora',
  'dinamite',
  'granada',
  'colete a prova de balas',

  // --- Counterfeit / Piracy ---
  'replica',
  'falsificado',
  'falsificada',
  'imitacao',
  'copia pirata',
  'grade a fake',
  'grade b fake',
  '11 fake',   // "1:1 fake" after stripping punctuation
  'super fake',
  'primeira linha falso',
  'imposto zero',
  'sem nota fiscal falsificada',
  'lacre violado',

  // --- Adult / Explicit content ---
  'conteudo adulto',
  'pornografia',
  'material sexual explicito',
  'filme adulto',
  'fotos intimas',
  'nudes',
  'sexo explicito',

  // --- Scam / Fraud phrases ---
  'pague e receba depois',
  'envio apos pagamento fora da plataforma',
  'pix fora do aplicativo',
  'deposito direto na conta',
  'negocio fora do app',
  'contato pelo whatsapp para fechar',
  'venda fora da plataforma',
];

/**
 * Normalise a string for matching:
 * 1. Lowercase
 * 2. Strip accents (NFD + remove combining marks)
 * 3. Leet-speak substitution (0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s)
 * 4. Strip ALL non-alphanumeric characters (spaces, punctuation, hyphens…)
 *
 * This catches: "Co Caine", "c-o-c-a-i-n-e", "c0caine", "réplica", etc.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]/g, '');
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

