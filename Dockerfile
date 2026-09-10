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
