import { createClient, createConfig } from "../generated/client";
import { isAllowedServerOrigin } from "../../shared/server-api";

export class ResponseLimitError extends Error {
  constructor() {
    super("response-too-large");
    this.name = "ResponseLimitError";
  }
}
/** Bound decoded response bytes before the generated client's JSON parser runs. */
export function boundedFetch(
  fetcher: typeof fetch = globalThis.fetch,
  maxBytes = 12 * 1024 * 1024,
): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, {
      ...init,
      redirect: "error",
      cache: "no-store",
    });
    if (!response.body) return response;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes)
        throw new ResponseLimitError();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new ResponseLimitError();
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
export function createApiClient(
  baseUrl: string,
  token: () => string | undefined = () => undefined,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const url = new URL(baseUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !isAllowedServerOrigin(url)
  )
    throw new Error("invalid-server-url");
  return createClient(
    createConfig({
      baseUrl: url.origin,
      auth: token,
      fetch: boundedFetch(fetcher),
      throwOnError: false,
    }),
  );
}
