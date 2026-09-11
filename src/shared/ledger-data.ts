import { decodeBudgetInput, decodeId, type BudgetInput } from './domain';
import {
  decodeLedgerHeadIds, LedgerSyncError, projectLedgerDocument, resolveLedgerConflict,
  type LedgerDocument,
} from './ledger-sync';

export function decodeBudgetUpdate(value: unknown): BudgetInput & { expectedHeadIds?: string[] } {
  const budget = decodeBudgetInput(value);
  // decodeBudgetInput already requires a non-null record at this boundary.
  const expected = (value as Record<string, unknown>).expectedHeadIds;
  return { ...budget, ...(expected === undefined ? {} : { expectedHeadIds: decodeLedgerHeadIds(expected) }) };
}

export interface LedgerConflictChoice {
  kind: 'transaction' | 'budget';
  entityId: string;
  selectedHeadId: string;
  expectedHeadIds: string[];
}

export function decodeLedgerConflictChoice(value: unknown): LedgerConflictChoice {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LedgerSyncError('ledger-invalid-document');
  }
  const input = value as Record<string, unknown>;
  const keys = ['kind', 'entityId', 'selectedHeadId', 'expectedHeadIds'];
  if (Object.keys(input).length !== keys.length || keys.some((key) => !(key in input)) ||
      (input.kind !== 'transaction' && input.kind !== 'budget') ||
      !Array.isArray(input.expectedHeadIds) || input.expectedHeadIds.length < 2 ||
      input.expectedHeadIds.length > 10_000) {
    throw new LedgerSyncError('ledger-invalid-document');
  }
  return {
    kind: input.kind,
    entityId: decodeId(input.entityId, 'entity id'),
    selectedHeadId: decodeHeadId(input.selectedHeadId),
    expectedHeadIds: input.expectedHeadIds.map(decodeHeadId),
  };
}

function decodeHeadId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new LedgerSyncError('ledger-invalid-document');
  }
  return value;
}

/** A choice copies a visible candidate, never accepts a replacement financial payload. */
export function resolveLedgerChoice(
  document: LedgerDocument, input: LedgerConflictChoice, revisionId: string, now: string,
): LedgerDocument {
  const choice = decodeLedgerConflictChoice(input);
  const conflict = projectLedgerDocument(document).conflicts.find(
    (item) => item.kind === choice.kind && item.entityId === choice.entityId,
  );
  if (conflict === undefined) throw new LedgerSyncError('ledger-stale-heads');
  const selected = conflict.heads.find((head) => head.id === choice.selectedHeadId);
  if (selected === undefined) throw new LedgerSyncError('ledger-stale-heads');
  if (selected.kind === 'budget') {
    return resolveLedgerConflict(document, {
      id: revisionId, kind: 'budget', entityId: selected.entityId, value: selected.value,
    }, choice.expectedHeadIds);
  }
  const revision = Math.max(...conflict.heads.map(
    (head) => head.kind === 'transaction' ? head.value.revision : 0,
  )) + 1;
  return resolveLedgerConflict(document, {
    id: revisionId, kind: 'transaction', entityId: selected.entityId,
    value: { ...selected.value, revision, updatedAt: now,
      deletedAt: selected.value.deletedAt === null ? null : now },
  }, choice.expectedHeadIds);
}
