# Root PRD rewrite contract

## Authority

- The approved decision baseline is
  `.trellis/tasks/08-30-prd-decision-review/prd.md`.
- The rewrite target is the repository-root `prd.md`.
- The user's final approval was given after the baseline's convergence pass.

## Rewrite requirements

- Rewrite the root PRD in Chinese.
- Preserve the source document's useful product context while making the
  approved decision baseline authoritative.
- Remove superseded account-balance, postings, transfer, refund transaction,
  dedicated relay, server database, application-managed member-role, and
  multi-currency plans.
- Do not reintroduce unapproved product scope or choose deferred technical
  details.
- Keep exact cryptographic algorithms, object layout, causal protocol, provider
  matrix, key rotation, and OPFS findings marked as technical design/research
  work rather than settled implementation.
- Do not modify product code or any file outside the root `prd.md`.

## Validation

- Confirm all eight original section 14 decisions are closed or superseded.
- Search for stale selected-plan language involving balances, postings,
  transfers, refunds, a dedicated Relay, PostgreSQL/MySQL, or member roles.
- Verify Goal, In Scope, Out of Scope, acceptance criteria, risks, and deferred
  research remain explicit.
