# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.title="WarpMetal MCP" \
      org.opencontainers.image.description="MCP server for WarpMetal Agent Skills and the WarpMetal CLI surface" \
      org.opencontainers.image.source="https://github.com/warpmetal/skills" \
      org.opencontainers.image.licenses="UNLICENSED"
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /build/dist ./dist
COPY snapshot ./snapshot
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["node", "dist/index.js"]
