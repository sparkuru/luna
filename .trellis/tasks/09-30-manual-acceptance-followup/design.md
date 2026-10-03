# Technical Design

## Boundary

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

## Safety and privacy boundaries

- Never paste passwords, tokens, private ledger content, full backup bytes, or personal data into this task.
- Redact or hash filenames and payload identifiers in screenshots and logs; keep evidence inside the repository's task research area only when it is safe to retain.
- A successful browser fixture, an Android 11 compatibility adapter, or a local restore is evidence for that exact scope only. It cannot close a different row.
- Minimal product fixes discovered during this acceptance may stay in this task under the 2026-10-03 authorization. Preserve the failing reproduction and add focused regression and real-device evidence.

## Completion and rollback

The task can be archived only when A01–A07 each has real evidence and satisfies its technical criteria. Leave it active while any row has uncovered criteria or a failing result, recording the smallest follow-up. Incorrect result entries should be corrected without deleting prior evidence. The SAH fix can be reverted independently, but that restores the known Android profile-discovery defect and must not be presented as accepted behavior.
