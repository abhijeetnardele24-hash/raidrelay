# Stage 1: Build Stage
FROM node:24-slim AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace package manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json .npmrc ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY packages/fixtures/package.json ./packages/fixtures/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install all dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY packages/ ./packages/
COPY apps/ ./apps/

# Compile contracts, domain, fixtures, web SPA, and server
RUN pnpm build

# Stage 2: Production Runtime Stage
FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@latest --activate

# Install wget for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*

# Copy package manifests and production dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/domain/package.json ./packages/domain/
COPY packages/fixtures/package.json ./packages/fixtures/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --prod --frozen-lockfile

# Copy built dist artifacts from builder stage
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/domain/dist ./packages/domain/dist
COPY --from=builder /app/packages/fixtures/dist ./packages/fixtures/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Create runtime data directory with proper permissions for non-root user
RUN mkdir -p /app/data && chown -R node:node /app

# Non-root user execution
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]

