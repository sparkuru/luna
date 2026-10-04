# Task archive attribution and explicit staging

- ownership: project-shared
- source: project-authored

For each successfully archived task completed with Codex participation, put
exactly one trailer on its archive commit, regardless of task size:

`Co-authored-by: OpenAI Codex <codex@openai.com>`

Place it after a blank line following a proportional completion body covering
the outcome, validation/limitations, task identity and available work commits.
Ordinary implementation, fix, checkpoint and separate journal commits do not
receive this task-level trailer. Preserve the user's Git identity and explicit
attribution decisions. This supersedes the old substantial-work-commit rule;
historical commits remain unchanged.

## Verified Trellis 0.6.14 route

The installed task archive parser supports `--no-commit`, with no custom message
interface. Its normal auto-commit stages the task's archive and relationship
changes and can include pre-staged work. Prefer the explicit supported route:

1. Read policy, mainline, task criteria, actual checks and review/authorization.
   Inspect worktree and index; resolve overlapping staged work without resetting
   the user's index. Prepare the exact candidate list and completion message.
2. Run `python3 .trellis/scripts/task.py archive TASK-DIR --no-commit` only for
   the authorized complete task. Confirm destination, completed state, source
   absence and cleared pointer; inspect any changed child relationship files.
3. Stage only that task's destination files, tracked source deletions, actual
   relationship changes and approved mainline evidence. Use explicit paths;
   `git add -u -- <old-task-dir>` collects only bounded tracked deletions. Never
   stage protected Trellis material, local platform files, secrets or unrelated
   changes; never use broad/forced staging. Check all candidate/staged paths and
   `git diff --check`.
4. Write the message to an owner-only /tmp file; use `git commit -F <file>`
   within authorization. Verify `git show --format=full --name-status HEAD`
   and `git log -1 --format=%B`: correct task, successful archive and exactly
   one trailer. Update mainline with archive path/commit; a later mainline-only
   commit receives no additional task attribution.

If moving succeeded but committing failed, inspect state/history and finish
only the missing commit. Do not archive twice, amend historical commits, create
empty attribution commits, install global hooks or patch protected runtime.
If a future runtime has neither message injection nor --no-commit, report
archive-attribution-blocked before archive and name the missing capability.

## Journals

The installed add_session.py supports --no-commit. Prefer
`python3 .trellis/scripts/add_session.py --title <title> --summary <summary> --no-commit`
when an authorized journal is needed, then inspect and commit only its actual
workspace files. Separate journals carry no task attribution. This policy
installation creates no task, journal, commit or archive by itself.
