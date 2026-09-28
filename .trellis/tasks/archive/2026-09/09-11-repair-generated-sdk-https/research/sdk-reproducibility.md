# SDK clean candidate reproducibility — 2026-09-12

## Result and source boundary

All requested source gates pass from an isolated candidate archive after a fresh
`npm ci`, **without running `api:generate` first**. This proves the candidate
source contents, not yet a committed clean checkout: the main session must add
the 16 generated core files and commit the reviewed changes before AC1 can
claim that they are under version control.

Base HEAD: `2b9534f54783a644632f8f9f5c072c24e57f5140`.
The archive contains 416 paths: tracked files read from the working copy
(including existing `.gitignore`, generator, and deployment-document changes),
plus the 16 intended untracked `src/api-client/generated/core/*` files.
The active task directory was excluded. No `.git`, `node_modules`, `.devhome`,
build outputs, runtime data, or credentials were copied. The actual untracked
input list was checked and contained only those 16 core files.

Temporary evidence directory: `/tmp/luna-sdk-repro.199n2d`.
Candidate source: `/tmp/luna-sdk-repro.199n2d/source`.

| Input | SHA-256 |
| --- | --- |
| `source.tar` | `c726f2b2b21bf437d3bce0835b7904b95906781174ec8a8a49548c10e34153c6` |
| `inputs.sha256` (416 path/content hashes) | `572a29213039c53e603d13d822a3af1b1342be974e1fde3f3df858e4efe072fc` |
| `package-lock.json` | `a1680a3ea9ac6fcaaa63599c3e4d5a4c771b762def142d87fe9d60a5052d1df3` |
| `contracts/openapi.json` | `8d3734fe340441e63e1cce82c747f1147545a418b8a4a8948a3d0877373b768e` |

Archive inputs were selected with:

```sh
git ls-files -z --cached --others --exclude-standard -- . ':!.trellis/tasks/09-11-repair-generated-sdk-https' > /tmp/luna-sdk-repro.199n2d/inputs.nul
tar --null -T /tmp/luna-sdk-repro.199n2d/inputs.nul -cf /tmp/luna-sdk-repro.199n2d/source.tar
tar -xf /tmp/luna-sdk-repro.199n2d/source.tar -C /tmp/luna-sdk-repro.199n2d/source
```

## Commands and observed results

All commands below ran in that extracted source using its existing `hako`.
The container used `node:22-bookworm`, actual Node `v22.23.2`, Linux x64,
npm `10.9.8`, UID/GID 1000:1000. Each container was disposable (`--rm`),
published no ports, and mounted only the temporary source. Its dependencies
and npm cache were independent of the primary worktree.

| Command | Result | Log under evidence directory |
| --- | --- | --- |
| `./hako npm ci` | Exit 0; 765 packages installed | `npm-ci.log` |
| `./hako npm run api:check` | Exit 0; `LUNA_API_REPRODUCIBLE` | `api-check.log` |
| `./hako npm run typecheck` | Exit 0 | `typecheck.log` |
| `./hako npm run server:typecheck` | Exit 0 | `server-typecheck.log` |
| `./hako npm test` | Exit 0; 157 passed, 0 failed | `test.log` |
| `./hako npm run server:test` | Exit 0; 21 passed, 0 failed | `server-test.log` |
| `./hako npm run web:build` | Exit 0; production assets built | `web-build.log` |

`api:check` generates comparison files only in its scratch directory; it did
not repair the candidate SDK. After all gates, `sha256sum -c inputs.sha256`
verified all 416 source paths unchanged (`source-unchanged.log`). The main
worktree's `git diff --check` also passed.

## Review and remaining boundaries

- Existing `.gitignore` exceptions retain generic `core`/`core.*` dump rules
  while admitting only this generated runtime directory.
- Existing generator normalization is deterministic and runs identically in
  generation/check modes. The complete generated output matches the locked
  generator and current contract; no generated file was hand-edited.
- No additional source changes were needed in this pass; only this evidence
  file was added. Staging and commit remain owned by the main session.
- `npm ci` reported 4 high-severity dependency advisories. This run establishes
  installation/build reproducibility; it does not establish dependency security
  review or change the lockfile to address those advisories.
- These gates do not establish physical Android, public HTTPS, cross-device
  synchronization, or production backup/restore acceptance. Those require
  their separate runtime evidence.
- Temporary archives/logs are local evidence and may expire; the committed
  source and commands are the durable reproduction boundary.
