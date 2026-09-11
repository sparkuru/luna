import type { SessionVaultRecord } from "../sync/session-vault";

type Port = {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
  postMessage(message: ResponseMessage): void;
  start(): void;
};
type RequestMessage =
  | { id: number; operation: "load" }
  | { id: number; operation: "save"; record: SessionVaultRecord }
  | { id: number; operation: "clear" };
type ResponseMessage = {
  id: number;
  ok: true;
  record?: SessionVaultRecord | null;
} | {
  id: number;
  ok: false;
};

// A SharedWorker is intentionally only an in-memory bridge. It survives a
// renderer reload when the browser keeps the origin's worker alive, but it is
// not a persistence layer and contains no localStorage/SQLite access.
let record: SessionVaultRecord | null = null;
const scope = globalThis as typeof globalThis & {
  onconnect?: (event: { ports: Port[] }) => void;
};

scope.onconnect = (event) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = (message) => {
    const request = message.data;
    if (request.operation === "load")
      port.postMessage({ id: request.id, ok: true, record });
    else if (request.operation === "save") {
      record = request.record;
      port.postMessage({ id: request.id, ok: true });
    } else {
      record = null;
      port.postMessage({ id: request.id, ok: true });
    }
  };
  port.start();
};
