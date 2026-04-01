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
  dress: 'vestidos',
  skirt: 'saias',
  blouse: 'blusas-e-camisetas',
  top: 'blusas-e-camisetas',
  't-shirt': 'blusas-e-camisetas',
  shirt: 'blusas-e-camisetas',
  jeans: 'calcas-e-shorts',
  pants: 'calcas-e-shorts',
  trousers: 'calcas-e-shorts',
  shorts: 'calcas-e-shorts',
  jacket: 'casacos-e-jaquetas',
  coat: 'casacos-e-jaquetas',
  blazer: 'casacos-e-jaquetas',
  jumpsuit: 'macacoes',
  swimwear: 'moda-praia',
  bikini: 'moda-praia',
  sportswear: 'moda-fitness',
  'athletic wear': 'moda-fitness',
  leggings: 'moda-fitness',
  sneaker: 'tenis',
  sneakers: 'tenis',
  sandal: 'sandalias',
  sandals: 'sandalias',
  boot: 'botas',
  boots: 'botas',
  shoe: 'sapatos-sociais',
  shoes: 'sapatos-sociais',
  bag: 'bolsas',
  handbag: 'bolsas',
  purse: 'bolsas',
  backpack: 'mochilas',
  wallet: 'carteiras',
  sunglasses: 'oculos-de-sol',
  watch: 'relogios',
  belt: 'cintos',
  hat: 'chapeus-e-bones',
  cap: 'chapeus-e-bones',
  scarf: 'lencos-e-cachecois',
};

/** Maps English color words (lowercased) to their Portuguese equivalents. */
const COLOR_MAP: Record<string, string> = {
  black: 'Preto',
  white: 'Branco',
  red: 'Vermelho',
  blue: 'Azul',
  green: 'Verde',
  yellow: 'Amarelo',
  pink: 'Rosa',
  purple: 'Roxo',
  orange: 'Laranja',
  brown: 'Marrom',
  gray: 'Cinza',
  grey: 'Cinza',
  beige: 'Bege',
  navy: 'Azul Marinho',
  cream: 'Creme',
  gold: 'Dourado',
  silver: 'Prata',
};

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

interface VisionResponse {
  labelAnnotations?: VisionLabel[];
  logoAnnotations?: VisionLogo[];
  webDetection?: VisionWebDetection;
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

      const response = await fetch(
        `${VISION_API_URL}?key=${this.apiKey}`,
        {
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
                ],
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Vision API respondeu com status ${response.status}`,
        );
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

    // --- Category and Color from label detection ---
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

      if (!suggestions.color) {
        const color = COLOR_MAP[desc];
        if (color) {
          suggestions.color = color;
        }
      }

      if (suggestions.categoryId && suggestions.color) {
        break;
      }
    }

    // --- Brand from logo detection ---
    const logos = result.logoAnnotations ?? [];
    if (logos.length > 0) {
      const logoName = logos[0].description;
      const brand = await this.prisma.brand.findFirst({
        where: { name: { equals: logoName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (brand) {
        suggestions.brandId = brand.id;
      }
    }

    // --- Title from web detection best guess ---
    const bestGuessLabels =
      result.webDetection?.bestGuessLabels ?? [];
    if (bestGuessLabels.length > 0) {
      suggestions.title = bestGuessLabels[0].label;
    }

    return suggestions;
  }
}
