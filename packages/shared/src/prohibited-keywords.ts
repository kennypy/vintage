/**
 * Prohibited keywords for listing content moderation.
 * Covers drug-related slang, weapons, counterfeit indicators,
 * adult content, and common scam phrases in Brazilian Portuguese.
 *
 * Matching is case-insensitive, accent-insensitive, space-insensitive,
 * leet-speak-resistant, and punctuation-insensitive.
 */

export const PROHIBITED_KEYWORDS: string[] = [

  // =====================================================================
  // COCAINE
  // =====================================================================
  // English — formal & slang
  'cocaine', 'cocaine', 'cokaine', 'kokaine', 'coacine',
  'coke',
  'snow',        // most common EN slang
  'blow',
  'white',       // as in "selling white"
  'powder',      // as in "selling powder"
  'nose candy',
  'charlie',     // UK/international slang
  'marching powder',
  'peruvian flake',
  'peruvian',    // "selling peruvian"
  'yeyo', 'yayo',
  'booger sugar',
  'white girl',  // drug slang
  'white horse', // also heroin
  'white lady',
  'flake',       // cocaine cut
  'stardust',
  'toot',
  // Portuguese / BR
  'cocaina',
  'neve',        // snow in PT — #1 BR cocaine slang
  'farinha',     // flour — common BR slang
  'talco',       // talcum — BR slang
  'parica',      // BR indigenous-origin slang
  'branquinha',  // "little white one"
  'po da lua',   // moon dust

  // =====================================================================
  // MARIJUANA / CANNABIS
  // =====================================================================
  // English
  'marijuana', 'marihuana',
  'cannabis',
  'weed',
  'pot',
  'grass',
  'herb',
  'ganja',
  'reefer',
  'joint',
  'bud',
  'chronic',
  'dank',
  'mary jane',
  'loud',        // "loud pack" = strong weed
  'kush',
  'hash',
  'hashish',
  'haxixe',
  'skunk',
  // Portuguese / BR
  'maconha',
  'erva',        // herb — #1 BR marijuana slang
  'fumo',        // smoke
  'liamba',      // BR/African-origin slang
  'diamba',
  'mato',        // weed/bush
  'baseado',     // joint (BR)
  'lolo',
  'cheirinho da lolo',

  // =====================================================================
  // CRACK COCAINE
  // =====================================================================
  // English
  'crack cocaine',
  'crack rock',
  'freebase',
  'ready rock',
  // Portuguese / BR
  'pedra',       // rock — #1 BR crack slang (contextual but high risk)
  'pedrinha',
  'oxi',         // oxidised cocaine paste — BR specific
  'pasta base',

  // =====================================================================
  // HEROIN
  // =====================================================================
  // English
  'heroin',
  'smack',       // most common EN slang
  'junk',
  'horse',       // heroin slang
  'skag',
  'black tar',
  'brown sugar',
  'big H',
  'hell dust',
  'thunder',
  'dragon',      // "chasing the dragon"
  // Portuguese / BR
  'heroina',
  'cavalo',      // horse (PT)
  'po preto',    // black powder

  // =====================================================================
  // METHAMPHETAMINE
  // =====================================================================
  // English
  'methamphetamine', 'metanfetamine',
  'meth',
  'crystal meth',
  'crystal',     // as in "selling crystal"
  'ice',         // meth slang
  'glass',       // meth slang
  'speed',
  'tina',        // gay community meth slang
  'crank',
  'tweak',
  'shards',
  // Portuguese / BR
  'metanfetamina',
  'anfetamina', 'anfetamine',
  'rebite',      // BR truck-driver amphetamine slang
  'bolinha',     // pill (amphetamine)

  // =====================================================================
  // ECSTASY / MDMA
  // =====================================================================
  // English
  'ecstasy',
  'mdma',
  'molly',       // pure MDMA — very common EN slang
  'molly pill',
  'disco biscuits',
  'love drug',
  // Portuguese / BR
  'balinha',     // little ball/pill — BR ecstasy slang
  'bala',        // pill (BR)

  // =====================================================================
  // LSD
  // =====================================================================
  // English
  'lsd',
  'acid',        // most common EN slang
  'acid tabs',
  'blotter',
  'lucy',        // Lucy in the Sky
  'tab acid',
  'doses lsd',
  // Portuguese / BR
  'acido litico',
  'selinho',     // BR slang for LSD tab
  'cartela lsd',

  // =====================================================================
  // KETAMINE
  // =====================================================================
  // English
  'ketamine',
  'special k',
  'vitamin k',
  'horse tranquilizer',
  'ket',
  // Portuguese / BR
  'ketamina',

  // =====================================================================
  // OTHER DRUGS
  // =====================================================================
  'psilocibina',
  'cogumelo magico',
  'salvia divinorum',
  'lsd',
  'po branco',
  'noz moscada entorpecente',

  // =====================================================================
  // FIREARMS & WEAPONS
  // =====================================================================
  // English — formal
  'firearm', 'firearms',
  'handgun', 'handguns',
  'pistol', 'pistols',
  'revolver', 'revolvers',
  'shotgun', 'shotguns',
  'rifle', 'rifles',
  'assault rifle',
  'submachine gun',
  'machine gun',
  'glock',
  'beretta',
  'ar-15', 'ar15',
  'ak-47', 'ak47',
  'uzi',
  'tec-9', 'tec9',
  'mac-10', 'mac10',
  'silencer',
  'suppressor',
  'ammunition',
  'hollow point',
  'armor piercing',
  // English — slang
  'gun',         // THE missed term
  'guns',
  'piece',       // "packing a piece"
  'heat',        // "packing heat"
  'strap',       // gun slang
  'banger',      // gun slang
  'burner',      // gun slang
  'heater',      // gun slang
  'iron',        // "packing iron"
  'rod',         // gun slang
  'tool',        // "got a tool"
  'nine',        // 9mm
  'nine millimeter',
  // Portuguese / BR — formal
  'arma de fogo',
  'arma ilegal',
  'pistola',
  'espingarda',
  'fuzil',
  'metralhadora',
  'submetralhadora',
  'carabina',
  'municao',
  'silenciador',
  'supressor',
  'carregador de arma',
  'bala calibre',
  'dinamite',
  'granada',
  'explosivo',
  'detonador',
  'polvora',
  'bomba caseira',
  'colete a prova de balas',
  'faca de combate',
  'soco ingles',
  'taser ilegal',
  // Portuguese / BR — slang
  'ferro',       // iron — #1 BR gun slang
  'calco',       // BR gun slang
  'brinquedo',   // toy (ironic BR gun reference)
  'espeto',      // spit/skewer — BR slang
  'maquininha',  // little machine — BR slang
  'canao',       // big gun (BR)

  // =====================================================================
  // COUNTERFEIT / PIRACY
  // =====================================================================
  'replica',
  'falsificado', 'falsificada',
  'imitacao',
  'copia pirata',
  'grade a fake',
  'grade b fake',
  '11 fake',
  'super fake',
  'primeira linha falso',
  'imposto zero',
  'sem nota fiscal falsificada',
  'lacre violado',

  // =====================================================================
  // ADULT / EXPLICIT CONTENT
  // =====================================================================
  'conteudo adulto',
  'pornografia',
  'material sexual explicito',
  'filme adulto',
  'fotos intimas',
  'nudes',
  'sexo explicito',

  // =====================================================================
  // SCAM / OFF-PLATFORM FRAUD
  // =====================================================================
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

