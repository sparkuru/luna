import type { Transaction } from "./domain";
import type { CategoryCatalog } from "./category-catalog";
import { isStoredTransaction, storedTransactionToTransaction } from "./ledger-record";
import type { LedgerConflict } from "./ledger-sync";

export type PublicLedgerConflictHead =
  | {
      id: string;
      kind: "transaction";
      entityId: string;
      parents: string[];
      value: Transaction;
    }
  | {
      id: string;
      kind: "budget";
      entityId: string;
      parents: string[];
      value: string | null;
    }
  | {
      id: string;
      kind: "category-catalog";
      entityId: string;
      parents: string[];
      value: CategoryCatalog;
    };

export type PublicLedgerConflict =
  | {
      kind: "transaction";
      entityId: string;
      heads: Extract<PublicLedgerConflictHead, { kind: "transaction" }>[];
    }
  | {
      kind: "budget";
      entityId: string;
      heads: Extract<PublicLedgerConflictHead, { kind: "budget" }>[];
    }
  | {
      kind: "category-catalog";
      entityId: string;
      heads: Extract<PublicLedgerConflictHead, { kind: "category-catalog" }>[];
    };

/** Recursively removes host-only attachment descriptors from conflict DTOs. */
export function projectLedgerConflicts(
  conflicts: readonly LedgerConflict[],
): PublicLedgerConflict[] {
  return conflicts.map((conflict) => {
    if (conflict.kind === "budget") {
      return {
        kind: "budget" as const,
        entityId: conflict.entityId,
        heads: conflict.heads.map((head) => ({
          id: head.id,
          kind: "budget" as const,
          entityId: head.entityId,
          parents: [...head.parents],
          value: head.value,
        })),
      };
    }
    if (conflict.kind === "category-catalog") {
      return {
        kind: "category-catalog" as const,
        entityId: conflict.entityId,
        heads: conflict.heads.map((head) => ({
          id: head.id,
          kind: "category-catalog" as const,
          entityId: head.entityId,
          parents: [...head.parents],
          value: { categories: head.value.categories.map((category) => ({ ...category })) },
        })),
      };
    }
    return {
      kind: "transaction" as const,
      entityId: conflict.entityId,
      heads: conflict.heads.map((head) => {
      const value = isStoredTransaction(head.value)
        ? storedTransactionToTransaction(head.value)
        : cloneTransaction(head.value);
      return {
        id: head.id,
        kind: "transaction" as const,
        entityId: head.entityId,
        parents: [...head.parents],
        value,
      };
      }),
    };
  });
}

function cloneTransaction(value: Transaction): Transaction {
  return {
    ...value,
    splits: value.splits.map((split) => ({ ...split })),
    ...(value.attachments === undefined
      ? {}
      : {
          attachments: value.attachments.map((attachment) => ({ ...attachment })),
        }),
  };
}
