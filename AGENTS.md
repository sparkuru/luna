<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

<!-- TRELLIS-PLUS:PROJECT-START -->
## Project-owned Trellis Plus policy

Before repository work, after a substantial interruption, before commit/archive,
and when choosing subsequent work, read `.trellis/spec/trellis-plus/index.md`
and `.trellis/mainline.md`. Read every applicable detail named by the index;
preview work also requires `development.md` and `preview-console.md` from that
policy directory. A listed path is not proof that its contents were loaded.

For a normal task, register applicable detail files explicitly in both implement
and check context; Markdown links alone are insufficient. For explicitly
authorized work without a task, read the same policy directly and do not create
a task just to carry context. Keep this project-authored section outside the
Trellis-managed block when reconciling updates.
<!-- TRELLIS-PLUS:PROJECT-END -->
