import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface ListingSuggestions {
  title?: string;
  categoryId?: string;
  color?: string;
  brandId?: string;
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

interface VisionResponse {
  labelAnnotations?: VisionLabel[];
  logoAnnotations?: VisionLogo[];
  webDetection?: VisionWebDetection;
  imagePropertiesAnnotation?: VisionImageProperties;
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
   * Analyse an image buffer and return listing field suggestions.
   * Always returns a (possibly empty) suggestions object — never throws.
   */
  async analyze(imageBuffer: Buffer): Promise<ListingSuggestions> {
    if (!this.apiKey) {
      return {};
    }

    try {
      const base64Image = imageBuffer.toString('base64');

      const response = await fetch(`${VISION_API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 15 },
                { type: 'LOGO_DETECTION', maxResults: 5 },
                { type: 'WEB_DETECTION', maxResults: 5 },
                { type: 'IMAGE_PROPERTIES' },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        this.logger.warn(`Vision API respondeu com status ${response.status}`);
        return {};
      }

      const data = (await response.json()) as {
        responses?: VisionResponse[];
      };
      const result = data?.responses?.[0];
      if (!result) {
        return {};
      }

      return this.mapToSuggestions(result);
    } catch (error) {
      this.logger.warn(
        `Análise de imagem falhou: ${String(error).slice(0, 200)}`,
      );
      return {};
    }
  }

  private async mapToSuggestions(
    result: VisionResponse,
  ): Promise<ListingSuggestions> {
    const suggestions: ListingSuggestions = {};

    // --- Category from label detection ---
    const labels = result.labelAnnotations ?? [];
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

    return suggestions;
  }
}
