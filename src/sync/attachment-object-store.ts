/** Transport-neutral access to the immutable ciphertext objects referenced by a v2 graph. */
import type { StoredAttachmentDescriptor } from "../shared/attachment-contract";

export interface LocalAttachmentPort {
  readAttachmentCiphertext?(
    attachmentId: string,
  ): Promise<{ descriptor: StoredAttachmentDescriptor; ciphertext: Uint8Array } | null>;
  saveDownloadedAttachment?(
    descriptor: StoredAttachmentDescriptor,
    ciphertext: Uint8Array,
  ): Promise<void>;
}

export interface AttachmentObjectStore {
  get(
    attachmentId: string,
    signal: AbortSignal,
  ): Promise<{ body: Uint8Array; etag: string; sha256: string } | null>;
  putImmutable(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    signal: AbortSignal,
    idempotencyKey?: string,
  ): Promise<{ etag: string }>;
  repairExpectedCiphertext(
    attachmentId: string,
    body: Uint8Array,
    sha256: string,
    observedEtag: string,
    signal: AbortSignal,
    idempotencyKey?: string,
  ): Promise<{ etag: string }>;
  close(): void;
}
