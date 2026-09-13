import { currentLocalDate, currentLocalMonth, isLocalDate } from "../../shared/domain";
import {
  STATISTICS_PERIODS,
  type StatisticsPeriod,
} from "../../shared/ledger-statistics";

export interface LedgerSearch {
  month?: string;
  type?: "all" | "income" | "expense";
  period?: StatisticsPeriod;
  anchor?: string;
}

export function validateLedgerSearch(
  search: Record<string, unknown>,
): LedgerSearch {
  const result: LedgerSearch = {};
  const month =
    typeof search.month === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
      ? search.month
      : undefined;
  const anchor =
    typeof search.anchor === "string" && isLocalDate(search.anchor)
      ? search.anchor
      : undefined;
  if (month !== undefined) {
    result.month = month;
    result.anchor =
      anchor === undefined
        ? month === currentLocalMonth()
          ? currentLocalDate()
          : `${month}-01`
        : anchor.slice(0, 7) === month
          ? anchor
          : `${month}-01`;
  } else if (anchor !== undefined) {
    result.month = anchor.slice(0, 7);
    result.anchor = anchor;
  }
  if (
    search.type === "all" ||
    search.type === "income" ||
    search.type === "expense"
  )
    result.type = search.type;
  if (STATISTICS_PERIODS.includes(search.period as StatisticsPeriod))
    result.period = search.period as StatisticsPeriod;
  return result;
}

export function defaultStatisticsAnchor(month: string): string {
  return month === currentLocalMonth() ? currentLocalDate() : `${month}-01`;
}
