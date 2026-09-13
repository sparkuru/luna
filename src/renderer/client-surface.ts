export type ClientSurface = "web" | "mobile" | "electron";

const CLIENT_SURFACE_VALUES: readonly ClientSurface[] = [
  "web",
  "mobile",
  "electron",
];

/**
 * Presentation-only host marker. It deliberately lives outside the ledger
 * API so the selected shell can never become part of persisted or synced
 * application state.
 */
export function setClientSurface(surface: ClientSurface): void {
  document.documentElement.dataset.clientSurface = surface;
}

export function getClientSurface(): ClientSurface {
  const value = document.documentElement.dataset.clientSurface;
  return CLIENT_SURFACE_VALUES.includes(value as ClientSurface)
    ? (value as ClientSurface)
    : "electron";
}
