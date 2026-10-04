# Technical Design

## Boundary

The 2026-10-05 user instruction resumes A07 on `https://luna.majo.im` and adds
the authorized VPS `wkyuu@ssh.majo.im` to configuration A. This supersedes the
10/04 deferral below. Inspect the existing proxy/certificate/data ownership
before persistent changes; deployment scratch belongs in `/tmp`, durable state
in `/opt`. Preserve unrelated services and real data. Reuse the existing
Compose control plane, retain loopback/private API/MinIO boundaries, record
rollback before routing, and validate new browser/physical Android connections
without test CAs, certificate bypasses or system trust modifications. A07
requires synthetic transaction and attachment transfer plus service/client
restart continuity, sanitized log review and renewal/operator handoff. The
prior A01–A06 results remain accepted; no voice/reader scope is resumed.

### A07 deployment shape (10/05 preflight)

The VPS still runs the older isolated Sep28 project under
`/opt/luna-acceptance-20260928-codex` on loopback port18110. Preserve that
installation and its data. Prepare a separate `luna-production` project under
`/opt/luna`, with versioned current-working-tree source in `releases/`, durable
`data/`, protected `backups/` and operator configuration in `ops/`. The proposed
Web upstream is free loopback port18111. API/MinIO stay private.

Use a dedicated `luna.majo.im` Nginx virtual host, validate it and the existing
global configuration before reload, and retain a route rollback. Preflight
found the VPS wildcard certificate expired on October3 and no renewal timer;
certificate availability and durable renewal must be verified before public
acceptance. Prefer a Luna-specific certificate/renewal boundary to unrelated
sites. These are preflight findings and the planned boundary; actual deployment,
dedicated issuance, enabled timer with successful not-due execution, client
acceptance, backup/restarts and cleanup are recorded in the dated
[VPS](research/a07-vps-20261005.md) and
[client](research/a07-clients-20261005.md) evidence. Future certificate renewal
and months of continuous operation are not inferred from this run.

The 2026-10-04 user decision defers A07 because no durable HTTPS deployment inputs exist. Archive acceptance now requires A01–A06; retain A07 as an unaccepted follow-up in mainline without automatically creating or starting another task. The historical all-seven gate below is superseded only for this explicit deferral. A04's original hardware-keyboard-or-system-IME input alternative remains valid; virtual key injection is not hardware evidence.

The user also explicitly canceled TalkBack acceptance while retaining keyboard,
system IME and BACK. Keep historical TalkBack gaps as untested and preserve
existing semantic accessibility; no voice feature or audio judgment is added.

The 2026-10-03 user instruction delegates observable acceptance to the agent using configuration A. It supersedes the historical per-row satisfaction-response gate below. Keep subjective satisfaction unclaimed and retain unsupported environments as uncovered; authorization alone is never passing evidence. The task remains active while technical criteria are unresolved.

This task is an acceptance ledger and owns minimal fixes directly discovered by the authorized configuration A checks. It is the single source of truth for gaps left by the tasks archived under `archive/2026-09/`. It never reinterprets automated evidence as proof for an untested platform, host, deployment, or accessibility path.

## Record model

The table in `prd.md` is the authoritative record. Each row has a stable ID (`A01`–`A07`) and these fields:

- source task and scope boundary;
- issue and prerequisites;
- reproducible steps using synthetic accounts, ledgers, files, and endpoints;
- observable pass criteria;
- existing automated or fixture evidence, with its limits;
- dated manual result, evidence link, and user satisfaction;
- conclusion: `待人工`, `通过`, `不满意`, or `阻塞`.

A manual result is appended to the same row or immediately below it. Failed or blocked evidence stays in the file so a later reviewer can reproduce the exact condition.

## Acceptance data flow

1. Read the archived source task before running a row so the environment and known evidence are not duplicated or broadened.
2. Prepare disposable synthetic data and isolate the target device, browser profile, deployment, or service.
3. Run the row's steps in order, recording date, environment, result, and a sanitized evidence path.
4. Record the agent-observed result under the delegated acceptance authorization. Ask for human input only for a concrete residual judgment or unavailable prerequisite; never invent satisfaction.
5. Update `implement.md` and the table only after the run. Run task validation and the quality gate after all rows have a result.

## A06 stopped-backup repair (2026-10-04)

The documented manual copy has no executable running-service refusal. Add a
standalone `node deploy/backup.mjs DATA NEW_BACKUP_DIRECTORY` entrypoint using
the existing Docker CLI and GNU copy tool. Resolve the complete data boundary,
reject incomplete state, unsafe secrets/ownership, symbolic/special files,
overlapping paths and an existing destination before accepting a backup. Check
running bind mounts before and after copying; publish a completed copy from an
owned staging directory and preserve the source and unknown destination files.

This is an operator-maintained stopped window, not a lock against concurrent
Docker restarts or non-container writers. The caller must stop every writer and
prevent restart throughout the command. Runtime refusal and cleanup must be
tested with synthetic fixtures and actual configuration A Compose resources.
Compose proxy failures must be reproduced unchanged before any minimal fix;
temporary test-only environment overrides do not establish deployment success.

## Safety and privacy boundaries

- Never paste passwords, tokens, private ledger content, full backup bytes, or personal data into this task.
- Redact or hash filenames and payload identifiers in screenshots and logs; keep evidence inside the repository's task research area only when it is safe to retain.
- A successful browser fixture, an Android 11 compatibility adapter, or a local restore is evidence for that exact scope only. It cannot close a different row.
- Minimal product fixes discovered during this acceptance may stay in this task under the 2026-10-03 authorization. Preserve the failing reproduction and add focused regression and real-device evidence.

## Completion and rollback

Under the current 10/05 scope, the task can be archived only when A01–A07 each
has actual evidence and satisfies its approved technical criteria, including
the resumed durable deployment/client acceptance and independent check. The
10/04 A01–A06 plus deferred-A07 gate is historical. Leave the task active while
an in-scope row has uncovered criteria or a failing result, recording the
smallest follow-up. Correct wrong result entries without deleting prior
evidence. The SAH fix can be reverted independently, but that restores the
known Android profile-discovery defect and is not accepted behavior.
