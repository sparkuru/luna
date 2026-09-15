import {
  canonicalMinorUnits, decodeId, decodeMonth, decodeTransaction, decodeWorkspace,
  type Transaction, type Workspace,
} from './domain';
import {
  decodeStoredTransaction,
  isStoredTransaction,
  storedTransactionFromTransaction,
  storedTransactionToTransaction,
  type StoredTransaction,
} from './ledger-record';
import type { StoredAttachmentDescriptor } from './attachment-contract';
import {
  decodeCategoryCatalog,
  validateCategoryCatalog,
  type CategoryCatalog,
  type CategoryDefinition,
} from './category-catalog';

export const LEDGER_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LEDGER_DOCUMENT_V2_SCHEMA_VERSION = 2 as const;
export const LEDGER_DOCUMENT_V3_SCHEMA_VERSION = 3 as const;
export type LedgerDocumentSchemaVersion = 1 | 2 | 3;
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
  | { kind: 'transaction'; entityId: string; value: Transaction | StoredTransaction }
  | { kind: 'budget'; entityId: string; value: string | null }
  | { kind: 'category-catalog'; entityId: string; value: CategoryCatalog };

export type LedgerRevision = LedgerRevisionValue & { id: string; parents: string[] };
export type LedgerRevisionInput = LedgerRevisionValue & { id: string };

export interface LedgerDocumentV1 {
  schemaVersion: typeof LEDGER_DOCUMENT_SCHEMA_VERSION;
  workspace: Workspace;
  revisions: LedgerRevision[];
}
export interface LedgerDocumentV2 {
  schemaVersion: typeof LEDGER_DOCUMENT_V2_SCHEMA_VERSION;
  workspace: Workspace;
  revisions: LedgerRevision[];
}
export interface LedgerDocumentV3 {
  schemaVersion: typeof LEDGER_DOCUMENT_V3_SCHEMA_VERSION;
  workspace: Workspace;
  revisions: LedgerRevision[];
}
export type LedgerDocument = LedgerDocumentV1 | LedgerDocumentV2 | LedgerDocumentV3;

export type LedgerConflict =
  | { kind: 'transaction'; entityId: string; heads: Extract<LedgerRevision, { kind: 'transaction' }>[] }
  | { kind: 'budget'; entityId: string; heads: Extract<LedgerRevision, { kind: 'budget' }>[] }
  | { kind: 'category-catalog'; entityId: string; heads: Extract<LedgerRevision, { kind: 'category-catalog' }>[] };

export interface LedgerProjection {
  workspace: Workspace;
  /** Includes effective tombstones; excludes every unresolved transaction. */
  transactions: Transaction[];
  /** A conflicted month is explicitly null, preventing inheritance of an older limit. */
  budgets: Record<string, string | null>;
  /** The effective directory; empty while the catalog entity is conflicted or legacy. */
  categories: CategoryDefinition[];
  /** Heads observed for the effective directory, or every conflicting head. */
  categoryHeadIds: string[];
  conflicts: LedgerConflict[];
}

/** Returns a detached, deterministically ordered document after full graph validation. */
export function decodeLedgerDocument(value: unknown): LedgerDocument {
  try {
    if (!isRecord(value)) fail('ledger-invalid-document');
    exactKeys(value, ['schemaVersion', 'workspace', 'revisions']);
    if (
      (value.schemaVersion !== LEDGER_DOCUMENT_SCHEMA_VERSION &&
        value.schemaVersion !== LEDGER_DOCUMENT_V2_SCHEMA_VERSION &&
        value.schemaVersion !== LEDGER_DOCUMENT_V3_SCHEMA_VERSION) ||
      !Array.isArray(value.revisions)
    ) {
      fail('ledger-invalid-document');
    }
    const schemaVersion = value.schemaVersion;
    if (value.revisions.length > MAX_LEDGER_REVISIONS) fail('ledger-too-large');
    checkEncodedSize(value);
    const workspace = decodeWorkspace(value.workspace);
    const byId = new Map<string, LedgerRevision>();
    let links = 0;
    for (const raw of value.revisions) {
      const revision = decodeRevision(raw, workspace.precision, schemaVersion >= LEDGER_DOCUMENT_V2_SCHEMA_VERSION, workspace.id, schemaVersion >= LEDGER_DOCUMENT_V3_SCHEMA_VERSION);
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
      schemaVersion,
      workspace,
      revisions: [...byId.values()].sort((left, right) => compare(left.id, right.id)),
    };
  } catch (error) {
    if (error instanceof LedgerSyncError) throw error;
    throw new LedgerSyncError('ledger-invalid-document');
  }
}

export function mergeLedgerDocuments(left: LedgerDocument, right: LedgerDocument): LedgerDocument {
  const decodedLeft = decodeLedgerDocument(left);
  const decodedRight = decodeLedgerDocument(right);
  const targetVersion =
    decodedLeft.schemaVersion === LEDGER_DOCUMENT_V3_SCHEMA_VERSION ||
    decodedRight.schemaVersion === LEDGER_DOCUMENT_V3_SCHEMA_VERSION
      ? LEDGER_DOCUMENT_V3_SCHEMA_VERSION
      : decodedLeft.schemaVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION ||
          decodedRight.schemaVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION
        ? LEDGER_DOCUMENT_V2_SCHEMA_VERSION
        : LEDGER_DOCUMENT_SCHEMA_VERSION;
  const first =
    targetVersion === LEDGER_DOCUMENT_V3_SCHEMA_VERSION
      ? upgradeLedgerDocumentV3(decodedLeft, catalogFromDocument(decodedRight))
      : targetVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION
        ? upgradeLedgerDocument(decodedLeft)
      : decodedLeft;
  const second =
    targetVersion === LEDGER_DOCUMENT_V3_SCHEMA_VERSION
      ? upgradeLedgerDocumentV3(decodedRight, catalogFromDocument(decodedLeft))
      : targetVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION
        ? upgradeLedgerDocument(decodedRight)
      : decodedRight;
  if (JSON.stringify(first.workspace) !== JSON.stringify(second.workspace)) fail('ledger-workspace-mismatch');
  const revisions = new Map(first.revisions.map((revision) => [revision.id, revision]));
  for (const revision of second.revisions) {
    const existing = revisions.get(revision.id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(revision)) {
      fail('ledger-revision-collision');
    }
    revisions.set(revision.id, revision);
  }
  return decodeLedgerDocument({
    ...first,
    schemaVersion: targetVersion,
    revisions: [...revisions.values()],
  });
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

/** Create a v2 graph with host-only descriptors, including an explicit empty list. */
export function seedLedgerDocumentV2(
  workspace: Workspace,
  transactions: readonly StoredTransaction[],
  budgets: Readonly<Record<string, string | null>>,
): LedgerDocumentV2 {
  return decodeLedgerDocument({
    schemaVersion: LEDGER_DOCUMENT_V2_SCHEMA_VERSION,
    workspace,
    revisions: [
      ...transactions.map((value) => ({
        id: `seed:transaction:${value.id}`,
        kind: 'transaction' as const,
        entityId: value.id,
        parents: [],
        value,
      })),
      ...Object.entries(budgets).map(([entityId, value]) => ({
        id: `seed:budget:${entityId}`,
        kind: 'budget' as const,
        entityId,
        parents: [],
        value,
      })),
    ],
  }) as LedgerDocumentV2;
}

/** Create a v3 graph with a workspace-scoped category catalog. */
export function seedLedgerDocumentV3(
  workspace: Workspace,
  transactions: readonly StoredTransaction[],
  budgets: Readonly<Record<string, string | null>>,
  catalog: CategoryCatalog,
): LedgerDocumentV3 {
  const normalizedCatalog = validateCategoryCatalog(catalog);
  return decodeLedgerDocument({
    schemaVersion: LEDGER_DOCUMENT_V3_SCHEMA_VERSION,
    workspace,
    revisions: [
      {
        id: `seed:category-catalog:${workspace.id}`,
        kind: 'category-catalog' as const,
        entityId: workspace.id,
        parents: [],
        value: normalizedCatalog,
      },
      ...transactions.map((value) => ({
        id: `seed:transaction:${value.id}`,
        kind: 'transaction' as const,
        entityId: value.id,
        parents: [],
        value,
      })),
      ...Object.entries(budgets).map(([entityId, value]) => ({
        id: `seed:budget:${entityId}`,
        kind: 'budget' as const,
        entityId,
        parents: [],
        value,
      })),
    ],
  }) as LedgerDocumentV3;
}

export function projectLedgerDocument(document: LedgerDocument): LedgerProjection {
  const decoded = decodeLedgerDocument(document);
  const projection: LedgerProjection = { workspace: decoded.workspace, transactions: [], budgets: {}, categories: [], categoryHeadIds: [], conflicts: [] };
  for (const heads of entityHeads(decoded).values()) {
    const first = heads[0];
    if (first === undefined) continue;
    if (heads.length === 1) {
      if (first.kind === 'transaction') {
        projection.transactions.push(
          isStoredTransaction(first.value)
            ? storedTransactionToTransaction(first.value)
            : { ...first.value, splits: first.value.splits.map((split) => ({ ...split })) },
        );
      } else if (first.kind === 'budget') {
        projection.budgets[first.entityId] = first.value;
      } else {
        projection.categories = first.value.categories.map((category) => ({ ...category }));
        projection.categoryHeadIds = [first.id];
      }
    } else if (first.kind === 'transaction') {
      projection.conflicts.push({
        kind: first.kind, entityId: first.entityId,
        heads: heads.filter((head): head is Extract<LedgerRevision, { kind: 'transaction' }> => head.kind === 'transaction'),
      });
    } else if (first.kind === 'budget') {
      projection.budgets[first.entityId] = null;
      projection.conflicts.push({
        kind: first.kind, entityId: first.entityId,
        heads: heads.filter((head): head is Extract<LedgerRevision, { kind: 'budget' }> => head.kind === 'budget'),
      });
    } else {
      projection.categoryHeadIds = heads.map((head) => head.id).sort(compare);
      projection.conflicts.push({
        kind: first.kind,
        entityId: first.entityId,
        heads: heads.filter((head): head is Extract<LedgerRevision, { kind: 'category-catalog' }> => head.kind === 'category-catalog'),
      });
    }
  }
  return projection;
}

/** Validate and return the complete historical v2 attachment inventory. */
export function attachmentInventory(
  document: LedgerDocument,
): Map<string, StoredAttachmentDescriptor> {
  const decoded = decodeLedgerDocument(document);
  const inventory = new Map<string, StoredAttachmentDescriptor>();
  if (decoded.schemaVersion < LEDGER_DOCUMENT_V2_SCHEMA_VERSION) return inventory;
  for (const revision of decoded.revisions) {
    if (revision.kind !== 'transaction' || !isStoredTransaction(revision.value)) continue;
    for (const descriptor of revision.value.attachments) {
      if (descriptor.workspaceId !== decoded.workspace.id)
        fail('ledger-workspace-mismatch');
      const existing = inventory.get(descriptor.id);
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(descriptor))
        fail('ledger-revision-collision');
      inventory.set(descriptor.id, { ...descriptor });
    }
  }
  return inventory;
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
  if (
    decoded.schemaVersion === LEDGER_DOCUMENT_SCHEMA_VERSION &&
    input.kind === 'transaction' &&
    isStoredTransaction(input.value)
  ) {
    // A local write carrying an encrypted attachment must promote the graph to
    // v2 before the revision is validated. Existing revision IDs and heads are
    // preserved by the upgrade, so optimistic concurrency remains intact.
    return addRevision(upgradeLedgerDocument(decoded), input, expectedHeadIds, resolving);
  }
  const normalizedInput =
    decoded.schemaVersion >= LEDGER_DOCUMENT_V2_SCHEMA_VERSION &&
    input.kind === 'transaction' &&
    !isStoredTransaction(input.value)
      ? {
          ...input,
          value: storedTransactionFromTransaction(input.value),
        }
      : input;
  const revision = decodeRevision(
    { ...normalizedInput, parents: [] },
    decoded.workspace.precision,
    decoded.schemaVersion >= LEDGER_DOCUMENT_V2_SCHEMA_VERSION,
    decoded.workspace.id,
    decoded.schemaVersion >= LEDGER_DOCUMENT_V3_SCHEMA_VERSION,
  );
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

function decodeRevision(
  value: unknown,
  precision: number,
  isV2: boolean,
  workspaceId: string,
  isV3: boolean,
): LedgerRevision {
  try {
    if (!isRecord(value)) fail('ledger-invalid-document');
    exactKeys(value, ['id', 'kind', 'entityId', 'parents', 'value']);
    const id = revisionId(value.id);
    const parents = decodeLedgerHeadIds(value.parents);
    if (value.kind === 'transaction') {
      const entityId = decodeId(value.entityId);
      const transaction = isV2
        ? decodeStoredTransaction(value.value, precision)
        : decodeTransaction(value.value, precision);
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
    if (value.kind === 'category-catalog' && isV3) {
      const entityId = decodeId(value.entityId, 'category catalog workspace id');
      if (entityId !== workspaceId) fail('ledger-workspace-mismatch');
      return { id, kind: 'category-catalog', entityId, parents, value: decodeCategoryCatalog(value.value) };
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

export function categoryHeadIds(document: LedgerDocument): string[] {
  const decoded = decodeLedgerDocument(document);
  return (entityHeads(decoded).get(`category-catalog:${decoded.workspace.id}`) ?? [])
    .map((head) => head.id)
    .sort(compare);
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

export function upgradeLedgerDocument(document: LedgerDocument): LedgerDocumentV2 {
  if (document.schemaVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION)
    return document;
  return decodeLedgerDocument({
    schemaVersion: LEDGER_DOCUMENT_V2_SCHEMA_VERSION,
    workspace: document.workspace,
    revisions: document.revisions.map((revision) =>
      revision.kind === 'transaction'
        ? {
            ...revision,
            value: isStoredTransaction(revision.value)
              ? revision.value
              : storedTransactionFromTransaction(revision.value),
          }
        : revision,
    ),
  }) as LedgerDocumentV2;
}

/** Upgrade a legacy graph to the v3 shape without guessing old category names. */
export function upgradeLedgerDocumentV3(
  document: LedgerDocument,
  catalog: CategoryCatalog = { categories: [] },
): LedgerDocumentV3 {
  if (document.schemaVersion === LEDGER_DOCUMENT_V3_SCHEMA_VERSION)
    return document;
  const v2 = document.schemaVersion === LEDGER_DOCUMENT_V2_SCHEMA_VERSION
    ? document
    : upgradeLedgerDocument(document);
  return decodeLedgerDocument({
    schemaVersion: LEDGER_DOCUMENT_V3_SCHEMA_VERSION,
    workspace: v2.workspace,
    revisions: [
      {
        id: `seed:category-catalog:${v2.workspace.id}`,
        kind: 'category-catalog' as const,
        entityId: v2.workspace.id,
        parents: [],
        value: validateCategoryCatalog(catalog),
      },
      ...v2.revisions,
    ],
  }) as LedgerDocumentV3;
}

function catalogFromDocument(document: LedgerDocument): CategoryCatalog | undefined {
  const projection = projectLedgerDocument(document);
  return projection.categories.length === 0 ? undefined : { categories: projection.categories.map((category) => ({ ...category })) };
}
