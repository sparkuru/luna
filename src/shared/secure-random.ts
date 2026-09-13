/**
 * Generate an identifier using only cryptographically secure browser APIs.
 * The byte fallback keeps browser-generated IDs working when randomUUID is
 * unavailable on a secure-context boundary such as an embedded WebView.
 */
export function secureRandomUuid(
  cryptoApi: Crypto | undefined = globalThis.crypto,
): string {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== "function")
    throw new Error("LUNA_ERROR:secure-random-unavailable");

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function secureRandomId(
  prefix: string,
  cryptoApi: Crypto | undefined = globalThis.crypto,
): string {
  return `${prefix}-${secureRandomUuid(cryptoApi)}`;
}
