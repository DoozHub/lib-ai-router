FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV AI_ROUTER_PORT=5181

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5181/health || exit 1

EXPOSE 5181

CMD ["bun", "run", "src/server.ts"]
