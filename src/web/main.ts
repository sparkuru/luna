import type { LunaLedgerApi } from "../shared/api";
import { safeIndexedDB } from "./browser-state-store";
import { createWebProfileHost } from "./profile-host";
import { t, type MessageKey } from "../renderer/i18n";
import { Capacitor } from "@capacitor/core";
import { saveAndroidLedgerBackup } from "./android-backup";
import { setClientSurface } from "../renderer/client-surface";

declare global {
  interface Window {
    lunaLedger: LunaLedgerApi;
  }
}

// Older Android WebViews can expose a secure localhost WebView without the
// Storage Foundation/OPFS APIs required by SQLite-WASM. Keep the compatibility
// path native-only; a plain HTTP browser host must still fail closed.
const nativeIndexedDbFallback =
  Capacitor.isNativePlatform() &&
  typeof navigator.storage?.getDirectory !== "function"
    ? safeIndexedDB()
    : undefined;
setClientSurface(Capacitor.isNativePlatform() ? "mobile" : "web");
const profileHost = createWebProfileHost(nativeIndexedDbFallback);
window.lunaLedger = profileHost.api;
const refreshRemote = (): void => {
  if (document.visibilityState !== "visible") return;
  profileHost.scheduleSync();
  // A foreground transition should not wait for the five-second marker poll
  // to notice a change made on another device. The marker is safe metadata;
  // the encrypted body is still fetched only by the normal sync flow.
  void profileHost.checkRemoteNow().catch(() => undefined);
};
window.addEventListener("online", refreshRemote);
document.addEventListener("visibilitychange", refreshRemote);
if (Capacitor.getPlatform() === "android") {
  const api = window.lunaLedger;
  api.saveLedgerBackup = (password) => saveAndroidLedgerBackup(api, password);
}
void import("../renderer/renderer");

// Development must not cache Vite modules; release workers update only after
// existing clients close, preserving open forms and a consistent asset version.
if (import.meta.env.PROD) {
  let status: MessageKey = "offlinePreparing";
  const element = document.getElementById("offline-status");
  const renderStatus = (): void => {
    if (element === null) return;
    element.hidden = false;
    element.textContent = t(
      document.documentElement.lang === "en" ? "en" : "zh-CN",
      status,
    );
  };
  const updateStatus = (ready: boolean): void => {
    status = ready ? "offlineReady" : "offlineUnavailable";
    document.documentElement.dataset.offlineShell = ready
      ? "ready"
      : "unavailable";
    renderStatus();
  };
  new MutationObserver(renderStatus).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  renderStatus();
  if (Capacitor.isNativePlatform()) {
    // APK assets are shipped locally; a stale worker must never shadow updates.
    updateStatus(true);
  } else if ("serviceWorker" in navigator) {
    const timeout = setTimeout(() => updateStatus(false), 15_000);
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then(() => updateStatus(true))
      .catch(() => updateStatus(false))
      .finally(() => clearTimeout(timeout));
  } else {
    updateStatus(false);
  }
}
