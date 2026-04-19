import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const databaseUrl = config.get<string>('DATABASE_URL', '');
    const nodeEnv = config.get<string>('NODE_ENV', 'development');

    // Enforce TLS in production. The production Supabase pooler URL already
    // sets sslmode=require, but we hard-fail if a deployment somehow lands
    // with an unencrypted connection string (e.g. an engineer pasted a dev
    // URL into a prod secret). A plaintext Postgres connection leaks every
    // query — including password hashes on login — to anyone in path.
    if (nodeEnv === 'production') {
      const hasSsl = /[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(databaseUrl);
      if (!hasSsl) {
        throw new Error(
          'DATABASE_URL must enable SSL in production (append ?sslmode=require).',
        );
      }
    }

    // Connection pool bounds. Without max, pg opens one connection per
    // concurrent query — a traffic spike exhausts the Postgres connection
    // limit (Supabase free tier = 60) and the whole API goes down.
    // statement_timeout prevents a runaway query from holding a connection
    // past the point where a 30s request would have timed out anyway.
    const poolMax = Number(config.get<string>('DATABASE_POOL_MAX', '10'));
    const poolIdleTimeoutMs = Number(
      config.get<string>('DATABASE_POOL_IDLE_TIMEOUT_MS', '30000'),
    );
    const statementTimeoutMs = Number(
      config.get<string>('DATABASE_STATEMENT_TIMEOUT_MS', '30000'),
    );

    const pool = new Pool({
      connectionString: databaseUrl,
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeoutMs,
    });

    // Per-query ceiling applied on every new Postgres connection. Guards
    // against a slow query tying up a pool slot past the API's own request
    // timeout (and, at scale, starving the pool). Runs once per connection
    // — the SET is session-scoped so it stays in effect for every query
    // Prisma issues on that client.
    pool.on('connect', (client) => {
      client
        .query(`SET statement_timeout = ${statementTimeoutMs}`)
        .catch(() => {
          // Never fail a connection handshake on this — worst case is no
          // timeout, which matches the prior behaviour.
        });
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
