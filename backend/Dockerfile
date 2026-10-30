# ─── Stage 1: Install production dependencies ─────────────────────────────────
FROM node:18-alpine AS deps

WORKDIR /app

# Copy package files first (layer cache optimization)
COPY package*.json ./

# Install ONLY production deps (no devDependencies)
RUN npm ci --omit=dev

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:18-alpine

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY server.js .
COPY package.json .

# Ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
