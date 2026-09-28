# Current-source SQLite restore validation — 2026-09-12

Passed the isolated SQLite/MinIO recovery smoke after strengthening its assertions.
This is local API/storage evidence, separate from public HTTPS, browser UI,
physical Android and an off-host backup restore.

## Source and runtime

- Base HEAD: `2b9534f54783a644632f8f9f5c072c24e57f5140`, with the task's existing
  working-tree changes. This was a current-working-tree build, not a clean commit.
- Build: `docker build -f Dockerfile.server -t luna-api:restore-validation-20260912 .`.
  Docker 26.1.5+dfsg1 accepted the current context; build steps reused matching cache.
- API image ID: `sha256:ee9eb60c1243da398f3a9334353dbb00016de5970f4767eb8b2adf59e6984dfb`.
- MinIO image ID: `sha256:69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9`;
  pinned release/digest comes from the smoke script.
- API and fixture execution used Node **22.22.0** in the API image. The host smoke
  orchestrator used Node **20.19.2**, importing Node builtins only; it did not load
  host SQLite/native modules. This does not assert Node 20 product support.
- Build-input file manifest: `/tmp/luna-server-restore-lFyxYq/source-manifest.sha256`;
  SHA256 `10026023fcb498767d636f63d265285538f850a005c089f19e8636a62805f0a2`.
  Covers Dockerfile, package/lock/config files, runtime package generator and all
  files below `src/server` and `src/shared`.
- Smoke SHA256: `e957d2b382c2c523c5d0b78ad1285f5bff1f13084773211f2da6102fb022b8ac`.
- Fixture SHA256: `f1fac5cf15bd452251b9d10a2f4d8155ce6878bddcc4a0452d34e75483404e19`.

## Executed checks

`LUNA_RESTORE_API_IMAGE=luna-api:restore-validation-20260912 node scripts/smoke-server-restore.mjs`
returned `LUNA_SERVER_RESTORE_OK /tmp/luna-server-restore-lFyxYq`.

1. Fresh SQLite/MinIO initialization, account login, ledger creation and encrypted
   conditional object creation return the expected status and an ETag.
2. Both source services stop before copying the complete `data/` tree, including
   SQLite, runtime identity/secrets and MinIO, into an independent directory/network.
3. Restored services retain instance identity, the existing session, exact ciphertext,
   original ETag and successful original-idempotency-key replay.
4. A second independently authenticated API client receives 412 on stale CAS.
   The fixture decrypts both branches, merges them with production graph code and
   checks the full decoded revision union: original, client A and client B records
   plus the budget remain. Both sessions then read identical committed ciphertext
   and ETag after the conditional merged write.
5. After stopping/starting the restored API, instance identity and both sessions
   survive. Both reads retain exact merged ciphertext and ETag, and decrypt to the
   same complete revision graph. This replaces the former status-only restart check.

Additional gates passed: `node --check scripts/smoke-server-restore.mjs`,
`git diff --check`, `HAKO_SCOPE=restore-validation ./hako npm run test:contracts`
**5/5**, and `HAKO_SCOPE=restore-validation ./hako npm run test:server-sync`
**7/7**. The latter two ran in the project's Node 22 Docker wrapper without
installing dependencies or rebuilding host native modules.

## Cleanup and limits

The smoke removed only its run-owned containers/networks after checking exact
`luna.restore-run` labels. Follow-up filtered container/network listings were empty.
The two temporary data trees were removed through an isolated, network-disabled
cleanup container because MinIO created container-owned files. Only the sanitized
report and source manifest remain under the temporary evidence directory; no
account tokens, runtime credentials or ciphertext are copied into this report.
The uniquely tagged API image remains available for review/reuse.

This proves restoration from a stopped local copy and API-level two-client graph
convergence. It does not replace actual browser/device login, client UI sync,
trusted public HTTPS, target-host deployment or restoration from off-host media.
