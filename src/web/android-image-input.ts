import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES,
  MAX_SOURCE_IMAGE_BYTES,
  SOURCE_ATTACHMENT_MIME_TYPES,
  type SourceAttachmentMime,
} from "../shared/attachment-contract";

export interface AndroidSelectedImage {
  handle: string;
  mime: SourceAttachmentMime;
  size: number | null;
}

export interface AndroidImageInputPlugin {
  selectImages(): Promise<{ images: AndroidSelectedImage[] }>;
  readSelectedImageChunk(options: {
    handle: string;
    sequence: number;
  }): Promise<{ base64: string; eof: boolean; receivedBytes: number }>;
  closeSelectedImage(options: { handle: string }): Promise<void>;
}

const imageInput = registerPlugin<AndroidImageInputPlugin>("LedgerImageInput");

export function isAndroidImageInputAvailable(): boolean {
  return Capacitor.getPlatform() === "android";
}

/** The host exposes only opaque handles; raw content URIs never reach this module. */
export async function pickAndroidImages(
  plugin: AndroidImageInputPlugin = imageInput,
): Promise<AndroidSelectedImage[]> {
  const result = await plugin.selectImages();
  if (!isRecord(result) || !Array.isArray(result.images) || result.images.length > 9)
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  return result.images.map((image) => decodeSelectedImage(image));
}

/** Read one selected image through the bounded native bridge, then close its handle. */
export async function readAndroidSelectedImage(
  selected: AndroidSelectedImage,
  plugin: AndroidImageInputPlugin = imageInput,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let finished = false;
  try {
    for (
      let sequence = 0;
      sequence <= Math.floor(MAX_SOURCE_IMAGE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES);
      sequence += 1
    ) {
      const chunk = await plugin.readSelectedImageChunk({
        handle: selected.handle,
        sequence,
      });
      const bytes = decodeBase64Chunk(chunk.base64);
      const nextReceivedBytes = receivedBytes + bytes.byteLength;
      if (
        !Number.isSafeInteger(chunk.receivedBytes) ||
        chunk.receivedBytes !== nextReceivedBytes ||
        nextReceivedBytes > MAX_SOURCE_IMAGE_BYTES
      ) {
        bytes.fill(0);
        throw new Error("LUNA_ERROR:attachment-source-too-large");
      }
      chunks.push(bytes);
      receivedBytes = nextReceivedBytes;
      const eof = chunk.eof || (selected.size !== null && receivedBytes === selected.size);
      if (eof) {
        if (receivedBytes === 0 || (selected.size !== null && receivedBytes !== selected.size))
          throw new Error("LUNA_ERROR:attachment-invalid-source");
        const result = new Uint8Array(receivedBytes);
        let offset = 0;
        for (const part of chunks) {
          result.set(part, offset);
          offset += part.byteLength;
          part.fill(0);
        }
        finished = true;
        return result;
      }
      if (sequence === Math.floor(MAX_SOURCE_IMAGE_BYTES / MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES))
        throw new Error("LUNA_ERROR:attachment-source-too-large");
    }
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  } finally {
    if (!finished) {
      for (const part of chunks) part.fill(0);
    }
    await plugin.closeSelectedImage({ handle: selected.handle }).catch(() => undefined);
  }
}

export async function closeAndroidSelectedImages(
  images: readonly AndroidSelectedImage[],
  plugin: AndroidImageInputPlugin = imageInput,
): Promise<void> {
  await Promise.all(
    images.map((image) =>
      plugin.closeSelectedImage({ handle: image.handle }).catch(() => undefined),
    ),
  );
}

export function isAndroidImagePickerCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === "LUNA_ERROR:attachment-picker-cancelled";
}

function decodeSelectedImage(value: unknown): AndroidSelectedImage {
  if (!isRecord(value)) throw new Error("LUNA_ERROR:attachment-invalid-source");
  const size = value.size;
  if (
    typeof value.handle !== "string" ||
    value.handle.length < 1 ||
    value.handle.length > 128 ||
    typeof value.mime !== "string" ||
    !(SOURCE_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value.mime) ||
    (typeof size !== "number" && size !== null) ||
    (typeof size === "number" &&
      (!Number.isSafeInteger(size) || size < 1 || size > MAX_SOURCE_IMAGE_BYTES))
  )
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  if (typeof size !== "number" && size !== null)
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  return {
    handle: value.handle,
    mime: value.mime as SourceAttachmentMime,
    size: size === null ? null : size,
  };
}

function decodeBase64Chunk(value: unknown): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    value.length > Math.ceil(MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  }
  if (binary.length < 1 || binary.length > MAX_ATTACHMENT_BRIDGE_CHUNK_BYTES || btoa(binary) !== value)
    throw new Error("LUNA_ERROR:attachment-invalid-source");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
