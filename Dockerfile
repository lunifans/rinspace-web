# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22.22.2-alpine3.22@sha256:b77017c37f430e4466ff497058948a2f16e8b59779600d53711eeb7b999b0f4e
ARG RINSPACE_BUILD_COMMIT=0000000000000000000000000000000000000000
ARG RINSPACE_BUILD_TIME=1970-01-01T00:00:00.000Z

FROM ${NODE_IMAGE} AS build
ARG RINSPACE_BUILD_COMMIT
ARG RINSPACE_BUILD_TIME
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . ./
ENV RINSPACE_BUILD_COMMIT=${RINSPACE_BUILD_COMMIT}
ENV RINSPACE_BUILD_TIME=${RINSPACE_BUILD_TIME}
RUN pnpm build
RUN pnpm exec esbuild scripts/container-runtime.mjs \
  --bundle \
  --format=esm \
  --outfile=/workspace/container-runtime.mjs \
  --platform=node \
  --target=node22

FROM ${NODE_IMAGE} AS runtime
ARG RINSPACE_BUILD_COMMIT
ARG RINSPACE_BUILD_TIME
LABEL org.opencontainers.image.source="https://github.com/rinspacehq/rinspace-web"
LABEL org.opencontainers.image.revision="${RINSPACE_BUILD_COMMIT}"
LABEL org.opencontainers.image.created="${RINSPACE_BUILD_TIME}"
ENV NODE_ENV=production
ENV NODE_OPTIONS=--disable-proto=throw
ENV PORT=8080
WORKDIR /opt/rinspace
COPY --from=build --chown=1000:1000 /workspace/build ./core
COPY --from=build --chown=1000:1000 /workspace/container-runtime.mjs ./container-runtime.mjs
COPY --chown=1000:1000 config/runtime.demo.json ./runtime.demo.json
RUN mkdir -p /run/rinspace && chown 1000:1000 /run/rinspace
USER 1000:1000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["node", "/opt/rinspace/container-runtime.mjs"]
