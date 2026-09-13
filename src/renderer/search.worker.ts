import {
  queryLedger,
  type LedgerQueryInput,
  type LedgerQueryRecord,
} from "../shared/ledger-query";

interface SearchRequest {
  id: number;
  transactions: readonly LedgerQueryRecord[];
  input: LedgerQueryInput;
}

interface SearchResponse {
  id: number;
  result?: ReturnType<typeof queryLedger>;
  error?: { code: string };
}

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null;
  postMessage(message: SearchResponse): void;
};

worker.onmessage = (event) => {
  const request = event.data;
  try {
    worker.postMessage({
      id: request.id,
      result: queryLedger(request.transactions, request.input),
    });
  } catch (error) {
    worker.postMessage({
      id: request.id,
      error: {
        code:
          error && typeof error === "object" && "code" in error
            ? String((error as { code: unknown }).code)
            : "ledger-query-invalid",
      },
    });
  }
};
