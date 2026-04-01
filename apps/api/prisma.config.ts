import path from 'path';
import { defineConfig } from 'prisma/config';
import { config as loadEnv } from 'dotenv';

// Load .env so DATABASE_URL is available when Prisma CLI evaluates this file
loadEnv({ path: path.join(__dirname, '.env') });

/**
 * Prisma v7 configuration.
 *
 * The database URL is no longer read from schema.prisma in Prisma v7.
 * This file supplies the driver adapter for CLI commands (migrate, studio)
 * via DATABASE_URL. At runtime, PrismaService creates its own PrismaPg
 * adapter using ConfigService.
 */
export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  datasource: {
    url: process.env.DATABASE_URL,
  },

  migrate: {
    seed: 'ts-node prisma/seed.ts',

    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error(
          'DATABASE_URL environment variable is required for Prisma CLI commands',
        );
      }

      return new PrismaPg(databaseUrl);
    },
  },
});
