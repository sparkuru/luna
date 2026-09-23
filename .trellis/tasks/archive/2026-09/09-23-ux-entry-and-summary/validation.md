# Task A validation — 2026-09-23

## Implementation

- Welcome exposes `#setup-restore` and `#setup-connect` above the existing create form. No-workspace backup/account routes render their actual features, plus `#setup-back` to `/`; the existing route blocker still protects backup input.
- Backup export form is omitted until a workspace exists. Import continues through the existing encrypted backup API.
- Mobile summary uses explicit heading/amount/44px toggle grid areas. Long amounts wrap inside their assigned column; desktop also bounds the amount column. Summary visibility state and financial projection are unchanged.
- No host/schema/protocol edits. Existing uncommitted settings and ledger work preserved.

## Evidence

- Before implementation: updated fresh backup test failed waiting for `#setup-restore` (expected red).
- `./hako npm run typecheck`: passed.
- Focused six-file suite (ledger-tools, server-account, ux-entry-summary, privacy-and-web, intuitive-ledger, workspace-setup-visual-polish): 52 passed, 2 failed. Both failures were the same 375px first-screen assertion: first implementation increased summary height. Corrected with the dedicated grid toggle column.
- Follow-up `ux-entry-summary` + `intuitive-ledger`, grep `summary controls|375px home`: 10 passed, zero skips. Four widths (320/375/768/1440), English/Chinese, CNY/JPY, hidden/revealed and large negative totals passed; two recent records remain above mobile navigation.
- Final `ledger-tools`, `server-account`, `ux-entry-summary`: 18 passed, zero skips. Fresh backup starts from welcome, checks bad password leaves workspace null, restores an image-bearing full backup, reloads, and decodes the image in browser. Fresh synthetic-server browser starts from welcome without precreation, checks offline login disabled and wrong ledger phrase leaves workspace null, then restores ledger and images durably. Welcome back/cancel paths leave workspace null.
- Existing privacy tests in the six-file run passed: independent visibility, unchanged summary height for normal amounts, details visible, refresh resets session flags. New geometry tests also inspect hidden summary HTML/live content for amount leakage.
- `git diff --check`: passed.

## Remaining integration gate

Coordinator will run shared unit tests, final Web build and complete production browser suite after B/C/D. This worker did not run those gates and does not claim native/real-device/assistive-technology validation. Current screenshots from failed iterations are diagnostic only; final visual capture/review belongs to the centralized UI gate.
