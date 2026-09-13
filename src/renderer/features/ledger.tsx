import { useEffect, useMemo, useRef, useState } from "react";
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
  nextMonth,
  previousMonth,
  type Transaction,
} from "../../shared/domain";
import {
  queryLedger,
  type LedgerQueryInput,
  type LedgerQueryMode,
  type LedgerQueryRecord,
  type LedgerQueryResult,
} from "../../shared/ledger-query";
import { formatDate, formatMoney, formatMonth, type MessageKey } from "../i18n";
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
  working: boolean;
};

type SearchWorkerResponse = {
  id: number;
  result?: LedgerQueryResult;
  error?: { code: string };
};

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
  return (
    <section className="panel month-loading-state" aria-labelledby="month-loading-title">
      <div className="month-loading-header">
        <div>
          <span className="kicker">{m("ledgerKicker")}</span>
          <h1 id="month-loading-title">{formatMonth(locale, month)}</h1>
          <p>{error || m("loadingMonth")}</p>
        </div>
        <div className="month-controls month-navigator" aria-label={m("monthNavigation")}>
          <Button
            id="previous-month"
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
            variant="outline"
            aria-label={m("nextMonth")}
            onClick={() => changeMonth(nextMonth(month))}
          >
            <span className="month-control-label">{m("nextMonth")}</span>
            <ChevronRight className="month-control-icon" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error ? (
        <div className="month-loading-error" role="alert">
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw size={17} aria-hidden="true" />
            {m("tryAgain")}
          </Button>
        </div>
      ) : (
        <div className="month-loading-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
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
  const [category, setCategory] = useState("");
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
    working: false,
  });
  const imageRequest = useRef(0);
  const imageUrl = useRef<string | null>(null);
  const searchWorker = useRef<Worker | null>(null);
  const searchRequest = useRef(0);
  const mutation = useLocalWrite();
  const money = (v: string) =>
    formatMoney(locale, v, workspace.currency, workspace.precision);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const update = () => setCompactActions(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const availableCategories = useMemo(
    () =>
      [
        ...new Set(
          snapshot.transactions.flatMap((tx) =>
            tx.splits.map((split) => split.category),
          ),
        ),
      ]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, locale)),
    [locale, snapshot.transactions],
  );
  const selectedMonthStart = `${month}-01`;
  const selectedMonthEnd = monthEnd(month);
  const effectiveDateFrom =
    dateFrom && dateFrom > selectedMonthStart ? dateFrom : selectedMonthStart;
  const effectiveDateTo =
    dateTo && dateTo < selectedMonthEnd ? dateTo : selectedMonthEnd;
  const queryInputState = useMemo((): { input: LedgerQueryInput | null; error: string } => {
    try {
      return {
        input: {
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          type,
          categories: [...selectedCategories, ...category.split(",")],
          minimumMinor: minimum.trim()
            ? decimalToMinorUnits(minimum, workspace.precision)
            : "",
          maximumMinor: maximum.trim()
            ? decimalToMinorUnits(maximum, workspace.precision)
            : "",
          query,
          mode: queryMode,
        },
        error: "",
      };
    } catch (cause) {
      return { input: null, error: errorMessage(cause) };
    }
  }, [category, effectiveDateFrom, effectiveDateTo, errorMessage, maximum, minimum, query, queryMode, selectedCategories, type, workspace.precision]);
  const queryKey = useMemo(
    () =>
      queryInputState.input === null
        ? ""
        : JSON.stringify(queryInputState.input),
    [queryInputState.input],
  );
  const regexQueryActive = queryMode === "regex" && query.trim().length > 0;
  const localQueryState = useMemo(() => {
    if (queryInputState.input === null || regexQueryActive)
      return { result: null as LedgerQueryResult | null, error: "" };
    try {
      return {
        result: queryLedger(snapshot.transactions, queryInputState.input),
        error: "",
      };
    } catch (cause) {
      return { result: null, error: errorMessage(cause) };
    }
  }, [errorMessage, queryInputState.input, regexQueryActive, snapshot.transactions]);
  useEffect(() => {
    searchWorker.current?.terminate();
    searchWorker.current = null;
    const requestId = ++searchRequest.current;
    const input = queryInputState.input;
    const shouldUseWorker = regexQueryActive && input !== null;
    if (!shouldUseWorker || input === null) {
      setRegexSearch({ key: queryKey, result: null, error: "", working: false });
      return;
    }
    setRegexSearch({ key: queryKey, result: null, error: "", working: true });
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
          error: errorMessage(new Error("LUNA_ERROR:ledger-query-worker-unavailable")),
          working: false,
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
          error: errorMessage(new Error("LUNA_ERROR:ledger-query-timeout")),
          working: false,
        });
      }, 5000);
      worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
        if (event.data.id !== requestId) return;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (event.data.error) {
          finish({
            key: queryKey,
            result: null,
            error: errorMessage(new Error(`LUNA_ERROR:${event.data.error.code}`)),
            working: false,
          });
        } else {
          finish({
            key: queryKey,
            result: event.data.result ?? null,
            error: "",
            working: false,
          });
        }
      };
      worker.onerror = () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        finish({
          key: queryKey,
          result: null,
          error: errorMessage(new Error("LUNA_ERROR:ledger-query-worker-unavailable")),
          working: false,
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
  }, [errorMessage, locale, queryInputState.input, queryKey, regexQueryActive, snapshot.transactions]);
  const queryState = useMemo(() => {
    const useWorker = regexQueryActive && queryInputState.input !== null;
    const result = useWorker
      ? regexSearch.key === queryKey
        ? regexSearch.result
        : null
      : localQueryState.result;
    const queryError = useWorker ? regexSearch.error : localQueryState.error;
    if (result === null)
      return {
        transactions: [] as readonly Transaction[],
        result: null,
        error: queryInputState.error || queryError,
      };
    const ids = new Set(result.transactionIds);
    return {
      transactions: snapshot.transactions.filter((transaction) => ids.has(transaction.id)),
      result,
      error: queryInputState.error || queryError,
    };
  }, [localQueryState.error, localQueryState.result, queryInputState.error, queryInputState.input, queryKey, regexQueryActive, regexSearch, snapshot.transactions]);
  const filtered = queryState.transactions;
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
  const monthTransactionCount = queryLedger(snapshot.transactions, {
    dateFrom: selectedMonthStart,
    dateTo: selectedMonthEnd,
    type: "all",
    categories: [],
    query: "",
    mode: "text",
  }).count;
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
      : [{ id: "type", label: `${m("type")}: ${m(type === "income" ? "income" : "spending")}`, remove: () => setType("all") }]),
    ...selectedCategories.map((value) => ({
      id: `category-${value}`,
      label: `${m("category")}: ${value}`,
      remove: () => setSelectedCategories((current) => current.filter((item) => item !== value)),
    })),
    ...(category.trim()
      ? [{ id: "category-text", label: `${m("category")}: ${category.trim()}`, remove: () => setCategory("") }]
      : []),
    ...(query.trim()
      ? [{ id: "query", label: `${m("searchLabel")}: ${query.trim()}`, remove: () => setQuery("") }]
      : []),
    ...(dateFrom
      ? [{ id: "date-from", label: `${m("date")}: ${dateFrom}`, remove: () => setDateFrom("") }]
      : []),
    ...(dateTo
      ? [{ id: "date-to", label: `${m("selectedMonth")}: ${dateTo}`, remove: () => setDateTo("") }]
      : []),
    ...(minimum.trim()
      ? [{ id: "minimum", label: `${m("amount")}: ≥ ${minimum.trim()}`, remove: () => setMinimum("") }]
      : []),
    ...(maximum.trim()
      ? [{ id: "maximum", label: `${m("amount")}: ≤ ${maximum.trim()}`, remove: () => setMaximum("") }]
      : []),
  ];
  const hasActiveQuery =
    type !== "all" ||
    selectedCategories.length > 0 ||
    category.trim().length > 0 ||
    query.trim().length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    minimum.trim().length > 0 ||
    maximum.trim().length > 0;
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
          <div className="month-controls month-navigator" aria-label={m("monthNavigation")}>
            <Button
              id="previous-month"
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
              onChange={(e) => {
                if (e.target.value) changeMonth(e.target.value);
              }}
            />
            <Button
              id="next-month"
              variant="outline"
              aria-label={m("nextMonth")}
              onClick={() => changeMonth(nextMonth(month))}
            >
              <span className="month-control-label">{m("nextMonth")}</span>
              <ChevronRight className="month-control-icon" aria-hidden="true" />
            </Button>
          </div>
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
          <p id="transaction-count">
            {m("shownCount", {
              shown: filtered.length,
              total: monthTransactionCount,
            })}
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
            <span className="filter-disclosure-meta">{m("filterHint")}</span>
          </summary>
          <form
            id="filter-form"
            className="filter-grid"
            aria-label={m("filterTransactions")}
            onSubmit={(e) => e.preventDefault()}
            onReset={() => {
              setType("all");
              setQuery("");
              setCategory("");
              setSelectedCategories([]);
              setDateFrom("");
              setDateTo("");
              setMinimum("");
              setMaximum("");
              setQueryMode("text");
            }}
          >
            <div className="field">
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
            <Field
              id="filter-category"
              label={m("category")}
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            {availableCategories.length > 0 && (
              <fieldset className="filter-category-options full">
                <legend>{m("categoryMultiSelect")}</legend>
                <div id="filter-category-options" className="filter-category-list">
                  {availableCategories.map((value) => (
                    <label key={value} className="filter-category-option">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(value)}
                        onChange={(event) =>
                          setSelectedCategories((current) =>
                            event.currentTarget.checked
                              ? [...current, value]
                              : current.filter((item) => item !== value),
                          )
                        }
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Field
              id="filter-query"
              label={m("searchLabel")}
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Field
              id="filter-date-from"
              label={m("date")}
              name="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Field
              id="filter-date-to"
              label={m("selectedMonth")}
              name="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <Field
              id="filter-minimum"
              label={m("amount")}
              name="minimum"
              inputMode="decimal"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
            />
            <Field
              id="filter-maximum"
              label={m("budgetUsed")}
              name="maximum"
              inputMode="decimal"
              value={maximum}
              onChange={(e) => setMaximum(e.target.value)}
            />
            <label className="filter-mode-toggle" htmlFor="filter-regex">
              <input
                id="filter-regex"
                name="regex"
                type="checkbox"
                checked={queryMode === "regex"}
                onChange={(e) => setQueryMode(e.target.checked ? "regex" : "text")}
              />
                <span>{queryMode === "regex" ? m("searchModeRegex") : m("searchModeText")}</span>
            </label>
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
        {regexSearch.working && (
          <p id="filter-search-status" className="helper" role="status">
            {m("regexWorking")}
          </p>
        )}
        <p className="form-alert" role="alert">
          {error || queryState.error}
        </p>
        {hasActiveQuery && queryState.result && (
          <p id="filter-result-summary" className="filter-result-summary">
            {m("shownCount", {
              shown: queryState.result.count,
              total: monthTransactionCount,
            })} {" · "}
            {m("categoryTotals", {
              spending: money(queryState.result.totalExpenseMinor),
              income: money(queryState.result.totalIncomeMinor),
            })}
          </p>
        )}
        <div id="transaction-list-region">
          {filtered.length === 0 ? (
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
                      const title = transactionTitle(tx);
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
                              <span className={`tag ${tx.type}`}>
                                {m(tx.type === "income" ? "income" : "spending")}
                              </span>
                              <span className={`transaction-amount ${tx.type}`}>
                                {money(tx.amountMinor)}
                              </span>
                            </div>
                            <div className="transaction-bottomline">
                              <span>{tx.splits.map((s) => s.category).join(" · ")}</span>
                              <span className="transaction-secondary-text">
                                {[tx.paymentMethod, tx.notes]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </div>
                          </button>
                          <div className="transaction-actions">
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
                    {transactionTitle(detailTransaction)}
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
                      .map((split) => `${split.category} · ${money(split.amountMinor)}`)
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
                        transactionTitle(detailTransaction),
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

function transactionTitle(transaction: Transaction): string {
  return (
    transaction.merchant.trim() ||
    transaction.notes.trim() ||
    transaction.splits.map((split) => split.category).join(", ")
  );
}
