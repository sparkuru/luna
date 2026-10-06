FROM node:22.22.0-bookworm AS dev

ARG TARGETARCH=amd64

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN case "${TARGETARCH}" in \
      amd64) ;; \
      *) echo "Google Chrome is only provisioned for amd64 development containers" >&2; exit 1 ;; \
    esac \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --location --retry 3 \
      --output /tmp/google-chrome.deb \
      https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y --no-install-recommends /tmp/google-chrome.deb \
    && rm -f /tmp/google-chrome.deb \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global --no-audit --no-fund playwright@1.63.0 \
    && mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}" \
    && playwright install --with-deps firefox \
    && chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}"

FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json vite.web.config.ts ./
COPY scripts/web-offline-plugin.ts ./scripts/web-offline-plugin.ts
COPY src/shared ./src/shared
COPY src/sync ./src/sync
COPY src/api-client ./src/api-client
COPY src/renderer ./src/renderer
COPY src/web ./src/web
RUN npm run web:build

FROM nginx:1.29.8-alpine3.23 AS runtime
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist-web /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
    wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
