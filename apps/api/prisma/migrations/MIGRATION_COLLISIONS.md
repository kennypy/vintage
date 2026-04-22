# Intentional Migration Timestamp Collisions

Two migrations share the timestamp `20260416120000`:

- `20260416120000_add_account_deletion/`
- `20260416120000_phase1_security_hardening/`

This is preserved on purpose. Both migrations are already recorded in the
`_prisma_migrations` table on every deployed environment (staging, prod),
and Prisma keys that table by the full folder name. Renaming either folder
after deploy makes Prisma see "a new migration" with no matching row and
attempt to re-apply SQL that has already run — which fails hard on the
first `ADD COLUMN` that already exists, leaving the schema in a partially
migrated state that has to be patched manually.

Prisma processes colliding timestamps alphabetically, so the effective
execution order is:

1. `20260416120000_add_account_deletion` (`a` < `p`)
2. `20260416120000_phase1_security_hardening`

which matches the original intent — account-deletion columns land before
the security-hardening migration that references `User` in its indexes.

## Rule for new migrations

Do not introduce new migrations that share a timestamp with an existing
one. Every new migration should use `prisma migrate dev --name X` (or an
explicit folder name) with a strictly greater timestamp than the latest
migration in the folder. If you do end up with a collision locally before
pushing, rename your **own** new migration (which has not been applied
anywhere yet) rather than the existing one.
