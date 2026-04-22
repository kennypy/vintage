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

  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },

  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');

      // If Postgres sits behind a transaction-mode pooler (pgbouncer,
      // Supabase's 6543 port, RDS Proxy in transaction mode), running
      // `prisma migrate deploy` against the pool hangs on advisory
      // locks because migrations need a direct connection. DIRECT_URL
      // is the standard Prisma escape hatch for that — if it's set,
      // prefer it for the CLI adapter; otherwise fall back to
      // DATABASE_URL, which is correct for direct-connection setups.
      // Ops never has to know which topology they're on: set both if
      // pooled, set only DATABASE_URL if direct, migrations work in
      // either case.
      const directUrl = process.env.DIRECT_URL;
      const databaseUrl = process.env.DATABASE_URL;
      const migrateUrl = directUrl || databaseUrl;

      if (!migrateUrl) {
        throw new Error(
          'DATABASE_URL (or DIRECT_URL if Postgres is behind a pooler) environment variable is required for Prisma CLI commands',
        );
      }

      return new PrismaPg(migrateUrl);
    },
  },
});
