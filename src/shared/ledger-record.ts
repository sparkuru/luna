import {
  decodeAttachmentMetadata,
  toAttachmentMetadata,
  validateAttachmentDescriptor,
  type AttachmentAvailability,
  type StoredAttachmentDescriptor,
} from "./attachment-contract";
import type { AttachmentMetadata } from "./attachment-contract";
import {
  decodeTransaction,
  type Transaction,
} from "./domain";

/** Host-only transaction value used by v2 ledger graphs. */
export interface StoredTransaction extends Omit<Transaction, "attachments"> {
  attachments: readonly StoredAttachmentDescriptor[];
}

export function storedTransactionFromTransaction(
  transaction: Transaction,
  attachments: readonly StoredAttachmentDescriptor[] = [],
): StoredTransaction {
  if (transaction.attachments !== undefined && attachments.length === 0)
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const value: StoredTransaction = {
    id: transaction.id,
    revision: transaction.revision,
    type: transaction.type,
    amountMinor: transaction.amountMinor,
    date: transaction.date,
    splits: transaction.splits.map((split) => ({ ...split })),
    merchant: transaction.merchant,
    paymentMethod: transaction.paymentMethod,
    notes: transaction.notes,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    deletedAt: transaction.deletedAt,
    attachments: attachments.map((descriptor) => ({ ...descriptor })),
  };
  validateStoredTransaction(value);
  return value;
}

export function storedTransactionToTransaction(
  value: StoredTransaction,
  availability: AttachmentAvailability = "local",
): Transaction {
  validateStoredTransaction(value);
  return {
    id: value.id,
    revision: value.revision,
    type: value.type,
    amountMinor: value.amountMinor,
    date: value.date,
    splits: value.splits.map((split) => ({ ...split })),
    merchant: value.merchant,
    paymentMethod: value.paymentMethod,
    notes: value.notes,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: value.deletedAt,
    ...(value.attachments.length === 0
      ? {}
      : { attachments: value.attachments.map((item) => toAttachmentMetadata(item, availability)) }),
  };
}

export function isStoredTransaction(
  value: Transaction | StoredTransaction,
): value is StoredTransaction {
  return Array.isArray(value.attachments) &&
    value.attachments.every((attachment) =>
      typeof attachment === "object" &&
      attachment !== null &&
      "key" in attachment &&
      "iv" in attachment,
    );
}

export function decodeStoredTransaction(
  value: unknown,
  precision: number,
): StoredTransaction {
  if (!isRecord(value) || !Object.hasOwn(value, "attachments"))
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  if (!Array.isArray(value.attachments))
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const { attachments, ...financial } = value;
  const transaction = decodeTransaction(financial, precision);
  const descriptors = attachments.map((item) => {
    validateAttachmentDescriptor(item);
    return { ...item };
  });
  if (descriptors.length > 9 || new Set(descriptors.map((item) => item.id)).size !== descriptors.length)
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const stored: StoredTransaction = {
    ...transaction,
    attachments: descriptors,
  };
  validateStoredTransaction(stored);
  return stored;
}

export function validateStoredTransaction(value: StoredTransaction): void {
  if (value.attachments.length > 9)
    throw new Error("LUNA_ERROR:attachment-invalid-reference");
  const ids = new Set<string>();
  for (const descriptor of value.attachments) {
    validateAttachmentDescriptor(descriptor);
    if (ids.has(descriptor.id))
      throw new Error("LUNA_ERROR:attachment-invalid-reference");
    ids.add(descriptor.id);
    if (descriptor.workspaceId.length === 0)
      throw new Error("LUNA_ERROR:attachment-invalid-reference");
  }
}

export function decodeSafeAttachmentMetadata(value: unknown): AttachmentMetadata {
  return decodeAttachmentMetadata(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
