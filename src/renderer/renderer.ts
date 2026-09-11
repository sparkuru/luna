import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./data/local";
import { router } from "./app/router";
const root = document.getElementById("app");
if (root === null) throw new Error("Missing Luna application root");
createRoot(root).render(
  createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(RouterProvider, { router }),
  ),
);
