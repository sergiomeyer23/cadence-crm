# syntax=docker/dockerfile:1
# Uma imagem com a API e o worker. O estágio final é a API; o worker usa o
# alvo "worker" (docker build --target worker) ou o mesmo comando do Render:
# node worker/dist/index.js

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Baixar os pacotes só com o lockfile deixa essa camada em cache entre builds.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @cadence/api --filter @cadence/worker build
# Cada app sai com o próprio dist e só as dependências de produção. O modo
# legacy basta porque os pacotes do monorepo já estão dentro do bundle.
RUN pnpm --filter @cadence/api deploy --prod --legacy /out/api \
 && pnpm --filter @cadence/worker deploy --prod --legacy /out/worker

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./api
COPY --from=build --chown=node:node /out/worker ./worker
USER node

FROM runtime AS worker
CMD ["node", "worker/dist/index.js"]

FROM runtime AS api
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-${API_PORT:-3333}}/api/health" > /dev/null || exit 1
# As migrations rodam a cada início; o drizzle pula as que já foram aplicadas.
CMD ["sh", "-c", "node api/dist/migrate.js && exec node api/dist/index.js"]
