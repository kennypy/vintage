#!/usr/bin/env ts-node
/**
 * Promote an existing user to ADMIN.
 *
 * Usage:
 *   npm run admin:promote -- <email>
 *
 * This is the ONLY supported path to create a production admin. The
 * `prisma/seed.ts` script refuses to run with NODE_ENV=production, so
 * there's no way to accidentally deploy a known-password admin account.
 *
 * The target user MUST already exist — they have to register through
 * the normal flow first (email + password + CPF, or OAuth). This script
 * only flips the `role` column. That way:
 *   - the admin's password/2FA are set by them, not by ops
 *   - the admin's CPF verification happens through the regular queue
 *   - the audit trail of their User row reflects a real signup
 *
 * The promotion is logged at INFO to whatever stdout the operator is
 * attached to; we also bump `tokenVersion` so any existing sessions
 * for that user get re-issued with ADMIN-tier claims on next refresh.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';

loadEnv({ path: path.join(__dirname, '../.env') });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run admin:promote -- <email>');
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — refusing to proceed.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, deletedAt: true },
    });

    if (!user) {
      console.error(
        `No user with email ${email}. The admin must sign up through the ` +
        `normal flow first (email+password or OAuth), THEN run this script.`,
      );
      process.exit(1);
    }

    if (user.deletedAt) {
      console.error(`User ${email} is soft-deleted — refusing to promote.`);
      process.exit(1);
    }

    if (user.role === 'ADMIN') {
      console.log(`User ${email} (${user.id}) is already ADMIN. No change.`);
      process.exit(0);
    }

    // Bump tokenVersion so any sessions issued to this user before the
    // promotion can't silently operate as an ADMIN — they'll get a
    // fresh JWT with the new role on the next refresh/login.
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', tokenVersion: { increment: 1 } },
    });

    console.log(
      `✅ Promoted ${email} (${user.id}, name=${user.name}) to ADMIN. ` +
      `Existing sessions invalidated.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
