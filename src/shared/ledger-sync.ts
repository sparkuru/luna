import {
  canonicalMinorUnits, decodeId, decodeMonth, decodeTransaction, decodeWorkspace,
  type Transaction, type Workspace,
} from './domain';

export const LEDGER_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const MAX_LEDGER_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_LEDGER_REVISIONS = 10_000;
export const MAX_LEDGER_PARENT_LINKS = 100_000;

export type LedgerSyncErrorCode =
  | 'ledger-invalid-document' | 'ledger-too-large' | 'ledger-workspace-mismatch'
  | 'ledger-revision-collision' | 'ledger-invalid-parent' | 'ledger-cycle'
  | 'ledger-conflict' | 'ledger-stale-heads' | 'ledger-stale-budget';

export class LedgerSyncError extends Error {
  constructor(readonly code: LedgerSyncErrorCode) {
    super(`LUNA_ERROR:${code}`);
    this.name = 'LedgerSyncError';
  }
}

export type LedgerRevisionValue =
  | { kind: 'transaction'; entityId: string; value: Transaction }
  | { kind: 'budget'; entityId: string; value: string | null };

export type LedgerRevision = LedgerRevisionValue & { id: string; parents: string[] };
export type LedgerRevisionInput = LedgerRevisionValue & { id: string };

export interface LedgerDocument {
  schemaVersion: typeof LEDGER_DOCUMENT_SCHEMA_VERSION;
  workspace: Workspace;
  revisions: LedgerRevision[];
}

export type LedgerConflict =
  | { kind: 'transaction'; entityId: string; heads: Extract<LedgerRevision, { kind: 'transaction' }>[] }
  | { kind: 'budget'; entityId: string; heads: Extract<LedgerRevision, { kind: 'budget' }>[] };

export interface LedgerProjection {
  workspace: Workspace;
  /** Includes effective tombstones; excludes every unresolved transaction. */
  transactions: Transaction[];
  /** A conflicted month is explicitly null, preventing inheritance of an older limit. */
  budgets: Record<string, string | null>;
  conflicts: LedgerConflict[];
}

/** Returns a detached, deterministically ordered document after full graph validation. */
export function decodeLedgerDocument(value: unknown): LedgerDocument {
  try {
    if (!isRecord(value)) fail('ledger-invalid-document');
    exactKeys(value, ['schemaVersion', 'workspace', 'revisions']);
    if (value.schemaVersion !== LEDGER_DOCUMENT_SCHEMA_VERSION || !Array.isArray(value.revisions)) {
      fail('ledger-invalid-document');
    }
    if (value.revisions.length > MAX_LEDGER_REVISIONS) fail('ledger-too-large');
    checkEncodedSize(value);
    const workspace = decodeWorkspace(value.workspace);
    const byId = new Map<string, LedgerRevision>();
    let links = 0;
    for (const raw of value.revisions) {
      const revision = decodeRevision(raw, workspace.precision);
      links += revision.parents.length;
      if (links > MAX_LEDGER_PARENT_LINKS) fail('ledger-too-large');
      const existing = byId.get(revision.id);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(revision)) {
        fail('ledger-revision-collision');
      }
      byId.set(revision.id, revision);
    }
    validateGraph(byId);
    return {
      schemaVersion: LEDGER_DOCUMENT_SCHEMA_VERSION,
      workspace,
      revisions: [...byId.values()].sort((left, right) => compare(left.id, right.id)),
    };
  } catch (error) {
    if (error instanceof LedgerSyncError) throw error;
    throw new LedgerSyncError('ledger-invalid-document');
  }
}

export function mergeLedgerDocuments(left: LedgerDocument, right: LedgerDocument): LedgerDocument {
  const first = decodeLedgerDocument(left);
  const second = decodeLedgerDocument(right);
  if (JSON.stringify(first.workspace) !== JSON.stringify(second.workspace)) fail('ledger-workspace-mismatch');
  const revisions = new Map(first.revisions.map((revision) => [revision.id, revision]));
  for (const revision of second.revisions) {
    const existing = revisions.get(revision.id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(revision)) {
      fail('ledger-revision-collision');
    }
    revisions.set(revision.id, revision);
  }
  return decodeLedgerDocument({ ...first, revisions: [...revisions.values()] });
}

export function seedLedgerDocument(
  workspace: Workspace,
  transactions: readonly Transaction[],
  budgets: Readonly<Record<string, string | null>>,
): LedgerDocument {
  return decodeLedgerDocument({
    schemaVersion: LEDGER_DOCUMENT_SCHEMA_VERSION,
    workspace,
    revisions: [
      ...transactions.map((value) => ({
        id: `seed:transaction:${value.id}`, kind: 'transaction', entityId: value.id, parents: [], value,
      })),
      ...Object.entries(budgets).map(([entityId, value]) => ({
        id: `seed:budget:${entityId}`, kind: 'budget', entityId, parents: [], value,
      })),
    ],
  });
}

export function projectLedgerDocument(document: LedgerDocument): LedgerProjection {
  const decoded = decodeLedgerDocument(document);
  const projection: LedgerProjection = { workspace: decoded.workspace, transactions: [], budgets: {}, conflicts: [] };
  for (const heads of entityHeads(decoded).values()) {
    const first = heads[0];
    if (first === undefined) continue;
    if (heads.length === 1) {
      if (first.kind === 'transaction') projection.transactions.push(first.value);
      else projection.budgets[first.entityId] = first.value;
    } else if (first.kind === 'transaction') {
      projection.conflicts.push({
        kind: first.kind, entityId: first.entityId,
        heads: heads.filter((head): head is Extract<LedgerRevision, { kind: 'transaction' }> => head.kind === 'transaction'),
      });
    } else {
      projection.budgets[first.entityId] = null;
      projection.conflicts.push({
        kind: first.kind, entityId: first.entityId,
        heads: heads.filter((head): head is Extract<LedgerRevision, { kind: 'budget' }> => head.kind === 'budget'),
      });
    }
  }
  return projection;
}

/** Edit a sole head; transaction values must advance its numeric revision by one. */
export function appendLedgerRevision(
  document: LedgerDocument,
  input: LedgerRevisionInput,
  expectedHeadIds?: readonly string[],
): LedgerDocument {
  return addRevision(document, input, expectedHeadIds, false);
}

/** Resolve all observed heads; transaction values need max(head revisions) + 1. */
export function resolveLedgerConflict(
  document: LedgerDocument,
  input: LedgerRevisionInput,
  expectedHeadIds: readonly string[],
): LedgerDocument {
  return addRevision(document, input, expectedHeadIds, true);
}

function addRevision(
  document: LedgerDocument,
  input: LedgerRevisionInput,
  expectedHeadIds: readonly string[] | undefined,
  resolving: boolean,
): LedgerDocument {
  const decoded = decodeLedgerDocument(document);
  // Decode the supplied value before using its kind or entity identity.
  const revision = decodeRevision({ ...input, parents: [] }, decoded.workspace.precision);
  const heads = entityHeads(decoded).get(entityKey(revision)) ?? [];
  const parentIds = heads.map((head) => head.id).sort(compare);
  if (expectedHeadIds !== undefined) {
    const expected = decodeLedgerHeadIds(expectedHeadIds);
    if (JSON.stringify(expected) !== JSON.stringify(parentIds)) fail('ledger-stale-heads');
  } else if (resolving) fail('ledger-stale-heads');
  if (resolving ? heads.length < 2 : heads.length > 1) fail('ledger-conflict');
  if (decoded.revisions.some((existing) => existing.id === revision.id)) fail('ledger-revision-collision');
  if (revision.kind === 'transaction' && heads.length > 0) {
    const priorRevision = Math.max(...heads.map((head) => head.kind === 'transaction' ? head.value.revision : 0));
    if (revision.value.revision !== priorRevision + 1) fail('ledger-invalid-document');
  }
  revision.parents = parentIds;
  return decodeLedgerDocument({ ...decoded, revisions: [...decoded.revisions, revision] });
}

function decodeRevision(value: unknown, precision: number): LedgerRevision {
  try {
    if (!isRecord(value)) fail('ledger-invalid-document');
    exactKeys(value, ['id', 'kind', 'entityId', 'parents', 'value']);
    const id = revisionId(value.id);
    const parents = decodeLedgerHeadIds(value.parents);
    if (value.kind === 'transaction') {
      const entityId = decodeId(value.entityId);
      const transaction = decodeTransaction(value.value, precision);
      if (transaction.id !== entityId || !Number.isSafeInteger(transaction.revision)) fail('ledger-invalid-document');
      return { id, kind: 'transaction', entityId, parents, value: transaction };
    }
    if (value.kind === 'budget') {
      const entityId = decodeMonth(value.entityId);
      if (value.value !== null && typeof value.value !== 'string') fail('ledger-invalid-document');
      const budget = value.value === null ? null : canonicalMinorUnits(value.value);
      if (budget?.startsWith('-')) fail('ledger-invalid-document');
      return { id, kind: 'budget', entityId, parents, value: budget };
    }
    return fail('ledger-invalid-document');
  } catch (error) {
    if (error instanceof LedgerSyncError) throw error;
    throw new LedgerSyncError('ledger-invalid-document');
  }
}

export function decodeLedgerHeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) fail('ledger-invalid-parent');
  if (value.length > MAX_LEDGER_REVISIONS) fail('ledger-too-large');
  const parents = value.map(revisionId).sort(compare);
  if (new Set(parents).size !== parents.length) fail('ledger-invalid-parent');
  return parents;
}

/** The visible limit may be inherited; its source heads are part of the edit precondition. */
export function budgetHeadIds(document: LedgerDocument, month: string): string[] {
  decodeMonth(month);
  const groups = entityHeads(decodeLedgerDocument(document));
  const budgetMonth = [...groups.values()].flatMap((heads) => {
    const head = heads[0];
    return head?.kind === 'budget' && head.entityId <= month ? [head.entityId] : [];
  }).sort(compare).at(-1);
  return budgetMonth === undefined ? [] : (groups.get(`budget:${budgetMonth}`) ?? []).map((head) => head.id);
}

export function assertBudgetHeads(document: LedgerDocument, month: string, expected: string[] | undefined): void {
  if (expected !== undefined && JSON.stringify(decodeLedgerHeadIds(expected)) !== JSON.stringify(budgetHeadIds(document, month))) {
    fail('ledger-stale-budget');
  }
}

function validateGraph(revisions: ReadonlyMap<string, LedgerRevision>): void {
  const remaining = new Map<string, number>();
  const children = new Map<string, string[]>();
  const ready: string[] = [];
  for (const revision of revisions.values()) {
    remaining.set(revision.id, revision.parents.length);
    if (revision.parents.length === 0) ready.push(revision.id);
    for (const parentId of revision.parents) {
      const parent = revisions.get(parentId);
      if (parent === undefined || entityKey(parent) !== entityKey(revision)) fail('ledger-invalid-parent');
      const list = children.get(parentId) ?? [];
      list.push(revision.id);
      children.set(parentId, list);
    }
  }
  // Iterative topological traversal avoids call-stack limits on long histories.
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    if (id === undefined) continue;
    for (const child of children.get(id) ?? []) {
      const count = (remaining.get(child) ?? 0) - 1;
      remaining.set(child, count);
      if (count === 0) ready.push(child);
    }
  }
  if (ready.length !== revisions.size) fail('ledger-cycle');
  for (const revision of revisions.values()) {
    if (revision.kind !== 'transaction') continue;
    for (const parentId of revision.parents) {
      const parent = revisions.get(parentId);
      if (parent?.kind === 'transaction' && revision.value.revision <= parent.value.revision) fail('ledger-invalid-document');
    }
  }
}

function entityHeads(document: LedgerDocument): Map<string, LedgerRevision[]> {
  const parents = new Set(document.revisions.flatMap((revision) => revision.parents));
  const groups = new Map<string, LedgerRevision[]>();
  const heads = document.revisions.filter((revision) => !parents.has(revision.id));
  heads.sort((left, right) => compare(entityKey(left), entityKey(right)) || compare(left.id, right.id));
  for (const revision of heads) {
    const key = entityKey(revision);
    const group = groups.get(key) ?? [];
    group.push(revision);
    groups.set(key, group);
  }
  return groups;
}

function entityKey(revision: LedgerRevision): string {
  return `${revision.kind}:${revision.entityId}`;
}

function revisionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) fail('ledger-invalid-document');
  return value;
}

function checkEncodedSize(value: unknown): void {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail('ledger-invalid-document');
  if (encoded.length > MAX_LEDGER_DOCUMENT_BYTES || new TextEncoder().encode(encoded).byteLength > MAX_LEDGER_DOCUMENT_BYTES) {
    fail('ledger-too-large');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail('ledger-invalid-document');
  }
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: LedgerSyncErrorCode): never {
  throw new LedgerSyncError(code);
}
