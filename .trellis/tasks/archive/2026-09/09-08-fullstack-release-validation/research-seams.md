# Deployment seams inspected before D

- Existing Dockerfile copies shared/sync/renderer/web and offline plugin only. C adds API-client/profile modules: image build must copy every actual imported source and relevant Vite configs. Use final import/build evidence rather than assuming old copy list suffices.
- .dockerignore is an explicit allowlist, so adding COPY alone is insufficient. Dockerfile.android has the same Web COPY seam plus its own ignore file; include generated SDK JS/declarations as well as TypeScript. Keep server/PG source out of the Web runtime (multi-stage assets only) and Electron/dev packages out of API runtime dependencies.
- Existing compose.yaml exposes 0.0.0.0 by default and has only Web. Approved D adds private PostgreSQL and API, migration startup ordering, file secrets, loopback default, explicit production origin. API uses LUNA_DATABASE_URL_FILE/LUNA_DATABASE_URL, LUNA_ALLOWED_ORIGINS, LUNA_HOST and LUNA_PORT (see backend/http-api-guidelines.md).
- Existing Nginx returns 404 for all unknown routes. TanStack browser history needs /ledger routes mapped to index.html, API prefix proxied without shell fallback. Preserve CSP/no-cache and static assets behavior; do not accidentally return HTML for missing JS/API.
- Existing service worker maps only / and /index.html navigation to shell. Offline direct /ledger/menu/* must map recognized application routes to shell; never intercept/cache /api or arbitrary remote requests. Its generated asset list already includes bundle chunks; preserve complete immutable-release precache and deferred update behavior.
- scripts/smoke-electron.ts accepts LUNA_LEDGER_EXECUTABLE and launches packaged --smoke with isolated data; scripts/smoke-android.ts uses Playwright Android device and LUNA_APK_PATH (default artifacts/android/luna-debug.apk). Preserve existing app identity and native backup tests.
- Task-owned PG is temporary PostgreSQL17.11, no host ports, name luna-fullstack-pg-0908. Real restore evidence requires a separate isolated database/container, not merely reusing source tables. Root owns cleanup after all C/D testing.

This file records observed seams, not completed deployment or device checks.
