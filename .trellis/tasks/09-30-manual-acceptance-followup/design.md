# Technical Design

## Boundary

This task is a documentation-first acceptance ledger. It is the single source of truth for manual gaps left by the tasks archived under `archive/2026-09/`. It does not change product code or reinterpret automated evidence as proof for an untested platform, host, deployment, or accessibility path.

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
4. Ask the user to answer with `Axx：通过/不满意；备注：...` and record the satisfaction together with the result.
5. Update `implement.md` and the table only after the run. Run task validation and the quality gate after all rows have a result.

## Safety and privacy boundaries

- Never paste passwords, tokens, private ledger content, full backup bytes, or personal data into this task.
- Redact or hash filenames and payload identifiers in screenshots and logs; keep evidence inside the repository's task research area only when it is safe to retain.
- A successful browser fixture, an Android 11 compatibility adapter, or a local restore is evidence for that exact scope only. It cannot close a different row.
- Product fixes discovered during acceptance become separate tasks; this task records the finding and the next action.

## Completion and rollback

The task can be archived only when A01–A07 each has real evidence, a pass conclusion, and explicit user satisfaction. If any row is `不满意` or `阻塞`, leave this task active and record the smallest reproducible follow-up. Rollback of the task itself is a docs-only revert of the result entry; do not delete evidence or alter archived task history.
