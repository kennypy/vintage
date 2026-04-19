import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface ListingSuggestions {
  title?: string;
  categoryId?: string;
  categorySlug?: string;
  color?: string;
  brandId?: string;
  brandName?: string;
  size?: string;
}

/**
 * Maps international clothing sizes to Brazilian equivalents.
 */
const INTL_TO_BR_SIZE: Record<string, string> = {
  XS: 'PP',
  S: 'P',
  M: 'M',
  L: 'G',
  XL: 'GG',
  XXL: 'XG',
  '2XL': 'XG',
  XXXL: 'XXG',
  '3XL': 'XXG',
};

const BR_SIZE_SET = new Set(['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG']);

/**
 * Attempt to extract a clothing size (in Brazilian notation) from raw OCR text.
 * Returns null when no confident match is found.
 */
function extractSizeFromText(rawText: string): string | null {
  const text = rawText.toUpperCase();

  // 1. Explicit label prefix: TAM[ANHO] or SIZE followed by the size value
  const labelMatch = text.match(
    /\b(?:TAMANHO|TAMANO|TAM|SIZE)\s*[:\s]\s*(PP|GG|XG|XXG|XS|XL|XXL|2XL|3XL|XXXL|[PMLG])\b/,
  );
  if (labelMatch) {
    const raw = labelMatch[1];
    return INTL_TO_BR_SIZE[raw] ?? (BR_SIZE_SET.has(raw) ? raw : null);
  }

  // 2. Unambiguous multi-char size tokens anywhere in the text (PP, GG, XG, XXG, XS, XL, etc.)
  const multiCharMatch = text.match(
    /\b(PP|GG|XG|XXG|XS|XL|XXL|2XL|3XL|XXXL)\b/,
  );
  if (multiCharMatch) {
    const raw = multiCharMatch[1];
    return INTL_TO_BR_SIZE[raw] ?? (BR_SIZE_SET.has(raw) ? raw : null);
  }

  // 3. Single-char tokens only when they appear alone on a line (avoids false positives)
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^[PMLG]$/.test(trimmed)) {
      return INTL_TO_BR_SIZE[trimmed] ?? (BR_SIZE_SET.has(trimmed) ? trimmed : null);
    }
  }

  return null;
}

/**
 * Maps Vision API English label descriptions (lowercased) to category slugs
 * from the seed data.
 */
const LABEL_TO_CATEGORY_SLUG: Record<string, string> = {
  // Tops / women's
  dress: 'vestidos',
  skirt: 'saias',
  blouse: 'blusas-camisetas',
  top: 'blusas-camisetas',
  't-shirt': 'blusas-camisetas',
  // Tops / men's
  shirt: 'camisetas-polos',
  jersey: 'camisetas-polos',
  polo: 'camisetas-polos',
  // Bottoms
  jeans: 'calcas-shorts',
  pants: 'calcas-shorts',
  trousers: 'calcas-shorts',
  shorts: 'bermudas-shorts',
  // Outerwear (men's slug covers unisex sportswear hoodies)
  jacket: 'casacos-jaquetas-masc',
  coat: 'casacos-jaquetas-masc',
  blazer: 'ternos-blazers',
  hood: 'casacos-jaquetas-masc',
  hoodie: 'casacos-jaquetas-masc',
  sweatshirt: 'casacos-jaquetas-masc',
  sweater: 'casacos-jaquetas-masc',
  pullover: 'casacos-jaquetas-masc',
  outerwear: 'casacos-jaquetas-masc',
  // Other clothing
  jumpsuit: 'macacoes',
  swimwear: 'moda-praia-fem',
  bikini: 'moda-praia-fem',
  sportswear: 'moda-fitness-fem',
  'athletic wear': 'moda-fitness-fem',
  leggings: 'moda-fitness-fem',
  // Footwear
  sneaker: 'tenis',
  sneakers: 'tenis',
  sandal: 'sandalias',
  sandals: 'sandalias',
  boot: 'botas',
  boots: 'botas',
  shoe: 'sapatos-sociais',
  shoes: 'sapatos-sociais',
  // Bags
  bag: 'bolsas',
  handbag: 'bolsas',
  purse: 'bolsas',
  backpack: 'mochilas',
  wallet: 'carteiras',
  // Accessories
  sunglasses: 'oculos-sol',
  watch: 'relogios',
  belt: 'cintos',
  hat: 'chapeus-bones',
  cap: 'chapeus-bones',
  scarf: 'lencos-cachecois',
};

/**
 * Reference color points for nearest-neighbour RGB matching.
 * Used to convert the dominant colour from IMAGE_PROPERTIES into a
 * Portuguese colour name.
 */
const COLOR_POINTS: Array<{ name: string; r: number; g: number; b: number }> =
  [
    { name: 'Preto', r: 0, g: 0, b: 0 },
    { name: 'Branco', r: 255, g: 255, b: 255 },
    { name: 'Cinza', r: 128, g: 128, b: 128 },
    { name: 'Vermelho', r: 210, g: 30, b: 30 },
    { name: 'Rosa', r: 230, g: 100, b: 150 },
    { name: 'Laranja', r: 220, g: 95, b: 30 },
    { name: 'Amarelo', r: 230, g: 200, b: 30 },
    { name: 'Verde', r: 30, g: 130, b: 50 },
    { name: 'Azul', r: 30, g: 80, b: 210 },
    { name: 'Azul Marinho', r: 20, g: 30, b: 100 },
    { name: 'Roxo', r: 120, g: 30, b: 175 },
    { name: 'Marrom', r: 120, g: 65, b: 30 },
    { name: 'Bege', r: 205, g: 185, b: 145 },
    { name: 'Creme', r: 238, g: 225, b: 195 },
    { name: 'Dourado', r: 210, g: 170, b: 40 },
    { name: 'Prata', r: 180, g: 180, b: 190 },
  ];

/**
 * Return the Portuguese colour name closest to the supplied RGB value using
 * Euclidean distance in RGB space.
 */
function rgbToPortugueseColor(r: number, g: number, b: number): string {
  let minDist = Infinity;
  let closest = 'Outro';
  for (const point of COLOR_POINTS) {
    const dist = Math.sqrt(
      (r - point.r) ** 2 + (g - point.g) ** 2 + (b - point.b) ** 2,
    );
    if (dist < minDist) {
      minDist = dist;
      closest = point.name;
    }
  }
  return closest;
}

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

interface VisionLabel {
  description: string;
  score: number;
}

interface VisionLogo {
  description: string;
}

interface VisionWebLabel {
  label: string;
}

interface VisionWebDetection {
  bestGuessLabels?: VisionWebLabel[];
}

interface VisionTextAnnotation {
  description: string;
}

interface VisionColor {
  color: { red: number; green: number; blue: number };
  score: number;
  pixelFraction: number;
}

interface VisionImageProperties {
  dominantColors?: {
    colors: VisionColor[];
  };
}

/**
 * Google Vision SafeSearch likelihoods. Ordered; treat as comparable
 * strings, not an enum — matches the raw API response verbatim.
 */
export type SafeSearchLikelihood =
  | 'UNKNOWN'
  | 'VERY_UNLIKELY'
  | 'UNLIKELY'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERY_LIKELY';

interface VisionSafeSearch {
  adult?: SafeSearchLikelihood;
  spoof?: SafeSearchLikelihood;
  medical?: SafeSearchLikelihood;
  violence?: SafeSearchLikelihood;
  racy?: SafeSearchLikelihood;
}

export interface ImageModerationFindings {
  adult: SafeSearchLikelihood;
  violence: SafeSearchLikelihood;
  racy: SafeSearchLikelihood;
  spoof: SafeSearchLikelihood;
  medical: SafeSearchLikelihood;
}

export type ModerationDecision = 'REJECT' | 'FLAG' | 'CLEAN';

/**
 * Classify SafeSearch findings into a decision the upload pipeline
 * can act on. Only `adult`, `violence`, and `racy` gate uploads —
 * `spoof` (meme-like manipulation) and `medical` are carried for
 * audit but not enforced, since medical imagery is not prohibited
 * on a fashion resale platform.
 *
 *   VERY_LIKELY → REJECT (upload refused outright)
 *   LIKELY      → FLAG   (upload succeeds + queued for admin review)
 *   else        → CLEAN
 */
export function classifyModeration(
  m: ImageModerationFindings | null,
): ModerationDecision {
  if (!m) return 'CLEAN';
  const checked: SafeSearchLikelihood[] = [m.adult, m.violence, m.racy];
  if (checked.includes('VERY_LIKELY')) return 'REJECT';
  if (checked.includes('LIKELY')) return 'FLAG';
  return 'CLEAN';
}

export interface AnalysisResult {
  suggestions: ListingSuggestions;
  moderation: ImageModerationFindings | null;
}

interface VisionResponse {
  labelAnnotations?: VisionLabel[];
  logoAnnotations?: VisionLogo[];
  webDetection?: VisionWebDetection;
  imagePropertiesAnnotation?: VisionImageProperties;
  textAnnotations?: VisionTextAnnotation[];
  safeSearchAnnotation?: VisionSafeSearch;
}

@Injectable()
export class ImageAnalysisService {
  private readonly logger = new Logger(ImageAnalysisService.name);
  private readonly apiKey: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey =
      this.configService.get<string>('GOOGLE_VISION_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.warn(
        'GOOGLE_VISION_API_KEY não configurado — análise de imagem desativada',
      );
    }
  }

  /**
   * Analyse an image buffer and return listing field suggestions
   * PLUS SafeSearch moderation findings. Never throws — a Vision
   * outage silently degrades to `{ suggestions: {}, moderation: null }`
   * so uploads don't break during third-party incidents. Callers
   * decide whether to gate on moderation=null (fail-open for launch).
   */
  async analyze(imageBuffer: Buffer): Promise<AnalysisResult> {
    if (!this.apiKey) {
      return { suggestions: {}, moderation: null };
    }

    try {
      const base64Image = imageBuffer.toString('base64');

      // Credential transport: header, not query string. Query-string keys
      // bleed into access logs, proxy buffers, and `new Error(url)` stack
      // traces. The X-goog-api-key header is what Google's own client
      // libraries use — keeps the key out of observability pipelines we
      // don't fully control.
      const response = await fetch(VISION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 15 },
                { type: 'LOGO_DETECTION', maxResults: 5 },
                { type: 'WEB_DETECTION', maxResults: 5 },
                { type: 'IMAGE_PROPERTIES' },
                { type: 'TEXT_DETECTION', maxResults: 1 },
                // SafeSearch rides on the same API call as the
                // autofill features — no extra round-trip, just one
                // additional feature unit of billing.
                { type: 'SAFE_SEARCH_DETECTION' },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Vision API respondeu com status ${response.status}`);
        return { suggestions: {}, moderation: null };
      }

      const data = (await response.json()) as {
        responses?: VisionResponse[];
      };
      const result = data?.responses?.[0];
      if (!result) {
        return { suggestions: {}, moderation: null };
      }

      const suggestions = await this.mapToSuggestions(result);
      const moderation = this.mapToModeration(result);
      return { suggestions, moderation };
    } catch (error) {
      this.logger.warn(
        `Análise de imagem falhou: ${String(error).slice(0, 200)}`,
      );
      return { suggestions: {}, moderation: null };
    }
  }

  private mapToModeration(
    result: VisionResponse,
  ): ImageModerationFindings | null {
    const ss = result.safeSearchAnnotation;
    if (!ss) return null;
    return {
      adult: ss.adult ?? 'UNKNOWN',
      violence: ss.violence ?? 'UNKNOWN',
      racy: ss.racy ?? 'UNKNOWN',
      spoof: ss.spoof ?? 'UNKNOWN',
      medical: ss.medical ?? 'UNKNOWN',
    };
  }

  private async mapToSuggestions(
    result: VisionResponse,
  ): Promise<ListingSuggestions> {
    const suggestions: ListingSuggestions = {};

    // --- Category from label detection ---
    const labels = result.labelAnnotations ?? [];
    this.logger.debug(
      `Labels: ${labels.map((l) => `${l.description}(${l.score.toFixed(2)})`).join(', ')}`,
    );
    this.logger.debug(
      `Logos: ${(result.logoAnnotations ?? []).map((l) => l.description).join(', ') || 'none'}`,
    );
    for (const label of labels) {
      const desc = label.description.toLowerCase();
      if (!suggestions.categoryId) {
        const slug = LABEL_TO_CATEGORY_SLUG[desc];
        if (slug) {
          const category = await this.prisma.category.findFirst({
            where: { slug },
            select: { id: true },
          });
          if (category) {
            suggestions.categoryId = category.id;
            suggestions.categorySlug = slug;
          }
        }
      }
      if (suggestions.categoryId) break;
    }

    // --- Color from IMAGE_PROPERTIES dominant colour (most reliable) ---
    const colors =
      result.imagePropertiesAnnotation?.dominantColors?.colors ?? [];
    if (colors.length > 0) {
      // Pick the colour with the highest score that has reasonable saturation
      // (skip near-white/near-grey backgrounds that score highly on product shots)
      const sorted = [...colors].sort((a, b) => b.score - a.score);
      for (const entry of sorted) {
        const { red: r, green: g, blue: b } = entry.color;
        // Skip colours that are very desaturated (likely background/shadow)
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation > 0.15 || max < 60) {
          suggestions.color = rgbToPortugueseColor(r, g, b);
          break;
        }
      }
      // Fallback: just use the top colour if nothing passed the saturation check
      if (!suggestions.color) {
        const { red: r, green: g, blue: b } = sorted[0].color;
        suggestions.color = rgbToPortugueseColor(r, g, b);
      }
    }

    // --- Brand from logo detection ---
    const logos = result.logoAnnotations ?? [];
    if (logos.length > 0) {
      const logoName = logos[0].description;
      const brand = await this.prisma.brand.findFirst({
        where: { name: { equals: logoName, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      if (brand) {
        suggestions.brandId = brand.id;
        suggestions.brandName = brand.name;
        this.logger.debug(`Logo matched to brand: ${brand.name}`);
      } else {
        this.logger.debug(`Logo detected (${logoName}) but not in brands DB`);
      }
    }

    // --- Title from web detection best guess ---
    const bestGuessLabels = result.webDetection?.bestGuessLabels ?? [];
    if (bestGuessLabels.length > 0) {
      suggestions.title = bestGuessLabels[0].label;
    }

    // --- Size from TEXT_DETECTION (clothing label OCR) ---
    // textAnnotations[0].description contains the full detected text block.
    const fullText = result.textAnnotations?.[0]?.description ?? '';
    if (fullText) {
      this.logger.debug(`OCR text (first 200 chars): ${fullText.slice(0, 200)}`);
      const detectedSize = extractSizeFromText(fullText);
      if (detectedSize) {
        suggestions.size = detectedSize;
        this.logger.debug(`Size detected from OCR: ${detectedSize}`);
      }
    }

    return suggestions;
  }
}
