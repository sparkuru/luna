/**
 * AbortSignal.throwIfAborted() is missing from older Android WebViews. Keep
 * cancellation checks compatible with those runtimes while preserving the
 * native abort reason when the platform provides one.
 */
export function assertNotAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason ?? new Error("The operation was aborted");
}
