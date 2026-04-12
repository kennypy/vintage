# ---- Base ----
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts
# Generate Prisma client after install
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/
RUN cd packages/shared && npx tsc
RUN cd apps/api && npx prisma generate

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/dist ./packages/shared/dist
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY . .
RUN cd apps/api && npx nest build

# ---- Production ----
FROM node:22-alpine AS production
RUN apk add --no-cache libc6-compat

# Run as non-root
RUN addgroup --system --gid 1001 vintage && \
    adduser --system --uid 1001 vintage
WORKDIR /app

# Copy only what's needed to run
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/api/package.json ./apps/api/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

USER vintage

CMD ["node", "apps/api/dist/main.js"]
