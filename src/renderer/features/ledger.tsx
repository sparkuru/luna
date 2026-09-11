import { useState } from "react";
import { Eye } from "lucide-react";
import {
  filterTransactions,
  nextMonth,
  previousMonth,
  type Transaction,
} from "../../shared/domain";
import { formatDate, formatMoney, formatMonth, type MessageKey } from "../i18n";
import { useApp, useLocalWrite } from "../data/local";
import { Button } from "../components/ui/button";
import { Field } from "../components/form";
import { Input } from "../components/ui/input";
import type { Entry } from "./entry";

export function LedgerHome({
  openEntry,
  changeMonth,
  type,
  changeType,
  visibility,
  toggle,
}: {
  openEntry(entry: Entry): void;
  changeMonth(month: string): void;
  type: "all" | "income" | "expense";
  changeType(type: "all" | "income" | "expense"): void;
  visibility: boolean[];
  toggle(index: number): void;
}) {
  const {
    snapshot,
    month,
    locale,
    message: m,
    announce,
    errorMessage,
  } = useApp();
  const workspace = snapshot.workspace!;
  const summary = snapshot.summary!;
  const setType = changeType;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const mutation = useLocalWrite();
  const money = (v: string) =>
    formatMoney(locale, v, workspace.currency, workspace.precision);
  const filtered = filterTransactions(snapshot.transactions, {
    month,
    type,
    query,
    category,
  });
  const any = snapshot.transactions.some((tx) =>
    tx.date.startsWith(`${month}-`),
  );
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
        count: filterTransactions(snapshot.transactions, {
          month,
          type: "expense",
          query: "",
          category: "",
        }).length,
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
  async function remove(tx: Transaction) {
    if (!window.confirm(m("deleteConfirm"))) return;
    setError("");
    try {
      const fresh = await mutation.mutateAsync({
        write: () => window.lunaLedger.deleteTransaction(tx.id, tx.revision),
        saved: () => {},
      });
      if (fresh) announce(m("transactionDeleted"));
    } catch (e) {
      setError(errorMessage(e));
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
            <span id="workspace-name-label">{workspace.name}</span> ·{" "}
            <span id="month-label">{formatMonth(locale, month)}</span>
          </p>
          <p className="hero-description">{m("ledgerIntro")}</p>
        </div>
        <div className="page-heading-actions">
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
          <div className="month-controls" aria-label={m("monthNavigation")}>
            <Button
              id="previous-month"
              variant="outline"
              onClick={() => changeMonth(previousMonth(month))}
            >
              {m("previousMonth")}
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
              onClick={() => changeMonth(nextMonth(month))}
            >
              {m("nextMonth")}
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
            <h2 id="transactions-title">{m("recentLedger")}</h2>
            <p>{m("recentLedgerHelp")}</p>
          </div>
          <p id="transaction-count">
            {m("shownCount", {
              shown: filtered.length,
              total: summary.transactionCount,
            })}
          </p>
        </div>
        <details id="filter-details" className="filter-disclosure">
          <summary>
            <span>{m("filterTransactions")}</span>
            <span className="helper">{m("filterHint")}</span>
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
            <Field
              id="filter-query"
              label={m("searchLabel")}
              name="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button type="reset" variant="outline">
              {m("clearFilters")}
            </Button>
          </form>
        </details>
        <p className="form-alert" role="alert">
          {error}
        </p>
        <div id="transaction-list-region">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <h3>{m(any ? "noFilterMatches" : "emptyLedgerTitle")}</h3>
              <p>{m(any ? "noFilterMatchesHelp" : "emptyLedgerHelp")}</p>
              {!any && (
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
              {filtered.map((tx) => {
                const title =
                  tx.merchant || tx.splits.map((s) => s.category).join(", ");
                return (
                  <li className="transaction-item" key={tx.id}>
                    <div>
                      <div className="transaction-topline">
                        <strong>{title}</strong>
                        <span className={`tag ${tx.type}`}>
                          {m(tx.type === "income" ? "income" : "spending")}
                        </span>
                      </div>
                      <div className="transaction-bottomline">
                        <span className="transaction-date">
                          {formatDate(locale, tx.date)}
                        </span>
                        <span>
                          {tx.splits.map((s) => s.category).join(" · ")}
                        </span>
                        <span>
                          {[tx.paymentMethod, tx.notes]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    </div>
                    <div className="transaction-actions">
                      <span className={`transaction-amount ${tx.type}`}>
                        {money(tx.amountMinor)}
                      </span>
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
                        {m("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="danger-button"
                        disabled={mutation.isPending}
                        aria-label={m("deleteRecordLabel", { name: title })}
                        onClick={() => void remove(tx)}
                      >
                        {m("delete")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
