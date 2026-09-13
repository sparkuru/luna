import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./data/local";
import { router } from "./app/router";
import { setClientSurface } from "./client-surface";

// Electron loads this entry directly; Web and Android set their own marker
// before dynamically importing the shared renderer.
if (document.documentElement.dataset.clientSurface === undefined)
  setClientSurface("electron");

const root = document.getElementById("app");
if (root === null) throw new Error("Missing Luna application root");
createRoot(root).render(
  createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(RouterProvider, { router }),
  ),
);
