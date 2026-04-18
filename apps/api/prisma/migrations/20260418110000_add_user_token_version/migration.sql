-- AlterTable: add tokenVersion for global session invalidation.
-- Incremented on events that must kick every existing session (email
-- change, password change, admin force-logout). JWT payload carries
-- the ver at sign time; JwtStrategy rejects tokens whose ver ≠ current.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
