# Luna Ledger UI design system baseline

Generated from the project-local `ui-ux-pro-max` design-system search for the
approved ledger/sync work. This is a task-level baseline, not a replacement for
the repository's existing visual language.

## Product direction

- Product: trustworthy personal-finance ledger with offline-first behavior.
- Priority: make local-vs-remote state understandable without blocking local
  entry, and make sync/conflict recovery actionable.
- Responsive targets: 375px, 768px, 1024px and 1440px.

## Visual baseline

- Style: calm, high-contrast dark finance interface with restrained emphasis.
- Trust blue: `#1E40AF`; secondary blue: `#3B82F6`.
- Success/accent green: `#059669`; destructive red: `#DC2626`.
- Background: `#0F172A`; foreground: `#FFFFFF`; border:
  `rgba(255,255,255,0.08)`.
- Semantic CSS variables are preferred over component-level raw colors.
- The existing app theme must be checked before applying the generated palette;
  preserve existing light/dark support if already present.

## Typography and interaction

- Suggested readable finance pairing: Lexend for headings and Source Sans 3 for
  body text; use the repository's bundled/system fonts if external font loading
  is not part of the current product.
- Visible focus states, keyboard operation and semantic labels are required.
- Interactive targets are at least 44px/44dp, with at least 8px spacing where
  practical.
- Async sync actions show a pending state, disable duplicate activation and
  return clear success/error feedback.
- State meaning must not rely on color alone: pair status colors with text and
  an icon or label. Respect reduced-motion preferences.

## Required sync UI states

- `local-only`: saved on this device; not uploaded.
- `pending`: upload or retry is queued.
- `syncing`: an active pull/merge/commit is in progress.
- `synced`: local state is known to match the server revision.
- `needs-attention`: a financial conflict requires a user decision.
- `failed`: the operation failed but local data remains available, with retry.
- `offline`: local use remains enabled; explain that other devices cannot see
  new entries until a sync succeeds.

## Review constraints

- Keep one primary action per stateful surface: usually “同步” or “解决冲突”.
- Put the reason and recovery action next to an error; do not expose S3
  credentials, server SQLite paths or internal service names.
- Validate narrow layouts and keyboard/screen-reader order before packaging.

## Source output

The task was generated with:

```text
personal finance ledger offline sync trustworthy calm --design-system -f markdown -p "Luna Ledger"
```

The generated recommendation was Dark Mode (OLED), trust blue plus profit
green, Lexend/Source Sans 3, visible focus, 150–300ms transitions and responsive
checks at 375/768/1024/1440px. Existing project tokens and accessibility rules
remain authoritative when they conflict with this recommendation.
