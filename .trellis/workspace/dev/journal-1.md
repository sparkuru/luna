# Journal - dev (Part 1)

> AI development session journal
> Started: 2026-08-30

---



## Session 1: Finalize product decision baseline

**Date**: 2026-08-30
**Task**: Finalize product decision baseline
**Branch**: `main`

### Summary

Resolved the remaining product decisions, rewrote the root PRD for an offline-first encrypted income and expense recorder, and archived the completed Trellis tasks.

### Main Changes

- Initialized the repository workflow and project guidance.
- Finalized the root PRD and its decision record.

### Git Commits

| Hash | Message |
|------|---------|
| `ca43756` | (see git log) |
| `0014e8d` | (see git log) |

### Testing

- [OK] Validated Markdown structure, decision consistency, and a clean Git worktree before session recording.

### Status

[OK] **Completed**


## Session 2: 完成 Web 远端部署与验收

**Date**: 2026-09-10
**Task**: 完成 Web 远端部署与验收
**Branch**: `main`

### Summary

完成 Web-first Luna 的隔离远端部署与真实浏览器验收：目标机使用 Compose 1.29.2 在 /tmp/luna-remote-deploy.jzhnoM 运行唯一项目，回环端口 127.0.0.1:18080；通过 API/Web 健康、深链接、账号/session、加密对象、本地离线账本、窄屏与 SSH tunnel smoke，并验证 API/MinIO 重启后 instanceId、控制面和对象仍可读。修复 Compose v1 name 兼容、classic builder allowlist、远端 staging 路径、代理环境 healthcheck 与 MinIO 沙箱；更新部署 spec，归档任务。Android、公网 HTTPS/TLS 保持后续范围。

### Git Commits

| Hash | Message |
|------|---------|
| `cf80205` | (see git log) |

### Status

[OK] **Completed**
