#!/usr/bin/env ts-node
/**
 * Full rebuild of the Meilisearch "listings" index from the database.
 *
 * Usage:
 *   npm run search:reindex
 *
 * Use cases:
 *   - Initial launch — seed the index from an existing DB
 *   - Drift recovery — the async best-effort sync in ListingsService
 *     may skip writes if Meilisearch is momentarily unreachable
 *   - Schema changes — when the indexed document shape evolves
 *
 * This script only indexes ACTIVE listings. Any doc that was in the
 * index for a non-ACTIVE id stays until Meilisearch's next sweep (or
 * until the listing transitions back to ACTIVE and is re-added).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { MeiliSearch } from 'meilisearch';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

loadEnv({ path: path.join(__dirname, '../.env') });

const BATCH_SIZE = 500;

async function main() {
  const host = process.env.MEILISEARCH_HOST;
  if (!host) {
    console.error('MEILISEARCH_HOST is not set — refusing to reindex.');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — refusing to reindex.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const client = new MeiliSearch({
    host,
    apiKey: process.env.MEILISEARCH_API_KEY ?? '',
  });
  const index = client.index('listings');

  try {
    console.log(`Reindexing listings → Meilisearch at ${host}`);

    const total = await prisma.listing.count({ where: { status: 'ACTIVE' } });
    console.log(`Found ${total} ACTIVE listings.`);

    let cursor: string | undefined;
    let processed = 0;

    while (true) {
      const batch = await prisma.listing.findMany({
        where: { status: 'ACTIVE' },
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { namePt: true, slug: true } },
          brand: { select: { name: true } },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (batch.length === 0) break;

      const docs = batch.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        sellerId: l.sellerId,
        categoryId: l.categoryId,
        brandId: l.brandId ?? null,
        category: l.category?.namePt ?? null,
        brand: l.brand?.name ?? null,
        condition: l.condition,
        size: l.size ?? null,
        color: l.color ?? null,
        priceBrl: Number(l.priceBrl),
        status: l.status,
        viewCount: l.viewCount,
        imageUrl: l.images[0]?.url ?? null,
        createdAt: l.createdAt.getTime(),
      }));

      await index.addDocuments(docs);
      processed += batch.length;
      cursor = batch[batch.length - 1].id;
      console.log(`  ...indexed ${processed}/${total}`);
    }

    console.log(`Done. ${processed} docs submitted to Meilisearch (async).`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
