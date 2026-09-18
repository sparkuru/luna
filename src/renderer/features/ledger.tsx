import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Images,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  decimalToMinorUnits,
  isLocalDate,
  nextMonth,
  parseMinorUnits,
  previousMonth,
  type Transaction,
} from "../../shared/domain";
import type { CategoryDefinition } from "../../shared/category-catalog";
import type { AppLocale } from "../../shared/settings";
import {
  MAX_LEDGER_QUERY_LENGTH,
  queryLedger,
  type LedgerQueryInput,
  type LedgerQueryMode,
  type LedgerQueryRecord,
  type LedgerQueryResult,
} from "../../shared/ledger-query";
import {
  formatDate,
  formatMoney,
  formatMonth,
  formatMonthName,
  t,
  type MessageKey,
} from "../i18n";
import { scopedRead, useApp, useLocalWrite } from "../data/local";
import { Button } from "../components/ui/button";
import { Field } from "../components/form";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { getClientSurface } from "../client-surface";
import { labelCategories, labelCategory } from "../category-display";
import type { Entry } from "./entry";

type ImageViewerState = {
  transactionId: string;
  attachmentId: string;
  title: string;
  returnFocus: string;
  attachments: readonly NonNullable<Transaction["attachments"]>[number][];
  index: number;
  metadata: NonNullable<Transaction["attachments"]>[number];
  url?: string;
  loading: boolean;
  error?: string;
};

type TransactionDetailState = {
  transaction: Transaction;
  returnFocus: string;
};

type RegexSearchState = {
  key: string;
  result: LedgerQueryResult | null;
  error: string;
  status: FilterEvaluationStatus;
};

type FilterEvaluationStatus = "ready" | "working" | "invalid" | "failed";

type FilterEvaluation = {
  status: FilterEvaluationStatus;
  result: LedgerQueryResult | null;
  error: string;
};

type QueryInputState = {
  input: LedgerQueryInput | null;
  error: string;
  field?: "date" | "amount" | "query";
};

type FilterCategoryGroup = "expense" | "income" | "other";

type FilterCategoryOption = {
  id: string;
  label: string;
  group: FilterCategoryGroup;
  position: number;
};

type Message = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

type SearchWorkerResponse = {
  id: number;
  result?: LedgerQueryResult;
  error?: { code: string };
};

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error
    ? /LUNA_ERROR:([a-z-]+)/.exec(error.message)?.[1] ?? ""
    : "";
}

function filterErrorMessage(
  cause: unknown,
  message: Message,
  fallback: (error: unknown) => string,
): string {
  switch (errorCode(cause)) {
    case "invalid-date":
      return message("filterDateInvalid");
    case "ledger-query-date-range":
      return message("filterDateRangeInvalid");
    case "invalid-amount":
      return message("filterAmountInvalid");
    case "ledger-query-amount-range":
      return message("filterAmountRangeInvalid");
    case "ledger-query-invalid":
      return message("filterInvalid");
    case "ledger-query-regex-invalid":
      return message("regexInvalid");
    case "ledger-query-timeout":
      return message("regexTimeout");
    case "ledger-query-worker-unavailable":
      return message("regexUnavailable");
    default:
      return fallback(cause);
  }
}

function filterCategoryLabel(
  categories: readonly CategoryDefinition[] | undefined,
  id: string,
): string {
  const definition = categories?.find((category) => category.id === id);
  return definition?.deletedAt === null ? labelCategory(categories, id) : id;
}

function filterCategoryGroup(
  category: CategoryDefinition | undefined,
): FilterCategoryGroup {
  if (category?.deletedAt === null && category.type === "expense") return "expense";
  if (category?.deletedAt === null && category.type === "income") return "income";
  return "other";
}

function filterCategoryGroupLabel(
  group: FilterCategoryGroup,
  message: Message,
): string {
  switch (group) {
    case "expense":
      return message("filterCategoryExpense");
    case "income":
      return message("filterCategoryIncome");
    case "other":
      return message("filterCategoryOther");
  }
}

function filterDateLabel(
  locale: AppLocale,
  value: string,
): string {
  return isLocalDate(value) ? formatDate(locale, value) : value;
}

function MonthControls({
  month,
  locale,
  message: m,
  changeMonth,
  web,
}: {
  month: string;
  locale: AppLocale;
  message: (
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
  changeMonth(month: string): void;
  web: boolean;
}) {
  if (web)
    return (
      <WebMonthPicker
        month={month}
        locale={locale}
        message={m}
        changeMonth={changeMonth}
      />
    );
  return (
    <div className="month-controls month-navigator" aria-label={m("monthNavigation")}>
      <Button
        id="previous-month"
        type="button"
        variant="outline"
        aria-label={m("previousMonth")}
        onClick={() => changeMonth(previousMonth(month))}
      >
        <ChevronLeft className="month-control-icon" aria-hidden="true" />
        <span className="month-control-label">{m("previousMonth")}</span>
      </Button>
      <label className="visually-hidden" htmlFor="month-picker">
        {m("selectedMonth")}
      </label>
      <Input
        id="month-picker"
        type="month"
        aria-label={m("selectedMonth")}
        value={month}
        onChange={(event) => {
          if (event.currentTarget.value) changeMonth(event.currentTarget.value);
        }}
      />
      <Button
        id="next-month"
        type="button"
        variant="outline"
        aria-label={m("nextMonth")}
        onClick={() => changeMonth(nextMonth(month))}
      >
        <span className="month-control-label">{m("nextMonth")}</span>
        <ChevronRight className="month-control-icon" aria-hidden="true" />
      </Button>
    </div>
  );
}

function WebMonthPicker({
  month,
  locale,
  message: m,
  changeMonth,
}: {
  month: string;
  locale: AppLocale;
  message: Message;
  changeMonth(month: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => Number(month.slice(0, 4)));
  const navigatorRef = useRef<HTMLDivElement>(null);
  const selectedYear = Number(month.slice(0, 4));

  useEffect(() => {
    setPickerYear(selectedYear);
  }, [selectedYear]);

  const closePicker = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      navigatorRef.current
        ?.querySelector<HTMLButtonElement>("#month-picker")
        ?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && navigatorRef.current?.contains(target)) return;
      closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePicker();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, open]);

  const selectMonth = (next: string) => {
    changeMonth(next);
    closePicker();
  };

  return (
    <div
      ref={navigatorRef}
      className="month-controls month-navigator"
      aria-label={m("monthNavigation")}
    >
      <Button
        id="previous-month"
        type="button"
        variant="outline"
        aria-label={m("previousMonth")}
        onClick={() => changeMonth(previousMonth(month))}
      >
        <ChevronLeft className="month-control-icon" aria-hidden="true" />
        <span className="month-control-label">{m("previousMonth")}</span>
      </Button>
      <div className="month-picker">
        <button
          id="month-picker"
          type="button"
          className="month-picker-trigger"
          data-month={month}
          aria-label={m("monthPickerButton", {
            month: formatMonth(locale, month),
          })}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="month-picker-panel"
          onClick={() => {
            setPickerYear(selectedYear);
            setOpen((current) => !current);
          }}
        >
          <span>{formatMonth(locale, month)}</span>
        </button>
        {open && (
          <div
            id="month-picker-panel"
            className="month-picker-panel"
            role="dialog"
            aria-label={m("monthPicker")}
          >
            <div className="month-picker-year-navigation">
              <Button
                type="button"
                variant="ghost"
                className="month-picker-year-button"
                aria-label={m("previousYear")}
                disabled={pickerYear <= 1900}
                onClick={() =>
                  setPickerYear((year) => Math.max(1900, year - 1))
                }
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <span className="month-picker-year" aria-live="polite">
                {pickerYear}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="month-picker-year-button"
                aria-label={m("nextYear")}
                disabled={pickerYear >= 9999}
                onClick={() =>
                  setPickerYear((year) => Math.min(9999, year + 1))
                }
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <div
              className="month-picker-options"
              role="group"
              aria-label={m("monthChoices", { year: pickerYear })}
            >
              {Array.from({ length: 12 }, (_, index) => {
                const value = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={value}
                    type="button"
                    className="month-picker-option"
                    data-month={value}
                    aria-label={formatMonth(locale, value)}
                    aria-pressed={value === month}
                    onClick={() => selectMonth(value)}
                  >
                    {formatMonthName(locale, value)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Button
        id="next-month"
        type="button"
        variant="outline"
        aria-label={m("nextMonth")}
        onClick={() => changeMonth(nextMonth(month))}
      >
        <span className="month-control-label">{m("nextMonth")}</span>
        <ChevronRight className="month-control-icon" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function LedgerMonthLoading({
  month,
  locale,
  message: m,
  changeMonth,
  onRetry,
  error,
}: {
  month: string;
  locale: import("../../shared/settings").AppLocale;
  message: (
    key: MessageKey,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
  changeMonth(month: string): void;
  onRetry(): void;
  error: string;
}) {
  const web = getClientSurface() === "web";
  const summaryPlaceholders: readonly {
    key: string;
    label: MessageKey;
    className: string;
  }[] = [
    { key: "income", label: "income", className: "income" },
    { key: "spending", label: "spending", className: "expense" },
    { key: "netFlow", label: "netFlow", className: "net" },
  ];
  return (
    <>
      <section
        className="page-heading dashboard-hero month-loading-hero"
        data-ledger-state="loading"
        aria-labelledby="page-title"
        aria-busy={error === ""}
      >
        <div className="page-heading-copy">
          <span className="kicker">{m("ledgerKicker")}</span>
          <h1 id="page-title">{m("dashboardTitle")}</h1>
          <p>
            <span id="month-label">{formatMonth(locale, month)}</span>
          </p>
          <p className="hero-description">{m("ledgerIntro")}</p>
        </div>
        <div className="page-heading-actions">
          {!web && (
            <div
              className="entry-actions"
              role="group"
              aria-label={m("quickEntryType")}
            >
              <Button
                id="record-expense"
                className="entry-button expense"
                type="button"
                disabled
              >
                {m("recordExpense")}
              </Button>
              <Button
                id="record-income"
                className="entry-button income"
                type="button"
                disabled
              >
                {m("recordIncome")}
              </Button>
            </div>
          )}
          <MonthControls
            month={month}
            locale={locale}
            message={m}
            changeMonth={changeMonth}
            web={web}
          />
          {web && (
            <button
              id="primary-record"
              type="button"
              className="primary-record-button"
              disabled
              aria-describedby="month-loading-status"
            >
              <span className="primary-record-icon">
                <Plus size={21} strokeWidth={2.3} aria-hidden="true" />
              </span>
              <span>{m("addTransaction")}</span>
            </button>
          )}
        </div>
      </section>
      <section
        id="summary-grid"
        className="summary-grid month-loading-summary"
        aria-label={m("monthlySummary")}
        aria-busy={error === ""}
      >
        {summaryPlaceholders.map((summary) => (
          <article
            key={summary.key}
            className={`summary-card ${summary.className} month-loading-summary-card`}
          >
            <div className="summary-card-heading">
              <span className="eyebrow">{m(summary.label)}</span>
            </div>
            <span
              className="metric month-loading-placeholder month-loading-metric"
              aria-hidden="true"
            />
            <span className="subtext">
              <span
                className="month-loading-placeholder month-loading-subtext"
                aria-hidden="true"
              />
            </span>
          </article>
        ))}
      </section>
      <section
        className="panel transactions-panel month-loading-transactions"
        aria-labelledby="transactions-title"
        aria-busy={error === ""}
      >
        <div className="section-heading">
          <div>
            <h2 id="transactions-title" tabIndex={-1}>
              {m("recentLedger")}
            </h2>
            <p>{m("recentLedgerHelp")}</p>
          </div>
          <p id="transaction-count" className="month-loading-count">
            <span id="month-loading-status" role="status">
              {error || m("loadingMonth")}
            </span>
          </p>
        </div>
        <div
          className="filter-disclosure month-loading-filter"
          aria-hidden="true"
        >
          <div className="filter-disclosure-trigger">
            <span className="filter-disclosure-icon" aria-hidden="true">
              <SlidersHorizontal size={17} strokeWidth={2} />
            </span>
            <span className="filter-disclosure-label">
              {m("filterTransactions")}
            </span>
            <span className="filter-disclosure-meta">{m("filterHint")}</span>
          </div>
        </div>
        {error ? (
          <div id="month-loading-error" className="month-loading-error" role="alert">
            <p>{error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw size={17} aria-hidden="true" />
              {m("tryAgain")}
            </Button>
          </div>
        ) : (
          <div id="transaction-list-region" className="month-loading-list" aria-hidden="true">
            <ul className="transaction-list">
              <li className="transaction-day-group">
                <div className="transaction-day-heading">
                  <span className="month-loading-placeholder month-loading-day" />
                  <span className="month-loading-placeholder month-loading-day-count" />
                </div>
                <ul className="transaction-day-list">
                  {["first", "second"].map((key) => (
                    <li className="transaction-item" key={key}>
                      <div className="transaction-main-button">
                        <div className="transaction-topline">
                          <span className="month-loading-placeholder month-loading-title" />
                          <span className="transaction-inline-meta" aria-hidden="true">
                            <span className="month-loading-placeholder month-loading-tag" />
                            <span className="month-loading-placeholder month-loading-amount" />
                          </span>
                        </div>
                        <div className="transaction-bottomline">
                          <span className="month-loading-placeholder month-loading-category" />
                          <span className="month-loading-placeholder month-loading-secondary" />
                        </div>
                      </div>
                      <div className="transaction-actions">
                        <div className="transaction-meta">
                          <span className="month-loading-placeholder month-loading-tag" />
                          <span className="month-loading-placeholder month-loading-amount" />
                        </div>
                        <span className="month-loading-placeholder month-loading-action" />
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

export function LedgerHome({
  openEntry,
  changeMonth,
  type,
  changeType,
  visibility,
  web = false,
  toggle,
}: {
  openEntry(entry: Entry): void;
  changeMonth(month: string): void;
  type: "all" | "income" | "expense";
  changeType(type: "all" | "income" | "expense"): void;
  visibility: boolean[];
  web?: boolean;
  toggle(index: number): void;
}) {
  const app = useApp();
  const {
    snapshot,
    month,
    locale,
    message: m,
    announce,
    errorMessage,
  } = app;
  const workspace = snapshot.workspace!;
  const summary = snapshot.summary!;
  const setType = changeType;
  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [queryMode, setQueryMode] = useState<LedgerQueryMode>("text");
  const [error, setError] = useState("");
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [transactionDetail, setTransactionDetail] =
    useState<TransactionDetailState | null>(null);
  const [compactActions, setCompactActions] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 520px)").matches,
  );
  const [regexSearch, setRegexSearch] = useState<RegexSearchState>({
    key: "",
    result: null,
    error: "",
    status: "ready",
  });
  const imageRequest = useRef(0);
  const imageUrl = useRef<string | null>(null);
  const searchWorker = useRef<Worker | null>(null);
  const searchRequest = useRef(0);
  const lastReadyMonth = useRef(month);
  const lastReadyResult = useRef<LedgerQueryResult | null>(null);
  const mutation = useLocalWrite();
  const money = (v: string) =>
    formatMoney(locale, v, workspace.currency, workspace.precision);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const update = () => setCompactActions(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const selectedMonthStart = `${month}-01`;
  const selectedMonthEnd = monthEnd(month);
  const monthResult = useMemo(
    () =>
      queryLedger(snapshot.transactions, {
        dateFrom: selectedMonthStart,
        dateTo: selectedMonthEnd,
        type: "all",
        categories: [],
        query: "",
        mode: "text",
      }),
    [selectedMonthEnd, selectedMonthStart, snapshot.transactions],
  );
  const stableResult =
    lastReadyMonth.current === month && lastReadyResult.current !== null
      ? lastReadyResult.current
      : monthResult;
  const categoryOptions = useMemo<FilterCategoryOption[]>(() => {
    const monthTransactionIds = new Set(monthResult.transactionIds);
    const ids = new Set(
      snapshot.transactions
        .filter(
          (transaction) =>
            transaction.deletedAt === null && monthTransactionIds.has(transaction.id),
        )
        .flatMap((transaction) =>
          transaction.splits.map((split) => split.category),
        ),
    );
    for (const id of selectedCategories) ids.add(id);
    const definitions = new Map(
      (snapshot.categories ?? []).map((categoryDefinition) => [
        categoryDefinition.id,
        categoryDefinition,
      ]),
    );
    const groupOrder: Record<FilterCategoryGroup, number> = {
      expense: 0,
      income: 1,
      other: 2,
    };
    return [...ids]
      .filter((id) => id.length > 0)
      .map((id) => {
        const definition = definitions.get(id);
        return {
          id,
          label: filterCategoryLabel(snapshot.categories, id),
          group: filterCategoryGroup(definition),
          position: definition?.position ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .filter(
        (option) =>
          type === "all" ||
          option.group === type ||
          (option.group === "other" && selectedCategories.includes(option.id)),
      )
      .sort(
        (left, right) =>
          groupOrder[left.group] - groupOrder[right.group] ||
          left.position - right.position ||
          left.label.localeCompare(right.label, locale) ||
          left.id.localeCompare(right.id),
      );
  }, [locale, monthResult, selectedCategories, snapshot.categories, snapshot.transactions, type]);
  const queryInputState = useMemo((): QueryInputState => {
    const dateError = (value: string): QueryInputState | null => {
      if (!isLocalDate(value)) {
        return {
          input: null,
          error: t(locale, "filterDateInvalid"),
          field: "date",
        };
      }
      if (value < selectedMonthStart || value > selectedMonthEnd) {
        return {
          input: null,
          error: t(locale, "filterDateOutsideMonth", {
            month: formatMonth(locale, month),
          }),
          field: "date",
        };
      }
      return null;
    };
    if (dateFrom) {
      const errorState = dateError(dateFrom);
      if (errorState !== null) return errorState;
    }
    if (dateTo) {
      const errorState = dateError(dateTo);
      if (errorState !== null) return errorState;
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return {
        input: null,
        error: t(locale, "filterDateRangeInvalid"),
        field: "date",
      };
    }
    if (query.length > MAX_LEDGER_QUERY_LENGTH) {
      return {
        input: null,
        error: t(locale, "filterInvalid"),
        field: "query",
      };
    }
    try {
      const minimumMinor = minimum.trim()
        ? decimalToMinorUnits(minimum, workspace.precision)
        : "";
      const maximumMinor = maximum.trim()
        ? decimalToMinorUnits(maximum, workspace.precision)
        : "";
      if (
        minimumMinor &&
        maximumMinor &&
        parseMinorUnits(minimumMinor) > parseMinorUnits(maximumMinor)
      ) {
        return {
          input: null,
          error: t(locale, "filterAmountRangeInvalid"),
          field: "amount",
        };
      }
      return {
        input: {
          dateFrom: dateFrom || selectedMonthStart,
          dateTo: dateTo || selectedMonthEnd,
          type,
          categories: selectedCategories,
          minimumMinor,
          maximumMinor,
          query,
          mode: queryMode,
        },
        error: "",
      };
    } catch (cause) {
      return {
        input: null,
        error: filterErrorMessage(
          cause,
          (key, params) => t(locale, key, params),
          errorMessage,
        ),
        field: "amount",
      };
    }
  }, [dateFrom, dateTo, errorMessage, locale, maximum, minimum, month, query, queryMode, selectedCategories, selectedMonthEnd, selectedMonthStart, type, workspace.precision]);
  const queryKey = useMemo(
    () =>
      queryInputState.input === null
        ? ""
        : JSON.stringify(queryInputState.input),
    [queryInputState.input],
  );
  const regexQueryActive = queryMode === "regex" && query.trim().length > 0;
  const localQueryState = useMemo<FilterEvaluation>(() => {
    if (queryInputState.input === null) {
      return {
        status: "invalid",
        result: null,
        error: queryInputState.error,
      };
    }
    if (regexQueryActive) {
      return { status: "working", result: null, error: "" };
    }
    try {
      return {
        status: "ready",
        result: queryLedger(snapshot.transactions, queryInputState.input),
        error: "",
      };
    } catch (cause) {
      return {
        status: "invalid",
        result: null,
        error: filterErrorMessage(
          cause,
          (key, params) => t(locale, key, params),
          errorMessage,
        ),
      };
    }
  }, [errorMessage, locale, queryInputState.error, queryInputState.input, regexQueryActive, snapshot.transactions]);
  useEffect(() => {
    searchWorker.current?.terminate();
    searchWorker.current = null;
    const requestId = ++searchRequest.current;
    const input = queryInputState.input;
    const shouldUseWorker = regexQueryActive && input !== null;
    if (!shouldUseWorker || input === null) {
      setRegexSearch({
        key: queryKey,
        result: null,
        error: queryInputState.error,
        status: input === null ? "invalid" : "ready",
      });
      return;
    }
    setRegexSearch({ key: queryKey, result: null, error: "", status: "working" });
    let worker: Worker | null = null;
    let timeoutId: number | undefined;
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL("../search.worker.ts", import.meta.url), {
          type: "module",
        });
      } catch {
        setRegexSearch({
          key: queryKey,
          result: null,
          error: filterErrorMessage(
            new Error("LUNA_ERROR:ledger-query-worker-unavailable"),
            (key, params) => t(locale, key, params),
            errorMessage,
          ),
          status: "failed",
        });
        return;
      }
      searchWorker.current = worker;
      const safeTransactions: LedgerQueryRecord[] = snapshot.transactions.map(
        ({ id, type, amountMinor, date, splits, merchant, paymentMethod, notes, deletedAt }) => ({
          id,
          type,
          amountMinor,
          date,
          splits,
          merchant,
          paymentMethod,
          notes,
          deletedAt,
        }),
      );
      const finish = (next: RegexSearchState) => {
        if (requestId !== searchRequest.current) return;
        worker?.terminate();
        if (searchWorker.current === worker) searchWorker.current = null;
        setRegexSearch(next);
      };
      timeoutId = window.setTimeout(() => {
        finish({
          key: queryKey,
          result: null,
          error: filterErrorMessage(
            new Error("LUNA_ERROR:ledger-query-timeout"),
            (key, params) => t(locale, key, params),
            errorMessage,
          ),
          status: "failed",
        });
      }, 5000);
      worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
        if (event.data.id !== requestId) return;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (event.data.error) {
          const cause = new Error(`LUNA_ERROR:${event.data.error.code}`);
          finish({
            key: queryKey,
            result: null,
            error: filterErrorMessage(
              cause,
              (key, params) => t(locale, key, params),
              errorMessage,
            ),
            status:
              event.data.error.code === "ledger-query-regex-invalid"
                ? "invalid"
                : "failed",
          });
        } else {
          finish({
            key: queryKey,
            result: event.data.result ?? null,
            error: "",
            status: "ready",
          });
        }
      };
      worker.onerror = () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        finish({
          key: queryKey,
          result: null,
          error: filterErrorMessage(
            new Error("LUNA_ERROR:ledger-query-worker-unavailable"),
            (key, params) => t(locale, key, params),
            errorMessage,
          ),
          status: "failed",
        });
      };
      worker.postMessage({ id: requestId, transactions: safeTransactions, input });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      worker?.terminate();
      if (searchWorker.current === worker) searchWorker.current = null;
    };
  }, [errorMessage, locale, queryInputState.error, queryInputState.input, queryKey, regexQueryActive, snapshot.transactions]);
  const filterEvaluation = useMemo<FilterEvaluation>(() => {
    if (queryInputState.input === null) {
      return {
        status: "invalid",
        result: stableResult,
        error: queryInputState.error,
      };
    }
    if (!regexQueryActive) {
      if (localQueryState.status === "ready" && localQueryState.result !== null) {
        return localQueryState;
      }
      return {
        status: localQueryState.status,
        result: stableResult,
        error: localQueryState.error,
      };
    }
    if (regexSearch.key !== queryKey || regexSearch.status === "working") {
      return { status: "working", result: stableResult, error: "" };
    }
    if (regexSearch.result !== null && regexSearch.status === "ready") {
      return {
        status: "ready",
        result: regexSearch.result,
        error: "",
      };
    }
    return {
      status: regexSearch.status,
      result: stableResult,
      error: regexSearch.error,
    };
  }, [localQueryState, queryInputState.error, queryInputState.input, queryKey, regexQueryActive, regexSearch, stableResult]);
  useEffect(() => {
    if (lastReadyMonth.current !== month) {
      lastReadyMonth.current = month;
      lastReadyResult.current =
        filterEvaluation.status === "ready" && filterEvaluation.result !== null
          ? filterEvaluation.result
          : monthResult;
      return;
    }
    if (filterEvaluation.status === "ready" && filterEvaluation.result !== null) {
      lastReadyResult.current = filterEvaluation.result;
    }
  }, [filterEvaluation, month, monthResult]);
  const filtered = useMemo(() => {
    const ids = new Set(filterEvaluation.result?.transactionIds ?? []);
    return snapshot.transactions.filter((transaction) => ids.has(transaction.id));
  }, [filterEvaluation.result, snapshot.transactions]);
  const transactionGroups = useMemo(() => {
    const groups: { date: string; transactions: Transaction[] }[] = [];
    const byDate = new Map<string, { date: string; transactions: Transaction[] }>();
    const ordered = [...filtered].sort(
      (left, right) =>
        right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
    );
    for (const transaction of ordered) {
      let group = byDate.get(transaction.date);
      if (group === undefined) {
        group = { date: transaction.date, transactions: [] };
        byDate.set(transaction.date, group);
        groups.push(group);
      }
      group.transactions.push(transaction);
    }
    return groups;
  }, [filtered]);
  const detailTransaction =
    transactionDetail === null
      ? null
      : snapshot.transactions.find(
          (transaction) => transaction.id === transactionDetail.transaction.id,
        ) ?? transactionDetail.transaction;
  const monthTransactionCount = monthResult.count;
  const expenseCount = queryLedger(snapshot.transactions, {
    dateFrom: selectedMonthStart,
    dateTo: selectedMonthEnd,
    type: "expense",
    categories: [],
    query: "",
    mode: "text",
  }).count;
  const any = monthTransactionCount > 0;
  const filterChips: { id: string; label: string; remove(): void }[] = [
    ...(type === "all"
      ? []
      : [
          {
            id: "type",
            label: `${m("type")}: ${m(type === "income" ? "income" : "spending")}`,
            remove: () => setType("all"),
          },
        ]),
    ...selectedCategories.map((value) => ({
      id: `category-${value}`,
      label: `${m("category")}: ${filterCategoryLabel(snapshot.categories, value)}`,
      remove: () =>
        setSelectedCategories((current) =>
          current.filter((item) => item !== value),
        ),
    })),
    ...(query.trim()
      ? [{ id: "query", label: `${m("searchLabel")}: ${query.trim()}`, remove: () => setQuery("") }]
      : []),
    ...(dateFrom
      ? [
          {
            id: "date-from",
            label: `${m("startDate")}: ${filterDateLabel(locale, dateFrom)}`,
            remove: () => setDateFrom(""),
          },
        ]
      : []),
    ...(dateTo
      ? [
          {
            id: "date-to",
            label: `${m("endDate")}: ${filterDateLabel(locale, dateTo)}`,
            remove: () => setDateTo(""),
          },
        ]
      : []),
    ...(minimum.trim()
      ? [
          {
            id: "minimum",
            label: `${m("minimumAmount")}: ≥ ${minimum.trim()}`,
            remove: () => setMinimum(""),
          },
        ]
      : []),
    ...(maximum.trim()
      ? [
          {
            id: "maximum",
            label: `${m("maximumAmount")}: ≤ ${maximum.trim()}`,
            remove: () => setMaximum(""),
          },
        ]
      : []),
  ];
  const activeFilterCount = [
    type !== "all",
    selectedCategories.length > 0,
    query.trim().length > 0,
    dateFrom.length > 0,
    dateTo.length > 0,
    minimum.trim().length > 0,
    maximum.trim().length > 0,
  ].filter(Boolean).length;
  const hasActiveQuery = activeFilterCount > 0;
  const revokeImageUrl = () => {
    if (imageUrl.current !== null) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
  };
  useEffect(
    () => () => {
      imageRequest.current += 1;
      revokeImageUrl();
    },
    [],
  );
  function closeImageViewer() {
    const returnFocus = imageViewer?.returnFocus;
    imageRequest.current += 1;
    revokeImageUrl();
    setImageViewer(null);
    if (returnFocus !== undefined)
      queueMicrotask(() => document.getElementById(returnFocus)?.focus());
  }
  function openTransactionDetail(transaction: Transaction) {
    setTransactionDetail({
      transaction,
      returnFocus: `transaction-details-${transaction.id}`,
    });
  }
  function closeTransactionDetail(fallback = "transactions-title") {
    const returnFocus = transactionDetail?.returnFocus ?? fallback;
    setTransactionDetail(null);
    queueMicrotask(() => {
      (
        document.getElementById(returnFocus) ?? document.getElementById(fallback)
      )?.focus();
    });
  }
  function editTransactionFromDetail(transaction: Transaction) {
    setTransactionDetail(null);
    queueMicrotask(() =>
      openEntry({
        type: transaction.type,
        transaction,
        returnFocus: `edit-transaction-${transaction.id}`,
      }),
    );
  }
  async function openImageViewer(
    transactionId: string,
    title: string,
    attachments: readonly NonNullable<Transaction["attachments"]>[number][],
    index: number,
    returnFocus: string,
  ) {
    const metadata = attachments[index];
    if (metadata === undefined) return;
    const request = ++imageRequest.current;
    revokeImageUrl();
    setImageViewer({ transactionId, attachmentId: metadata.id, title, returnFocus, attachments, index, metadata, loading: true });
    try {
      const result = await scopedRead(app.scope, () =>
        window.lunaLedger.readTransactionImage(transactionId, metadata.id),
      );
      if (request !== imageRequest.current) {
        result.bytes.fill(0);
        return;
      }
      const url = URL.createObjectURL(new Blob([Uint8Array.from(result.bytes)], { type: result.mime }));
      result.bytes.fill(0);
      imageUrl.current = url;
      setImageViewer((current) =>
        current === null || request !== imageRequest.current
          ? current
          : { ...current, url, loading: false },
      );
    } catch (cause) {
      if (request === imageRequest.current)
        setImageViewer((current) =>
          current === null ? current : { ...current, loading: false, error: app.errorMessage(cause) },
        );
    }
  }
  const start = (type: "income" | "expense", id: string) =>
    openEntry({ type, returnFocus: id });
  const summaries: {
    key: string;
    id: string;
    label: MessageKey;
    value: string;
    show: MessageKey;
    hide: MessageKey;
    foot: string;
    className: string;
  }[] = [
    {
      key: "income",
      id: "income",
      label: "income",
      value: summary.totalIncomeMinor,
      show: "showIncomeAmount",
      hide: "hideIncomeAmount",
      foot: m("recordedThisMonth"),
      className: "income",
    },
    {
      key: "spending",
      id: "expense",
      label: "spending",
      value: summary.totalExpenseMinor,
      show: "showSpendingAmount",
      hide: "hideSpendingAmount",
      foot: m("expenseCount", {
        count: expenseCount,
      }),
      className: "expense",
    },
    {
      key: "netFlow",
      id: "net",
      label: "netFlow",
      value: summary.netFlowMinor,
      show: "showNetFlowAmount",
      hide: "hideNetFlowAmount",
      foot: m("incomeMinusSpending"),
      className: "net",
    },
  ];
  async function remove(tx: Transaction): Promise<boolean> {
    if (!window.confirm(m("deleteConfirm"))) return false;
    setError("");
    try {
      const fresh = await mutation.mutateAsync({
        write: () => window.lunaLedger.deleteTransaction(tx.id, tx.revision),
        saved: () => {},
      });
      if (fresh) announce(m("transactionDeleted"));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }
  return (
    <>
      <section
        className="page-heading dashboard-hero"
        aria-labelledby="page-title"
      >
        <div className="page-heading-copy">
          <span className="kicker">{m("ledgerKicker")}</span>
          <h1 id="page-title">{m("dashboardTitle")}</h1>
          <p>
            {!web && <><span id="workspace-name-label">{workspace.name}</span> · </>}
            <span id="month-label">{formatMonth(locale, month)}</span>
          </p>
          <p className="hero-description">{m("ledgerIntro")}</p>
        </div>
        <div className="page-heading-actions">
          {!web && (
            <div
              className="entry-actions"
              role="group"
              aria-label={m("quickEntryType")}
            >
              {(["expense", "income"] as const).map((type) => (
                <Button
                  key={type}
                  id={`record-${type}`}
                  className={`entry-button ${type}`}
                  onClick={() => start(type, `record-${type}`)}
                >
                  {m(type === "expense" ? "recordExpense" : "recordIncome")}
                </Button>
              ))}
            </div>
          )}
          <MonthControls
            month={month}
            locale={locale}
            message={m}
            changeMonth={changeMonth}
            web={web}
          />
          {web && (
            <button
              id="primary-record"
              type="button"
              className="primary-record-button"
              onClick={() =>
                openEntry({ type: "expense", returnFocus: "primary-record" })
              }
            >
              <span className="primary-record-icon">
                <Plus size={21} strokeWidth={2.3} aria-hidden="true" />
              </span>
              <span>{m("addTransaction")}</span>
            </button>
          )}
        </div>
      </section>
      <p
        id="ledger-conflict-notice"
        className="global-alert"
        role="status"
        hidden={!snapshot.conflictCount}
      >
        {snapshot.conflictCount
          ? m("ledgerConflictNotice", { count: snapshot.conflictCount })
          : ""}
      </p>
      <section
        id="summary-grid"
        className={`summary-grid ${visibility.every((v) => !v) ? "is-collapsed" : ""}`}
        data-summary-state={
          visibility.every((v) => !v) ? "collapsed" : "expanded"
        }
        aria-label={m("monthlySummary")}
      >
        {summaries.map((s, i) => (
          <article
            key={s.key}
            className={`summary-card ${s.className}${visibility[i] ? "" : " is-collapsed"}`}
          >
            <div className="summary-card-heading">
              <span className="eyebrow">{m(s.label)}</span>
              <Button
                id={`toggle-${s.id}-amounts`}
                variant="ghost"
                className="summary-visibility-toggle"
                data-summary-visibility-toggle={s.key}
                aria-label={m(visibility[i] ? s.hide : s.show)}
                aria-pressed={!!visibility[i]}
                onClick={() => toggle(i)}
              >
                <Eye className="eye-icon" aria-hidden="true" />
              </Button>
            </div>
            <strong
              id={`${s.id}-total`}
              className="metric sensitive-money"
              aria-label={visibility[i] ? undefined : m("hiddenAmount")}
            >
              {visibility[i] ? money(s.value) : "••••"}
            </strong>
            <span
              className="subtext"
              id={s.id === "expense" ? "expense-count" : undefined}
            >
              {s.foot}
            </span>
          </article>
        ))}
      </section>
      <section
        className="panel transactions-panel"
        aria-labelledby="transactions-title"
      >
        <div className="section-heading">
          <div>
            <h2 id="transactions-title" tabIndex={-1}>
              {m("recentLedger")}
            </h2>
            <p>{m("recentLedgerHelp")}</p>
          </div>
          <p id="transaction-count" role="status">
            {filterEvaluation.status === "ready"
              ? m("shownCount", {
                  shown: filtered.length,
                  total: monthTransactionCount,
                })
              : m("filterResultsNotUpdated")}
          </p>
        </div>
        <details
          id="filter-details"
          className="filter-disclosure"
          data-filter-state={hasActiveQuery ? "active" : "idle"}
        >
          <summary className="filter-disclosure-trigger">
            <span className="filter-disclosure-icon" aria-hidden="true">
              <SlidersHorizontal size={17} strokeWidth={2} />
            </span>
            <span className="filter-disclosure-label">{m("filterTransactions")}</span>
            <span className="filter-disclosure-meta">
              {hasActiveQuery
                ? m(
                    activeFilterCount === 1
                      ? "filterActiveSingular"
                      : "filterActiveCount",
                    { count: activeFilterCount },
                  )
                : m("filterHint")}
            </span>
          </summary>
          <form
            id="filter-form"
            className="filter-grid"
            aria-label={m("filterTransactions")}
            onSubmit={(e) => e.preventDefault()}
            onReset={() => {
              setType("all");
              setQuery("");
              setSelectedCategories([]);
              setDateFrom("");
              setDateTo("");
              setMinimum("");
              setMaximum("");
              setQueryMode("text");
            }}
          >
            <div className="field filter-type-field">
              <label htmlFor="filter-type">{m("type")}</label>
              <select
                id="filter-type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                <option value="all">{m("allTransactions")}</option>
                <option value="income">{m("income")}</option>
                <option value="expense">{m("spending")}</option>
              </select>
            </div>
            {categoryOptions.length > 0 ? (
              <fieldset className="filter-category-options full">
                <legend>{m("categoryMultiSelect")}</legend>
                <div
                  id="filter-category-options"
                  className="filter-category-groups"
                >
                  {(["expense", "income", "other"] as const).map((group) => {
                    const options = categoryOptions.filter(
                      (option) => option.group === group,
                    );
                    if (options.length === 0) return null;
                    const headingId = `filter-category-group-${group}`;
                    return (
                      <div
                        key={group}
                        className="filter-category-group"
                        role="group"
                        aria-labelledby={headingId}
                      >
                        <h3 id={headingId} className="filter-category-group-title">
                          {filterCategoryGroupLabel(group, m)}
                        </h3>
                        <div className="filter-category-list">
                          {options.map((option) => (
                            <label
                              key={option.id}
                              className="filter-category-option"
                            >
                              <input
                                type="checkbox"
                                value={option.id}
                                checked={selectedCategories.includes(option.id)}
                                onChange={(event) => {
                                  const checked = event.currentTarget.checked;
                                  setSelectedCategories((current) =>
                                    checked
                                      ? [...current, option.id]
                                      : current.filter(
                                          (item) => item !== option.id,
                                        ),
                                  );
                                }}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <p id="filter-category-empty" className="helper filter-category-empty">
                {m("filterCategoryEmpty")}
              </p>
            )}
            <div className="field filter-search-field">
              <label htmlFor="filter-query">{m("searchLabel")}</label>
              <div className="filter-search-control">
                <Input
                  id="filter-query"
                  name="query"
                  aria-describedby="filter-error"
                  aria-invalid={
                    queryInputState.field === "query" ||
                    (regexQueryActive && filterEvaluation.status === "invalid")
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  id="filter-regex"
                  type="button"
                  variant="ghost"
                  className="filter-regex-toggle"
                  aria-label={m(
                    queryMode === "regex" ? "disableRegexSearch" : "enableRegexSearch",
                  )}
                  aria-pressed={queryMode === "regex"}
                  onClick={() =>
                    setQueryMode((mode) => (mode === "regex" ? "text" : "regex"))
                  }
                >
                  <span aria-hidden="true" className="filter-regex-mark">
                    .*
                  </span>
                  <span className="visually-hidden">{m("searchModeRegex")}</span>
                </Button>
              </div>
            </div>
            <Field
              id="filter-date-from"
              label={m("startDate")}
              name="dateFrom"
              type="date"
              min={selectedMonthStart}
              max={selectedMonthEnd}
              aria-describedby="filter-error"
              aria-invalid={queryInputState.field === "date"}
              value={dateFrom}
              data-empty={dateFrom.length === 0}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Field
              id="filter-date-to"
              label={m("endDate")}
              name="dateTo"
              type="date"
              min={selectedMonthStart}
              max={selectedMonthEnd}
              aria-describedby="filter-error"
              aria-invalid={queryInputState.field === "date"}
              value={dateTo}
              data-empty={dateTo.length === 0}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <Field
              id="filter-minimum"
              label={m("minimumAmount")}
              name="minimum"
              inputMode="decimal"
              aria-describedby="filter-error"
              aria-invalid={queryInputState.field === "amount"}
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
            <Field
              id="filter-maximum"
              label={m("maximumAmount")}
              name="maximum"
              inputMode="decimal"
              aria-describedby="filter-error"
              aria-invalid={queryInputState.field === "amount"}
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
            <Button type="reset" variant="outline">
              {m("clearFilters")}
            </Button>
          </form>
        </details>
        {filterChips.length > 0 && (
          <div id="filter-chips" className="filter-chips" aria-label={m("filterTransactions")}>
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="filter-chip"
                onClick={chip.remove}
                aria-label={`${m("clearFilters")}: ${chip.label}`}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        {filterEvaluation.status === "working" && (
          <p id="filter-search-status" className="helper" role="status">
            {m("filterWorking")} {m("filterResultsNotUpdated")}
          </p>
        )}
        <p
          id="filter-error"
          className="form-alert"
          role="alert"
          hidden={!error && !filterEvaluation.error}
        >
          {error || filterEvaluation.error}
        </p>
        {filterEvaluation.status !== "ready" && filterEvaluation.error && (
          <p className="helper filter-error-help">{m("filterErrorHelp")}</p>
        )}
        {hasActiveQuery &&
          filterEvaluation.status === "ready" &&
          filterEvaluation.result && (
          <p id="filter-result-summary" className="filter-result-summary">
            {m("shownCount", {
              shown: filterEvaluation.result.count,
              total: monthTransactionCount,
            })} {" · "}
            {m("categoryTotals", {
              spending: money(filterEvaluation.result.totalExpenseMinor),
              income: money(filterEvaluation.result.totalIncomeMinor),
            })}
          </p>
        )}
        <div
          id="transaction-list-region"
          data-filter-evaluation={filterEvaluation.status}
        >
          {filterEvaluation.status !== "ready" && filtered.length === 0 ? (
            <div className="empty-state filter-stable-state">
              <h3>{m("filterResultsNotUpdated")}</h3>
              <p>{m("filterErrorHelp")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <h3>{m(any ? "noFilterMatches" : "emptyLedgerTitle")}</h3>
              <p>{m(any ? "noFilterMatchesHelp" : "emptyLedgerHelp")}</p>
              {!any && !web && (
                <div className="entry-actions empty-entry-actions">
                  {(["expense", "income"] as const).map((type) => (
                    <Button
                      key={type}
                      id={`empty-record-${type}`}
                      className={`entry-button ${type}`}
                      onClick={() => start(type, `empty-record-${type}`)}
                    >
                      {m(type === "expense" ? "recordExpense" : "recordIncome")}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <ul className="transaction-list">
              {transactionGroups.map((group) => (
                <li className="transaction-day-group" key={group.date}>
                  <div className="transaction-day-heading">
                    <h3>{formatDate(locale, group.date)}</h3>
                    <span>{m("dayRecordCount", { count: group.transactions.length })}</span>
                  </div>
                  <ul className="transaction-day-list">
                    {group.transactions.map((tx) => {
                      const title = transactionTitle(tx, snapshot.categories);
                      return (
                        <li className="transaction-item" key={tx.id}>
                          <button
                            id={`transaction-details-${tx.id}`}
                            type="button"
                            className="transaction-main-button"
                            aria-label={`${m("transactionDetails")}: ${title} · ${money(tx.amountMinor)} · ${formatDate(locale, tx.date)}`}
                            onClick={() => openTransactionDetail(tx)}
                          >
                            <div className="transaction-topline">
                              <strong>{title}</strong>
                              <span className="transaction-inline-meta" aria-hidden="true">
                                <span className={`tag ${tx.type}`}>
                                  {m(tx.type === "income" ? "income" : "spending")}
                                </span>
                                <span className={`transaction-amount ${tx.type}`}>
                                  {money(tx.amountMinor)}
                                </span>
                              </span>
                            </div>
                            <div className="transaction-bottomline">
                              <span>{labelCategories(snapshot.categories, tx.splits.map((s) => s.category))}</span>
                              <span className="transaction-secondary-text">
                                {[tx.paymentMethod, tx.notes]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                          </button>
                          <div className="transaction-actions">
                            <div className="transaction-meta">
                              <span className={`tag ${tx.type}`}>
                                {m(tx.type === "income" ? "income" : "spending")}
                              </span>
                              <span className={`transaction-amount ${tx.type}`}>
                                {money(tx.amountMinor)}
                              </span>
                            </div>
                            <details className="transaction-actions-disclosure" open={!compactActions}>
                              <summary className="transaction-actions-trigger" aria-label={m("openMenu")}>
                                <MoreHorizontal size={20} aria-hidden="true" />
                              </summary>
                              <div className="transaction-actions-menu">
                                {tx.attachments && tx.attachments.length > 0 && (
                                  <Button
                                    id={`view-images-${tx.id}`}
                                    type="button"
                                    variant="ghost"
                                    className="transaction-image-button"
                                    aria-label={m("viewImages", { count: tx.attachments.length })}
                                    onClick={() => {
                                      const first = tx.attachments?.[0];
                                      if (first !== undefined)
                                        void openImageViewer(
                                          tx.id,
                                          title,
                                          [...(tx.attachments ?? [])],
                                          0,
                                          `view-images-${tx.id}`,
                                        );
                                    }}
                                  >
                                    <Images size={18} aria-hidden="true" />
                                    <span>{tx.attachments.length}</span>
                                  </Button>
                                )}
                                <Button
                                  id={`edit-transaction-${tx.id}`}
                                  variant="ghost"
                                  className="text-button"
                                  aria-label={m("editRecordLabel", { name: title })}
                                  onClick={() =>
                                    openEntry({
                                      type: tx.type,
                                      transaction: tx,
                                      returnFocus: `edit-transaction-${tx.id}`,
                                    })
                                  }
                                >
                                  <Pencil size={18} aria-hidden="true" />
                                  <span className="transaction-action-label">{m("edit")}</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="danger-button"
                                  disabled={mutation.isPending}
                                  aria-label={m("deleteRecordLabel", { name: title })}
                                  onClick={() => void remove(tx)}
                                >
                                  <Trash2 size={18} aria-hidden="true" />
                                  <span className="transaction-action-label">{m("delete")}</span>
                                </Button>
                              </div>
                            </details>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Dialog
        open={transactionDetail !== null}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
      >
        <DialogContent
          active={transactionDetail !== null}
          id="transaction-detail-dialog"
          aria-labelledby="transaction-detail-title"
          aria-describedby="transaction-detail-description"
          className="luna-dialog transaction-detail-dialog"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            closeTransactionDetail();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          {detailTransaction && (
            <>
              <header className="dialog-header">
                <div>
                  <span className="kicker">{m("recentLedger")}</span>
                  <DialogTitle id="transaction-detail-title">
                    {m("transactionDetails")}
                  </DialogTitle>
                  <DialogDescription id="transaction-detail-description">
                    {transactionTitle(detailTransaction, snapshot.categories)}
                  </DialogDescription>
                </div>
                <Button
                  id="close-transaction-detail"
                  type="button"
                  variant="outline"
                  onClick={() => closeTransactionDetail()}
                >
                  {m("closeMenu")}
                </Button>
              </header>
              <dl className="transaction-detail-grid">
                <div>
                  <dt>{m("amount")}</dt>
                  <dd className={`transaction-detail-amount ${detailTransaction.type}`}>
                    {money(detailTransaction.amountMinor)}
                  </dd>
                </div>
                <div>
                  <dt>{m("date")}</dt>
                  <dd>{formatDate(locale, detailTransaction.date)}</dd>
                </div>
                <div className="full">
                  <dt>{m("category")}</dt>
                  <dd>
                    {detailTransaction.splits
                      .map((split) => `${labelCategory(snapshot.categories, split.category)} · ${money(split.amountMinor)}`)
                      .join(" / ")}
                  </dd>
                </div>
                {detailTransaction.merchant && (
                  <div>
                    <dt>{m("merchant")}</dt>
                    <dd>{detailTransaction.merchant}</dd>
                  </div>
                )}
                {detailTransaction.paymentMethod && (
                  <div>
                    <dt>{m("paymentMethod")}</dt>
                    <dd>{detailTransaction.paymentMethod}</dd>
                  </div>
                )}
                <div id="transaction-detail-notes" className="full">
                  <dt>{m("notes")}</dt>
                  <dd className="transaction-detail-notes">
                    {detailTransaction.notes || m("emptyValue")}
                  </dd>
                </div>
              </dl>
              {detailTransaction.attachments && detailTransaction.attachments.length > 0 && (
                <div className="transaction-detail-attachments">
                  <Button
                    id="transaction-detail-images"
                    type="button"
                    variant="outline"
                    aria-label={m("viewImages", { count: detailTransaction.attachments.length })}
                    onClick={() =>
                      void openImageViewer(
                        detailTransaction.id,
                        transactionTitle(detailTransaction, snapshot.categories),
                        [...detailTransaction.attachments!],
                        0,
                        "transaction-detail-images",
                      )
                    }
                  >
                    <Images size={18} aria-hidden="true" />
                    {m("viewImages", { count: detailTransaction.attachments.length })}
                  </Button>
                </div>
              )}
              <div className="transaction-detail-actions">
                <Button
                  id="transaction-detail-edit"
                  type="button"
                  variant="outline"
                  onClick={() => editTransactionFromDetail(detailTransaction)}
                >
                  <Pencil size={18} aria-hidden="true" />
                  {m("edit")}
                </Button>
                <Button
                  id="transaction-detail-delete"
                  type="button"
                  variant="ghost"
                  className="danger-button"
                  disabled={mutation.isPending}
                  onClick={() =>
                    void remove(detailTransaction).then((removed) => {
                      if (removed) closeTransactionDetail("transactions-title");
                    })
                  }
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {m("delete")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={imageViewer !== null}
        onOpenChange={(open) => {
          if (!open) closeImageViewer();
        }}
      >
        <DialogContent
          active={imageViewer !== null}
          id="transaction-image-dialog"
          aria-labelledby="transaction-image-dialog-title"
          className="luna-dialog transaction-image-dialog"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            closeImageViewer();
          }}
        >
          {imageViewer && (
            <>
              <header className="dialog-header">
                <div>
                  <DialogTitle id="transaction-image-dialog-title">
                    {m("transactionImagesTitle")}
                  </DialogTitle>
                  <DialogDescription>{imageViewer.title}</DialogDescription>
                </div>
                <Button type="button" variant="outline" onClick={closeImageViewer}>
                  {m("closeImage")}
                </Button>
              </header>
              <div className="transaction-image-viewer" aria-live="polite">
                {imageViewer.loading ? (
                  <p className="helper">{m("imageLoading")}</p>
                ) : imageViewer.error ? (
                  <div className="empty-state">
                    <p>{m("imageUnavailable")}</p>
                    <p className="form-alert" role="alert">{imageViewer.error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void openImageViewer(
                          imageViewer.transactionId,
                          imageViewer.title,
                          imageViewer.attachments,
                          imageViewer.index,
                          imageViewer.returnFocus,
                        )
                      }
                    >
                      <RefreshCw size={17} aria-hidden="true" />
                      {m("retryImage")}
                    </Button>
                  </div>
                ) : imageViewer.url ? (
                  <img
                    src={imageViewer.url}
                    alt={`${imageViewer.title} · ${m("attachments")}`}
                    width={imageViewer.metadata.width}
                    height={imageViewer.metadata.height}
                  />
                ) : null}
              </div>
              {imageViewer.attachments.length > 1 && (
                <div className="transaction-image-tabs" role="group" aria-label={m("attachments")}>
                  {imageViewer.attachments.map((attachment, index) => (
                    <Button
                      key={attachment.id}
                      type="button"
                      variant={index === imageViewer.index ? "secondary" : "outline"}
                      aria-current={index === imageViewer.index ? "true" : undefined}
                      aria-label={`${m("attachments")} ${index + 1}`}
                      onClick={() =>
                        void openImageViewer(
                          imageViewer.transactionId,
                          imageViewer.title,
                          imageViewer.attachments,
                          index,
                          imageViewer.returnFocus,
                        )
                      }
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function monthEnd(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${day.toString().padStart(2, "0")}`;
}

function transactionTitle(
  transaction: Transaction,
  categories?: readonly import("../../shared/category-catalog").CategoryDefinition[],
): string {
  return (
    transaction.merchant.trim() ||
    transaction.notes.trim() ||
    labelCategories(categories, transaction.splits.map((split) => split.category), ", ")
  );
}
