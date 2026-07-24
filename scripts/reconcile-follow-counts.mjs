#!/usr/bin/env node
// Recompute User.followerCount / User.followingCount from the Follow edges.
//
//   node scripts/reconcile-follow-counts.mjs            # dry run (default)
//   node scripts/reconcile-follow-counts.mjs --apply     # write corrections
//   node scripts/reconcile-follow-counts.mjs --limit 50  # cap rows reported
//
// WHY THIS EXISTS
//
// Before FIX-21 (F24), followUser() ran an idempotent `follow.upsert` and
// then incremented BOTH counters unconditionally, outside the new-edge
// guard and outside any transaction. Any caller could loop
// POST /users/:id/follow from a throwaway account and inflate a target's
// public followerCount without ever creating an edge. unfollowUser only
// decremented once per real edge, so the drift never self-corrected —
// free social proof for a fraudulent seller.
//
// FIX-21 stops new inflation (the insert and both increments now commit as
// one transaction, keyed on a real P2002-checked insert). It cannot repair
// counts that are already wrong. This script does that, once.
//
// SAFETY
//   * Dry run by default. --apply is required to write anything.
//   * Only rows whose stored count disagrees with the edge count are
//     touched, and each is written with an exact-value `set` (never an
//     increment), so re-running is idempotent.
//   * Reads and writes in batches so one pass does not hold the whole
//     user table in memory.
//   * Never deletes anything.

import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const REPORT_LIMIT =
  limitIdx !== -1 && args[limitIdx + 1] ? Number(args[limitIdx + 1]) : 25;

/** Users scanned per page. Keeps memory flat on large tables. */
const PAGE_SIZE = 1000;

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

const prisma = new PrismaClient();

async function main() {
  if (!Number.isFinite(REPORT_LIMIT) || REPORT_LIMIT < 0) {
    console.error(`${C.red}--limit must be a non-negative number${C.reset}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `${C.bold}Follow-count reconciliation${C.reset} ` +
      (APPLY
        ? `${C.yellow}[APPLY — will write]${C.reset}`
        : `${C.dim}[dry run — no writes; pass --apply to fix]${C.reset}`),
  );

  // Truth: count the edges themselves, grouped in the database.
  const [followerGroups, followingGroups] = await Promise.all([
    prisma.follow.groupBy({ by: ['followingId'], _count: { _all: true } }),
    prisma.follow.groupBy({ by: ['followerId'], _count: { _all: true } }),
  ]);

  const trueFollowers = new Map(
    followerGroups.map((g) => [g.followingId, g._count._all]),
  );
  const trueFollowing = new Map(
    followingGroups.map((g) => [g.followerId, g._count._all]),
  );

  let scanned = 0;
  let drifted = 0;
  let repaired = 0;
  let followerDelta = 0;
  let followingDelta = 0;
  const samples = [];

  let cursor = null;
  for (;;) {
    const page = await prisma.user.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, followerCount: true, followingCount: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const user of page) {
      scanned += 1;
      const actualFollowers = trueFollowers.get(user.id) ?? 0;
      const actualFollowing = trueFollowing.get(user.id) ?? 0;

      const followersOff = user.followerCount !== actualFollowers;
      const followingOff = user.followingCount !== actualFollowing;
      if (!followersOff && !followingOff) continue;

      drifted += 1;
      followerDelta += user.followerCount - actualFollowers;
      followingDelta += user.followingCount - actualFollowing;

      if (samples.length < REPORT_LIMIT) {
        samples.push(
          `  ${user.id}  followers ${user.followerCount} -> ${actualFollowers}` +
            `   following ${user.followingCount} -> ${actualFollowing}`,
        );
      }

      if (APPLY) {
        // Exact `set`, never an increment: re-running converges.
        await prisma.user.update({
          where: { id: user.id },
          data: {
            followerCount: actualFollowers,
            followingCount: actualFollowing,
          },
        });
        repaired += 1;
      }
    }
  }

  console.log('');
  if (samples.length > 0) {
    console.log(`${C.bold}Drifted users${C.reset}`);
    samples.forEach((s) => console.log(s));
    if (drifted > samples.length) {
      console.log(`  ${C.dim}… and ${drifted - samples.length} more${C.reset}`);
    }
    console.log('');
  }

  console.log(`${C.bold}Summary${C.reset}`);
  console.log(`  users scanned      ${scanned}`);
  console.log(`  users drifted      ${drifted}`);
  console.log(
    `  followerCount net  ${followerDelta > 0 ? '+' : ''}${followerDelta} ` +
      `${C.dim}(positive = inflated)${C.reset}`,
  );
  console.log(
    `  followingCount net ${followingDelta > 0 ? '+' : ''}${followingDelta}`,
  );

  if (APPLY) {
    console.log(`  ${C.green}users repaired     ${repaired}${C.reset}`);
  } else if (drifted > 0) {
    console.log('');
    console.log(
      `${C.yellow}Dry run — nothing written. Re-run with --apply to correct these.${C.reset}`,
    );
  } else {
    console.log(`  ${C.green}no drift found${C.reset}`);
  }
}

main()
  .catch((err) => {
    console.error(`${C.red}Reconciliation failed:${C.reset}`, err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
