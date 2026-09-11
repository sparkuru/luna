# Logging Guidelines

> Minimal diagnostics for an offline financial desktop app.

## Overview

The app uses concise `console` diagnostics only in the packaged smoke helper.
Logging is not a business-data or config-sync transport. The application does
not ship a structured logging dependency or a remote log sink.

## Log Levels

- `console.log`: lifecycle or validation markers that are intentionally safe,
  such as the packaged smoke success marker.
- `console.error`: an actionable startup, packaging, or smoke failure with a
  sanitized error message.
- Avoid debug logging by default; add it only with an explicit redaction
  contract and a removal/retention plan.

## Structured Logging

When a future logger is introduced, fields must be named and allow-listed. Use
operation names, error categories, schema versions, and platform metadata; do
not attach raw request objects or database rows.

## What to Log

- Safe lifecycle failures: migration failure category, unavailable native
  binding, or packaged smoke stage.
- Testable markers such as `LUNA_PACKAGED_STORAGE_SMOKE_OK` and its failure
  counterpart.
- Aggregate counts only when needed for diagnostics, never transaction text.

## What NOT to Log

- Passwords/passphrases, root keys, plaintext/decrypted config payloads,
  object-store credentials, endpoint configuration, ETags, IPC payloads,
  merchant/category/notes text, and complete financial records.
- SQLite file paths or SQL statements in renderer-facing errors.
- The full `Error` object if it may contain path, query, or user data; use a
  safe category/message projection.

## Common Mistake

The packaged smoke intentionally checks behavior through a marker rather than
printing the created record. Keep this pattern when extending smoke coverage:
assert privately, report only the stage and result.
