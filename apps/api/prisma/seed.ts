import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- Categories ---
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

  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { namePt: cat.namePt, slug: cat.slug, icon: cat.icon },
      update: { namePt: cat.namePt, icon: cat.icon },
    });

    if (cat.children) {
      for (const child of cat.children) {
        await prisma.category.upsert({
          where: { slug: child.slug },
          create: {
            namePt: child.namePt, slug: child.slug, icon: child.icon,
            parentId: parent.id,
          },
          update: { namePt: child.namePt, parentId: parent.id },
        });
      }
    }
  }

  console.log(`  ✅ ${categories.length} categories + subcategories`);

  // --- Brazilian + International Fashion Brands ---
  const brands = [
    // Brazilian
    'Farm', 'Animale', 'Osklen', 'Colcci', 'Morena Rosa', 'John John',
    'Maria Filó', 'Le Lis Blanc', 'Bo.Bô', 'Shoulder', 'Dress To',
    'Lenny Niemeyer', 'Rosa Chá', 'Reserva', 'Richards', 'Foxton',
    'Hering', 'Renner', 'C&A', 'Riachuelo', 'Marisa', 'Havaianas',
    'Melissa', 'Arezzo', 'Schutz', 'Santa Lolla', 'Vizzano',
    'Dumond', 'Anacapri', 'Chilli Beans', 'Vivara',
    // International
    'Zara', 'H&M', 'Nike', 'Adidas', 'Puma', 'New Balance',
    'Levi\'s', 'Calvin Klein', 'Tommy Hilfiger', 'Ralph Lauren',
    'Lacoste', 'Gucci', 'Louis Vuitton', 'Chanel', 'Prada',
    'Michael Kors', 'Coach', 'Forever 21', 'Gap', 'Uniqlo',
    'Converse', 'Vans', 'Ray-Ban', 'Swarovski',
  ];

  for (const name of brands) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await prisma.brand.upsert({
      where: { slug },
      create: { name, slug, verified: true },
      update: { name },
    });
  }

  console.log(`  ✅ ${brands.length} brands`);
  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
