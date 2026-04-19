import { PrismaClient, ItemCondition, OrderStatus, AuthenticityStatus, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

loadEnv({ path: path.join(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// Placeholder images from Unsplash (fashion/clothing themed, no auth needed)
const PLACEHOLDER_IMAGES = [
  'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800',
  'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800',
  'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800',
  'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=800',
  'https://images.unsplash.com/photo-1551232864-3f0890e580d9?w=800',
  'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=800',
  'https://images.unsplash.com/photo-1502716119720-b23a93e5fe1b?w=800',
];

async function main() {
  // Production safety gate — this seed creates demo users (including a
  // hard-coded admin with a known password) that MUST NOT exist in a
  // real deployment. Running with `NODE_ENV=production` is almost
  // always a mistake (someone pointed the seed at the prod DATABASE_URL),
  // so fail fast with a clear message instead of silently seeding.
  //
  // Production admin bootstrap uses apps/api/scripts/promote-admin.ts
  // against an existing user row — never this seed.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '❌ prisma/seed.ts refuses to run with NODE_ENV=production.\n' +
      '   To promote a production user to admin use:\n' +
      '     npm run admin:promote -- <email>\n' +
      '   (see apps/api/scripts/promote-admin.ts).',
    );
    process.exit(1);
  }

  console.log('🌱 Seeding database...');

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------
  const categories = [
    {
      namePt: 'Moda Feminina', slug: 'moda-feminina', icon: '👗',
      children: [
        { namePt: 'Vestidos', slug: 'vestidos', icon: null },
        { namePt: 'Blusas e Camisetas', slug: 'blusas-camisetas', icon: null },
        { namePt: 'Calças e Shorts', slug: 'calcas-shorts', icon: null },
        { namePt: 'Saias', slug: 'saias', icon: null },
        { namePt: 'Casacos e Jaquetas', slug: 'casacos-jaquetas-fem', icon: null },
        { namePt: 'Macacões', slug: 'macacoes', icon: null },
        { namePt: 'Lingerie e Pijamas', slug: 'lingerie-pijamas', icon: null },
        { namePt: 'Moda Praia', slug: 'moda-praia-fem', icon: null },
        { namePt: 'Moda Fitness', slug: 'moda-fitness-fem', icon: null },
      ],
    },
    {
      namePt: 'Moda Masculina', slug: 'moda-masculina', icon: '👔',
      children: [
        { namePt: 'Camisetas e Polos', slug: 'camisetas-polos', icon: null },
        { namePt: 'Camisas', slug: 'camisas', icon: null },
        { namePt: 'Calças', slug: 'calcas-masc', icon: null },
        { namePt: 'Bermudas e Shorts', slug: 'bermudas-shorts', icon: null },
        { namePt: 'Casacos e Jaquetas', slug: 'casacos-jaquetas-masc', icon: null },
        { namePt: 'Ternos e Blazers', slug: 'ternos-blazers', icon: null },
        { namePt: 'Moda Praia', slug: 'moda-praia-masc', icon: null },
      ],
    },
    {
      namePt: 'Calçados', slug: 'calcados', icon: '👟',
      children: [
        { namePt: 'Tênis', slug: 'tenis', icon: null },
        { namePt: 'Sandálias', slug: 'sandalias', icon: null },
        { namePt: 'Sapatos Sociais', slug: 'sapatos-sociais', icon: null },
        { namePt: 'Botas', slug: 'botas', icon: null },
        { namePt: 'Chinelos', slug: 'chinelos', icon: null },
      ],
    },
    {
      namePt: 'Bolsas e Mochilas', slug: 'bolsas-mochilas', icon: '👜',
      children: [
        { namePt: 'Bolsas', slug: 'bolsas', icon: null },
        { namePt: 'Mochilas', slug: 'mochilas', icon: null },
        { namePt: 'Carteiras', slug: 'carteiras', icon: null },
        { namePt: 'Necessaires', slug: 'necessaires', icon: null },
      ],
    },
    {
      namePt: 'Acessórios', slug: 'acessorios', icon: '💎',
      children: [
        { namePt: 'Óculos de Sol', slug: 'oculos-sol', icon: null },
        { namePt: 'Relógios', slug: 'relogios', icon: null },
        { namePt: 'Bijuterias e Joias', slug: 'bijuterias-joias', icon: null },
        { namePt: 'Cintos', slug: 'cintos', icon: null },
        { namePt: 'Chapéus e Bonés', slug: 'chapeus-bones', icon: null },
        { namePt: 'Lenços e Cachecóis', slug: 'lencos-cachecois', icon: null },
      ],
    },
    {
      namePt: 'Infantil', slug: 'infantil', icon: '👶',
      children: [
        { namePt: 'Roupas (0-2 anos)', slug: 'roupas-bebe', icon: null },
        { namePt: 'Roupas (3-12 anos)', slug: 'roupas-crianca', icon: null },
        { namePt: 'Calçados Infantis', slug: 'calcados-infantis', icon: null },
        { namePt: 'Brinquedos', slug: 'brinquedos', icon: null },
        { namePt: 'Acessórios Infantis', slug: 'acessorios-infantis', icon: null },
      ],
    },
    {
      namePt: 'Casa e Decoração', slug: 'casa-decoracao', icon: '🏠',
      children: [
        { namePt: 'Decoração', slug: 'decoracao', icon: null },
        { namePt: 'Cama, Mesa e Banho', slug: 'cama-mesa-banho', icon: null },
        { namePt: 'Cozinha', slug: 'cozinha', icon: null },
        { namePt: 'Móveis', slug: 'moveis', icon: null },
      ],
    },
    {
      namePt: 'Eletrônicos', slug: 'eletronicos', icon: '📱',
      children: [
        { namePt: 'Celulares', slug: 'celulares', icon: null },
        { namePt: 'Tablets', slug: 'tablets', icon: null },
        { namePt: 'Fones de Ouvido', slug: 'fones-ouvido', icon: null },
        { namePt: 'Acessórios de Tecnologia', slug: 'acessorios-tech', icon: null },
      ],
    },
    {
      namePt: 'Livros e Jogos', slug: 'livros-jogos', icon: '📚',
      children: [
        { namePt: 'Livros', slug: 'livros', icon: null },
        { namePt: 'Jogos de Tabuleiro', slug: 'jogos-tabuleiro', icon: null },
        { namePt: 'Videogames', slug: 'videogames', icon: null },
      ],
    },
    {
      namePt: 'Vintage e Retrô', slug: 'vintage-retro', icon: '✨',
      children: [
        { namePt: 'Roupas Vintage', slug: 'roupas-vintage', icon: null },
        { namePt: 'Acessórios Vintage', slug: 'acessorios-vintage', icon: null },
        { namePt: 'Decoração Vintage', slug: 'decoracao-vintage', icon: null },
      ],
    },
  ];

  const categoryMap: Record<string, string> = {};

  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { namePt: cat.namePt, slug: cat.slug, icon: cat.icon },
      update: { namePt: cat.namePt, icon: cat.icon },
    });
    categoryMap[cat.slug] = parent.id;

    if (cat.children) {
      for (const child of cat.children) {
        const c = await prisma.category.upsert({
          where: { slug: child.slug },
          create: { namePt: child.namePt, slug: child.slug, icon: child.icon, parentId: parent.id },
          update: { namePt: child.namePt, parentId: parent.id },
        });
        categoryMap[child.slug] = c.id;
      }
    }
  }

  console.log(`  ✅ ${categories.length} categories + subcategories`);

  // ---------------------------------------------------------------------------
  // Brands
  // ---------------------------------------------------------------------------
  const brandNames = [
    'Farm', 'Animale', 'Osklen', 'Colcci', 'Morena Rosa', 'John John',
    'Maria Filó', 'Le Lis Blanc', 'Bo.Bô', 'Shoulder', 'Dress To',
    'Lenny Niemeyer', 'Rosa Chá', 'Reserva', 'Richards', 'Foxton',
    'Hering', 'Renner', 'C&A', 'Riachuelo', 'Marisa', 'Havaianas',
    'Melissa', 'Arezzo', 'Schutz', 'Santa Lolla', 'Vizzano',
    'Dumond', 'Anacapri', 'Chilli Beans', 'Vivara',
    'Zara', 'H&M', 'Nike', 'Adidas', 'Puma', 'New Balance',
    "Levi's", 'Calvin Klein', 'Tommy Hilfiger', 'Ralph Lauren',
    'Lacoste', 'Gucci', 'Louis Vuitton', 'Chanel', 'Prada',
    'Michael Kors', 'Coach', 'Forever 21', 'Gap', 'Uniqlo',
    'Converse', 'Vans', 'Ray-Ban', 'Swarovski',
  ];

  for (const name of brandNames) {
    await prisma.brand.upsert({
      where: { slug: slug(name) },
      create: { name, slug: slug(name), verified: true },
      update: { name },
    });
  }

  console.log(`  ✅ ${brandNames.length} brands`);

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------
  const pw = await bcrypt.hash('Teste@123', 12);
  // Seeded accounts must have the current TOS accepted or the login endpoint
  // will bounce them with `TOS_UPDATE_REQUIRED` (409). Keep this in sync with
  // AuthService.getCurrentTosVersion()'s default.
  const seedTosVersion = process.env.TOS_VERSION ?? '1.0.0';
  const seedAcceptedTos = { acceptedTosAt: new Date(), acceptedTosVersion: seedTosVersion };

  // Primary test user (the one used to login during dev)
  const userTeste = await prisma.user.upsert({
    where: { email: 'teste@vintage.com.br' },
    create: {
      email: 'teste@vintage.com.br',
      passwordHash: pw,
      name: 'Maria Teste',
      cpf: '52998224725',
      cpfChecksumValid: true, cpfIdentityVerified: true,
      verified: true,
      bio: 'Usuária de teste principal. Compra e vende muito!',
      ...seedAcceptedTos,
      wallet: { create: { balanceBrl: 150 } },
    },
    update: { passwordHash: pw, cpfChecksumValid: true, cpfIdentityVerified: true, ...seedAcceptedTos },
  });

  // A power seller with many completed sales
  const userVendedora = await prisma.user.upsert({
    where: { email: 'ana.vendedora@vintage.com.br' },
    create: {
      email: 'ana.vendedora@vintage.com.br',
      passwordHash: pw,
      name: 'Ana Vendedora',
      cpf: '11144477735',
      cpfChecksumValid: true, cpfIdentityVerified: true,
      verified: true,
      bio: 'Apaixonada por moda sustentável. Mais de 50 vendas!',
      ...seedAcceptedTos,
      wallet: { create: { balanceBrl: 480 } },
    },
    update: { passwordHash: pw, ...seedAcceptedTos },
  });

  // A buyer (available for future order seeding)
  const _userComprador = await prisma.user.upsert({
    where: { email: 'joao.comprador@vintage.com.br' },
    create: {
      email: 'joao.comprador@vintage.com.br',
      passwordHash: pw,
      name: 'João Comprador',
      cpf: '98765432100',
      cpfChecksumValid: true, cpfIdentityVerified: true,
      verified: true,
      ...seedAcceptedTos,
      wallet: { create: { balanceBrl: 0 } },
    },
    update: { passwordHash: pw, ...seedAcceptedTos },
  });

  // Admin user
  const userAdmin = await prisma.user.upsert({
    where: { email: 'admin@vintage.com.br' },
    create: {
      email: 'admin@vintage.com.br',
      passwordHash: pw,
      name: 'Admin Vintage',
      cpf: '00000000191',
      cpfChecksumValid: true, cpfIdentityVerified: true,
      verified: true,
      role: UserRole.ADMIN,
      ...seedAcceptedTos,
      wallet: { create: { balanceBrl: 0 } },
    },
    update: { passwordHash: pw, role: UserRole.ADMIN, ...seedAcceptedTos },
  });

  console.log('  ✅ Users: teste@vintage.com.br | ana.vendedora@vintage.com.br | joao.comprador@vintage.com.br | admin@vintage.com.br (all pw: Teste@123)');

  // ---------------------------------------------------------------------------
  // Active listings by the power seller
  // ---------------------------------------------------------------------------
  const femCatId = categoryMap['vestidos'] ?? categoryMap['moda-feminina'];
  const blouseCatId = categoryMap['blusas-camisetas'] ?? categoryMap['moda-feminina'];
  const tenisCatId = categoryMap['tenis'] ?? categoryMap['calcados'];
  const bolsaCatId = categoryMap['bolsas'] ?? categoryMap['bolsas-mochilas'];
  const vintageCatId = categoryMap['roupas-vintage'] ?? categoryMap['vintage-retro'];

  const listingData = [
    {
      title: 'Vestido Farm Rio Floral Midi Rosa',
      description: 'Vestido midi Farm Rio estampa floral. Usado apenas 2 vezes. Sem defeitos. Perfeito para o verão carioca.',
      priceBrl: 189,
      condition: 'VERY_GOOD' as ItemCondition,
      size: 'M',
      color: 'Rosa',
      categoryId: femCatId,
      imageUrl: PLACEHOLDER_IMAGES[0],
      isAuthentic: true,
      viewCount: 142,
      favoritesCount: 23,
    },
    {
      title: 'Blusa Animale Seda Off-White',
      description: 'Blusa Animale em seda natural, cor off-white. Tamanho P. Usada poucas vezes, impecável.',
      priceBrl: 145,
      condition: 'VERY_GOOD' as ItemCondition,
      size: 'P',
      color: 'Off-White',
      categoryId: blouseCatId,
      imageUrl: PLACEHOLDER_IMAGES[1],
      isAuthentic: false,
      viewCount: 89,
      favoritesCount: 12,
    },
    {
      title: 'Tênis Nike Air Max 270 Branco 38',
      description: 'Nike Air Max 270 na cor branca, número 38. Usado algumas vezes, em excelente estado. Acompanha caixa original.',
      priceBrl: 320,
      condition: 'GOOD' as ItemCondition,
      size: '38',
      color: 'Branco',
      categoryId: tenisCatId,
      imageUrl: PLACEHOLDER_IMAGES[2],
      isAuthentic: true,
      viewCount: 210,
      favoritesCount: 45,
    },
    {
      title: 'Bolsa Couro Arezzo Caramelo',
      description: 'Bolsa Arezzo em couro genuíno, cor caramelo. Tamanho médio, alça dupla. Sem arranhados.',
      priceBrl: 260,
      condition: 'VERY_GOOD' as ItemCondition,
      size: 'Único',
      color: 'Caramelo',
      categoryId: bolsaCatId,
      imageUrl: PLACEHOLDER_IMAGES[3],
      isAuthentic: false,
      viewCount: 67,
      favoritesCount: 8,
    },
    {
      title: 'Jaqueta Jeans Vintage 90s Oversized',
      description: 'Jaqueta jeans oversized estilo anos 90. Tamanho G, pode servir como oversized em M. Peça única!',
      priceBrl: 95,
      condition: 'GOOD' as ItemCondition,
      size: 'G',
      color: 'Azul Claro',
      categoryId: vintageCatId,
      imageUrl: PLACEHOLDER_IMAGES[4],
      isAuthentic: false,
      viewCount: 178,
      favoritesCount: 34,
    },
    {
      title: 'Vestido Zara Linho Bege Midi',
      description: 'Vestido midi em linho Zara, cor bege. Tamanho M. Levíssimo, perfeito para o dia a dia.',
      priceBrl: 75,
      condition: 'GOOD' as ItemCondition,
      size: 'M',
      color: 'Bege',
      categoryId: femCatId,
      imageUrl: PLACEHOLDER_IMAGES[5],
      isAuthentic: false,
      viewCount: 55,
      favoritesCount: 7,
    },
    // Listings by the test user
    {
      title: 'Blusa Cropped Osklen Listrada',
      description: 'Blusa cropped Osklen listrada azul e branco. Tamanho P. Nova com etiqueta, nunca usada.',
      priceBrl: 120,
      condition: 'NEW_WITH_TAGS' as ItemCondition,
      size: 'P',
      color: 'Azul/Branco',
      categoryId: blouseCatId,
      imageUrl: PLACEHOLDER_IMAGES[6],
      isAuthentic: false,
      viewCount: 30,
      favoritesCount: 5,
      seller: 'teste',
    },
  ];

  const listingIds: Record<string, string> = {};

  for (const [i, ld] of listingData.entries()) {
    const sellerUser = ld.seller === 'teste' ? userTeste : userVendedora;
    const existing = await prisma.listing.findFirst({
      where: { title: ld.title, sellerId: sellerUser.id },
    });

    let listingId: string;
    if (existing) {
      listingId = existing.id;
    } else {
      const listing = await prisma.listing.create({
        data: {
          title: ld.title,
          description: ld.description,
          priceBrl: ld.priceBrl,
          condition: ld.condition,
          size: ld.size,
          color: ld.color,
          categoryId: ld.categoryId,
          sellerId: sellerUser.id,
          isAuthentic: ld.isAuthentic,
          shippingWeightG: 400,
          viewCount: ld.viewCount,
          createdAt: daysAgo(30 - i * 4),
          images: {
            create: [{ url: ld.imageUrl, position: 0, width: 800, height: 800 }],
          },
        },
      });
      listingId = listing.id;
    }
    listingIds[ld.title] = listingId;
  }

  console.log(`  ✅ ${listingData.length} active listings`);

  // ---------------------------------------------------------------------------
  // Authenticity requests (for the isAuthentic listings)
  // ---------------------------------------------------------------------------
  const authenticListingTitles = listingData.filter((l) => l.isAuthentic).map((l) => l.title);
  for (const title of authenticListingTitles) {
    const listingId = listingIds[title];
    if (!listingId) continue;
    const sellerUser = listingData.find((l) => l.title === title)?.seller === 'teste' ? userTeste : userVendedora;

    await prisma.authenticityRequest.upsert({
      where: { listingId },
      create: {
        listingId,
        sellerId: sellerUser.id,
        proofImageUrls: [PLACEHOLDER_IMAGES[8], PLACEHOLDER_IMAGES[9]],
        status: AuthenticityStatus.APPROVED,
        reviewNote: 'Nota fiscal verificada. Produto autêntico confirmado.',
        reviewedBy: userAdmin.id,
      },
      update: { status: AuthenticityStatus.APPROVED },
    });
  }

  console.log('  ✅ Authenticity requests (APPROVED)');

  // ---------------------------------------------------------------------------
  // Completed orders — needed for reviews and CO2/impact
  // ---------------------------------------------------------------------------
  // Sold listings (separate from the active ones above)
  const soldListingDefs = [
    {
      title: 'Vestido Colcci Preto Midi — VENDIDO',
      priceBrl: 210,
      condition: 'VERY_GOOD' as ItemCondition,
      imageUrl: PLACEHOLDER_IMAGES[7],
      categoryId: femCatId,
      daysAgoCreated: 60,
      daysAgoSold: 45,
    },
    {
      title: 'Calça John John Skinny — VENDIDA',
      priceBrl: 155,
      condition: 'GOOD' as ItemCondition,
      imageUrl: PLACEHOLDER_IMAGES[8],
      categoryId: categoryMap['calcas-shorts'] ?? femCatId,
      daysAgoCreated: 50,
      daysAgoSold: 35,
    },
    {
      title: 'Tênis Adidas Superstar Branco 39 — VENDIDO',
      priceBrl: 280,
      condition: 'VERY_GOOD' as ItemCondition,
      imageUrl: PLACEHOLDER_IMAGES[9],
      categoryId: tenisCatId,
      daysAgoCreated: 40,
      daysAgoSold: 25,
    },
    {
      title: 'Blusa Le Lis Blanc Cetim — VENDIDA',
      priceBrl: 180,
      condition: 'NEW_WITHOUT_TAGS' as ItemCondition,
      imageUrl: PLACEHOLDER_IMAGES[0],
      categoryId: blouseCatId,
      daysAgoCreated: 30,
      daysAgoSold: 15,
    },
    {
      title: 'Jaqueta Osklen Nylon — VENDIDA',
      priceBrl: 340,
      condition: 'VERY_GOOD' as ItemCondition,
      imageUrl: PLACEHOLDER_IMAGES[1],
      categoryId: categoryMap['casacos-jaquetas-fem'] ?? femCatId,
      daysAgoCreated: 25,
      daysAgoSold: 10,
    },
  ];

  const orders: { id: string; priceBrl: number }[] = [];

  for (const sld of soldListingDefs) {
    const existing = await prisma.listing.findFirst({
      where: { title: sld.title, sellerId: userVendedora.id },
    });

    let soldListingId: string;
    if (existing) {
      soldListingId = existing.id;
    } else {
      const sl = await prisma.listing.create({
        data: {
          title: sld.title,
          description: 'Item vendido. Seed de demonstração.',
          priceBrl: sld.priceBrl,
          condition: sld.condition,
          categoryId: sld.categoryId,
          sellerId: userVendedora.id,
          status: 'SOLD',
          shippingWeightG: 400,
          createdAt: daysAgo(sld.daysAgoCreated),
          images: {
            create: [{ url: sld.imageUrl, position: 0, width: 800, height: 800 }],
          },
        },
      });
      soldListingId = sl.id;
    }

    // Create order if not exists
    const existingOrder = await prisma.order.findFirst({ where: { listingId: soldListingId } });
    if (!existingOrder) {
      const protectionFee = Math.round((sld.priceBrl * 0.05 + 3.5) * 100) / 100;
      const shippingCost = 15;
      const order = await prisma.order.create({
        data: {
          listingId: soldListingId,
          buyerId: userTeste.id,
          sellerId: userVendedora.id,
          itemPriceBrl: sld.priceBrl,
          shippingCostBrl: shippingCost,
          buyerProtectionFeeBrl: protectionFee,
          totalBrl: sld.priceBrl + shippingCost + protectionFee,
          status: OrderStatus.COMPLETED,
          paymentMethod: 'PIX',
          createdAt: daysAgo(sld.daysAgoSold),
          updatedAt: daysAgo(sld.daysAgoSold - 3),
        },
      });
      orders.push({ id: order.id, priceBrl: sld.priceBrl });
    } else {
      orders.push({ id: existingOrder.id, priceBrl: sld.priceBrl });
    }
  }

  console.log(`  ✅ ${soldListingDefs.length} completed orders`);

  // ---------------------------------------------------------------------------
  // Reviews with seller replies
  // ---------------------------------------------------------------------------
  const reviewTexts = [
    {
      rating: 5,
      comment: 'Produto exatamente como descrito! Chegou super bem embalado e muito rápido. Vendedora incrível, super recomendo!',
      reply: 'Muito obrigada pela avaliação! Foi um prazer. Aproveite muito o vestido!',
    },
    {
      rating: 5,
      comment: 'Calça perfeita, estado impecável. Ana é uma vendedora confiável, comunicação excelente.',
      reply: 'Obrigada! Fico muito feliz que você gostou. Até a próxima compra!',
    },
    {
      rating: 5,
      comment: 'Tênis chegou muito rápido e em perfeito estado. Exatamente como nas fotos. Super recomendo!',
      reply: null,
    },
    {
      rating: 1,
      comment: 'Demorou mais do que esperado para enviar, mas o produto chegou bem.',
      reply: 'Olá! Peço desculpas pelo atraso no envio, tive uma emergência familiar. O produto estava em ótimo estado conforme anunciado. Obrigada pela compreensão!',
    },
    {
      rating: 5,
      comment: 'Jaqueta linda e autêntica! Já é minha peça favorita. Embalagem cuidadosa.',
      reply: null,
    },
  ];

  for (let i = 0; i < Math.min(orders.length, reviewTexts.length); i++) {
    const existing = await prisma.review.findFirst({ where: { orderId: orders[i].id } });
    if (!existing) {
      const rv = reviewTexts[i];
      await prisma.review.create({
        data: {
          orderId: orders[i].id,
          reviewerId: userTeste.id,
          reviewedId: userVendedora.id,
          rating: rv.rating,
          comment: rv.comment,
          sellerReply: rv.reply ?? undefined,
          sellerReplyAt: rv.reply ? daysAgo(Math.max(1, 10 - i * 2)) : undefined,
          createdAt: daysAgo(12 - i * 2),
        },
      });
    }
  }

  console.log('  ✅ Reviews with seller replies');

  // ---------------------------------------------------------------------------
  // Wallet transactions (so the seller dashboard has data)
  // ---------------------------------------------------------------------------
  const sellerWallet = await prisma.wallet.findUnique({ where: { userId: userVendedora.id } });
  if (sellerWallet) {
    const txCount = await prisma.walletTransaction.count({ where: { walletId: sellerWallet.id } });
    if (txCount === 0) {
      for (let i = 0; i < soldListingDefs.length; i++) {
        const sld = soldListingDefs[i];
        await prisma.walletTransaction.create({
          data: {
            walletId: sellerWallet.id,
            type: 'CREDIT',
            amountBrl: sld.priceBrl,
            description: `Venda: ${sld.title}`,
            createdAt: daysAgo(soldListingDefs[i].daysAgoSold - 3),
          },
        });
      }
      // Update wallet balance to reflect earnings
      const totalEarned = soldListingDefs.reduce((sum, s) => sum + s.priceBrl, 0);
      await prisma.wallet.update({
        where: { id: sellerWallet.id },
        data: { balanceBrl: totalEarned - 200 }, // 200 already paid out
      });
    }
  }

  console.log('  ✅ Wallet transactions');

  // ---------------------------------------------------------------------------
  // LoginEvents for teste user (for security dashboard)
  // ---------------------------------------------------------------------------
  const loginEventCount = await prisma.loginEvent.count({ where: { userId: userTeste.id } });
  if (loginEventCount === 0) {
    const loginHistory = [
      { daysAgo: 1, success: true, platform: 'android' },
      { daysAgo: 3, success: true, platform: 'android' },
      { daysAgo: 7, success: false, platform: 'web' },
      { daysAgo: 7, success: true, platform: 'web' },
      { daysAgo: 14, success: true, platform: 'ios' },
    ];
    for (const ev of loginHistory) {
      await prisma.loginEvent.create({
        data: {
          userId: userTeste.id,
          ipHash: 'a'.repeat(64),
          deviceIdHash: 'b'.repeat(64),
          platform: ev.platform,
          success: ev.success,
          createdAt: daysAgo(ev.daysAgo),
        },
      });
    }
  }

  console.log('  ✅ Login events (security dashboard)');

  // ---------------------------------------------------------------------------
  // Test coupon — 100% discount for end-to-end testing without real payments
  // ---------------------------------------------------------------------------
  await prisma.coupon.upsert({
    where: { code: 'TESTE100' },
    update: {},
    create: {
      code: 'TESTE100',
      discountPct: 100,
      maxUses: null,   // unlimited
      isActive: true,
      expiresAt: null, // never expires
    },
  });

  console.log('  ✅ Test coupon TESTE100 (100% off, unlimited uses)');

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n🌱 Seeding complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Test accounts (password: Teste@123)');
  console.log('  • teste@vintage.com.br      — buyer + seller');
  console.log('  • ana.vendedora@vintage.com.br — power seller (5 completed orders, reviews)');
  console.log('  • joao.comprador@vintage.com.br — buyer');
  console.log('  • admin@vintage.com.br      — admin');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Features to test:');
  console.log('  • Reviews with seller replies: login as teste@, view ana.vendedora profile');
  console.log('  • Authentic badge: Vestido Farm e Tênis Nike têm badge ✓');
  console.log('  • CO2 impact: 5 orders = 6.5 kg CO2 + 13,500 L water saved');
  console.log('  • Seller insights: GET /seller-insights (as ana.vendedora)');
  console.log('  • 2FA: POST /auth/2fa/setup (as any user)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
