import {
  createBrowserHistory,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { App } from "./shell";
import { validateLedgerSearch } from "./search";
const rootRoute = createRootRoute({
  component: App,
  validateSearch: validateLedgerSearch,
});
const paths = [
  "/",
  "/setup",
  "/ledger",
  "/statistics",
  "/budget",
  "/settings",
  "/settings/account",
  "/settings/sync",
  "/settings/backup",
  "/settings/conflicts",
  "/settings/ledgers",
  "/settings/preferences",
  "/settings/sync/advanced",
  "/ledger/menu",
  "/ledger/menu/settings",
  "/ledger/menu/budget",
  "/ledger/menu/statistics",
  "/ledger/menu/sync",
  "/ledger/menu/backup",
  "/ledger/menu/conflicts",
  "/ledger/menu/account",
] as const;
const routes = paths.map((path) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
);
export const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  history:
    location.protocol === "file:" || Capacitor.isNativePlatform()
      ? createHashHistory()
      : createBrowserHistory(),
  defaultNotFoundComponent: () => null,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
