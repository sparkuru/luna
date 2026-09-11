export interface LedgerSearch {
  month?: string;
  type?: "all" | "income" | "expense";
}
export function validateLedgerSearch(
  search: Record<string, unknown>,
): LedgerSearch {
  const result: LedgerSearch = {};
  if (
    typeof search.month === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
  )
    result.month = search.month;
  if (
    search.type === "all" ||
    search.type === "income" ||
    search.type === "expense"
  )
    result.type = search.type;
  return result;
}
