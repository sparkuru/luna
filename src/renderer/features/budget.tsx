import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  decimalToMinorUnits,
  formatMinorMagnitude,
  parseMinorUnits,
  currentLocalDate,
} from "../../shared/domain";
import {
  calculateLedgerStatistics,
  type StatisticsPeriod,
} from "../../shared/ledger-statistics";
import { formatDate, formatMonth, formatMoney } from "../i18n";
import {
  useApp,
  useLocalWrite,
  queryClient,
  snapshotOptions,
} from "../data/local";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { WebMonthPicker } from "../components/month-picker";
import { labelCategories, labelCategory } from "../category-display";
export function BudgetEditor({ web = false, changeMonth }: {
  web?: boolean;
  changeMonth(month: string): void;
}) {
  const app = useApp();
  const { snapshot, month, locale, message: m } = app;
  const workspace = snapshot.workspace!;
  const summary = snapshot.summary!;
  const initial =
    summary.budgetMinor === null
      ? ""
      : formatMinorMagnitude(
          summary.budgetMinor,
          workspace.precision,
        ).replaceAll(",", "");
  const [value, setValue] = useState(initial);
  const observed = useRef([...(snapshot.budgetHeadIds ?? [])]);
  const [error, setError] = useState("");
  const mutation = useLocalWrite();
  const dirty = useRef(false);
  useEffect(() => {
    return () => app.setDirty("budget", false);
  }, []);
  const money = (value: string) =>
    formatMoney(locale, value, workspace.currency, workspace.precision);
  const budget =
    summary.budgetMinor === null ? 0n : parseMinorUnits(summary.budgetMinor);
  const used = parseMinorUnits(summary.budgetUsedMinor);
  const progress =
    budget <= 0n
      ? used > 0n
        ? 100
        : 0
      : Number(((used > budget ? budget : used) * 10000n) / budget) / 100;
  async function save() {
    if (mutation.isPending) return;
    setError("");
    try {
      const amount = value.trim()
        ? decimalToMinorUnits(value, workspace.precision)
        : null;
      const refreshed = await mutation.mutateAsync({
        write: () =>
          window.lunaLedger.setMonthlyBudget(month, amount, [
            ...observed.current,
          ]),
        saved: () => {
          dirty.current = false;
          app.setDirty("budget", false);
        },
      });
      if (refreshed) {
        const fresh = queryClient.getQueryData(snapshotOptions(month, app.scope).queryKey);
        observed.current = [...(fresh?.budgetHeadIds ?? [])];
        app.announce(m(amount === null ? "budgetRemoved" : "budgetSaved"));
      }
    } catch (e) {
      setError(app.errorMessage(e));
      document.getElementById("budget-input")?.focus();
    }
  }
  return (
    <section
      className="panel budget-panel"
      aria-labelledby="budget-editor-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="budget-editor-title">{m("monthlyLimit")}</h2>
          <p id="budget-month-label" className="helper">
            {formatMonth(locale, month)}
          </p>
          <p
            id="budget-status"
            className={`budget-status ${summary.budgetRemainingMinor !== null && parseMinorUnits(summary.budgetRemainingMinor) < 0n ? "over-budget" : ""}`}
          >
            {summary.budgetMinor === null
              ? m("budgetNotSet")
              : m("budgetUsedOf", {
                  used: money(summary.budgetUsedMinor),
                  budget: money(summary.budgetMinor),
                })}
          </p>
          <progress
            id="budget-progress"
            className="budget-progress"
            max={100}
            value={summary.budgetMinor === null ? 0 : progress}
            aria-label={m("budgetUsed")}
            aria-valuetext={m("budgetPercentUsed", { percent: progress })}
          />
        </div>
        {web && (
          <fieldset className="budget-month-control" disabled={mutation.isPending}>
            <legend className="visually-hidden">{m("monthNavigation")}</legend>
            <WebMonthPicker month={month} locale={locale} message={m} changeMonth={changeMonth} />
          </fieldset>
        )}
      </div>
      <form
        id="budget-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <label className="visually-hidden" htmlFor="budget-input">
            {m("monthlyLimit")}
          </label>
          <Input
            id="budget-input"
            name="budget"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              dirty.current = true;
              app.setDirty("budget", true);
            }}
            placeholder={m("noLimit")}
            aria-invalid={!!error}
            aria-describedby="budget-alert budget-help"
          />
        </div>
        <Button
          id="save-budget"
          type="submit"
          variant="outline"
          disabled={mutation.isPending}
        >
          {m(mutation.isPending ? "saving" : "saveLimit")}
        </Button>
      </form>
      <p className="form-alert" id="budget-alert" role="alert">
        {error}
      </p>
      <span className="helper" id="budget-help">
        {m("removeLimitHelp")}
      </span>
    </section>
  );
}

type CategoryDrilldownRecord = {
  id: string;
  date: string;
  title: string;
  categories: readonly string[];
  amountMinor: string;
};

export function Statistics({
  period,
  anchor,
  type,
  web = false,
  onPeriodChange,
  onAnchorChange,
  onMonthChange,
  onTypeChange,
}: {
  period: StatisticsPeriod;
  anchor: string;
  type: "income" | "expense";
  web?: boolean;
  onPeriodChange(period: StatisticsPeriod): void;
  onAnchorChange(anchor: string): void;
  onMonthChange(month: string): void;
  onTypeChange(type: "income" | "expense"): void;
}) {
  const { snapshot, locale, message: m } = useApp();
  const workspace = snapshot.workspace!;
  const [categoryView, setCategoryView] = useState<"bars" | "ring">(
    () => (web ? "ring" : "bars"),
  );
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categorySort, setCategorySort] = useState<"amount" | "date">("amount");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllLargestExpenses, setShowAllLargestExpenses] = useState(false);
  useEffect(() => {
    setSelectedBucketKey(null);
    setSelectedCategory(null);
    setShowAllLargestExpenses(false);
    setShowAllCategories(false);
  }, [anchor, period, type]);
  const statistics = calculateLedgerStatistics({
    transactions: snapshot.transactions,
    period,
    anchor,
    today: currentLocalDate(),
    type,
  });
  const money = (value: string) =>
    formatMoney(locale, value, workspace.currency, workspace.precision);
  const categoryName = (id: string) => labelCategory(snapshot.categories, id);
  const categoryNames = (ids: readonly string[]) =>
    labelCategories(snapshot.categories, ids);
  const maxBucket = statistics.buckets.reduce(
    (maximum, bucket) =>
      bucket.amountMinor === null
        ? maximum
        : (() => {
            const amount = parseMinorUnits(bucket.amountMinor);
            return amount > maximum ? amount : maximum;
          })(),
    0n,
  );
  const barWidth = (value: string | null): number => {
    if (value === null || maxBucket === 0n) return 0;
    const amount = parseMinorUnits(value);
    return Number((amount * 100n) / maxBucket);
  };
  const categoryTotal = statistics.categories.reduce(
    (total, category) => total + parseMinorUnits(category.amountMinor),
    0n,
  );
  const donutCategories = (() => {
    if (statistics.categories.length <= 5) return statistics.categories;
    const visible = statistics.categories.slice(0, 5);
    const visibleTotal = visible.reduce(
      (total, category) => total + parseMinorUnits(category.amountMinor),
      0n,
    );
    return [
      ...visible,
      {
        category: m("statOther"),
        amountMinor: (categoryTotal - visibleTotal).toString(),
      },
    ];
  })();
  const donutCircumference = 2 * Math.PI * 40;
  const donutSegments = (() => {
    if (categoryTotal === 0n) return [];
    let consumed = 0;
    return donutCategories.map((category, index) => {
      const share = Number(
        (parseMinorUnits(category.amountMinor) * 1_000_000n) / categoryTotal,
      ) / 1_000_000;
      const length = donutCircumference * share;
      const segment = { index, length, offset: consumed };
      consumed += length;
      return segment;
    });
  })();
  const selectedBucket =
    statistics.buckets.find((bucket) => bucket.key === selectedBucketKey) ?? null;
  const selectedBucketIndex = statistics.buckets.findIndex((bucket) => bucket.key === selectedBucketKey);
  const bucketTransactions = selectedBucket === null
    ? []
    : snapshot.transactions
        .filter((transaction) => selectedBucket.transactionIds.includes(transaction.id))
        .sort((left, right) =>
          absoluteMinor(right.amountMinor) - absoluteMinor(left.amountMinor) > 0n
            ? 1
            : absoluteMinor(right.amountMinor) - absoluteMinor(left.amountMinor) < 0n
              ? -1
              : right.date.localeCompare(left.date) || left.id.localeCompare(right.id),
        )
        .slice(0, 3);
  const categoryRecords = useMemo((): CategoryDrilldownRecord[] => {
    if (selectedCategory === null) return [];
    return snapshot.transactions
      .flatMap((transaction) => {
        if (
          transaction.deletedAt !== null ||
          transaction.type !== type ||
          transaction.date < statistics.start ||
          transaction.date > statistics.end
        )
          return [];
        const amount = transaction.splits
          .filter((split) => split.category === selectedCategory)
          .reduce((total, split) => total + absoluteMinor(split.amountMinor), 0n);
        if (amount === 0n) return [];
        return [
          {
            id: transaction.id,
            date: transaction.date,
            title:
              transaction.merchant ||
              transaction.notes ||
              categoryNames(transaction.splits.map((split) => split.category)),
            categories: transaction.splits.map((split) => categoryName(split.category)),
            amountMinor: amount.toString(),
          },
        ];
      })
      .sort((left, right) => {
        if (categorySort === "date") {
          return (
            right.date.localeCompare(left.date) ||
            compareMinorDescending(left.amountMinor, right.amountMinor) ||
            left.id.localeCompare(right.id)
          );
        }
        return (
          compareMinorDescending(left.amountMinor, right.amountMinor) ||
          right.date.localeCompare(left.date) ||
          left.id.localeCompare(right.id)
        );
      });
  }, [categorySort, selectedCategory, snapshot.categories, snapshot.transactions, statistics.end, statistics.start, type]);
  const selectedBucketLabel = selectedBucket === null
    ? ""
    : period === "year"
      ? formatMonth(locale, selectedBucket.start.slice(0, 7))
      : formatDate(locale, selectedBucket.start);
  const visibleLargestExpenses = showAllLargestExpenses
    ? statistics.largestExpenses
    : statistics.largestExpenses.slice(0, 5);
  const visibleCategories = showAllCategories
    ? statistics.categories
    : statistics.categories.slice(0, 5);
  return (
    <section className="panel category-panel statistics-page" aria-labelledby="category-title">
      <div className="section-heading">
        <div>
          <h1 id="category-title">{m("categoryBreakdown")}</h1>
          <p>{m("splitCountHelp")}</p>
        </div>
        {web && period === "month" ? (
          <WebMonthPicker
            month={anchor.slice(0, 7)}
            locale={locale}
            message={m}
            changeMonth={onMonthChange}
          />
        ) : (
          <label className="compact-field" htmlFor="statistics-anchor">
            <span>{m("selectedMonth")}</span>
            <input
              id="statistics-anchor"
              type="date"
              value={anchor}
              onChange={(event) => {
                if (event.currentTarget.value) onAnchorChange(event.currentTarget.value);
              }}
            />
          </label>
        )}
      </div>
      <div className="statistics-toolbar">
        <div className="segmented-control" role="group" aria-label={m("statTrend")}>
          {(["week", "month", "year"] as const).map((value) => (
            <button
              key={value}
              id={`statistics-period-${value}`}
              type="button"
              aria-pressed={period === value}
              onClick={() => onPeriodChange(value)}
            >
              {m(value === "week" ? "periodWeek" : value === "month" ? "periodMonth" : "periodYear")}
            </button>
          ))}
        </div>
        <div className="segmented-control" role="group" aria-label={m("type")}>
          {(["expense", "income"] as const).map((value) => (
            <button
              key={value}
              id={`statistics-type-${value}`}
              type="button"
              aria-pressed={type === value}
              onClick={() => onTypeChange(value)}
            >
              {m(value === "expense" ? "statExpense" : "statIncome")}
            </button>
          ))}
        </div>
        <div className="segmented-control" role="group" aria-label={m("statCategories")}>
          {(["bars", "ring"] as const).map((value) => (
            <button
              key={value}
              id={`statistics-category-view-${value}`}
              type="button"
              aria-pressed={categoryView === value}
              onClick={() => setCategoryView(value)}
            >
              {m(value === "bars" ? "statViewBars" : "statViewRing")}
            </button>
          ))}
        </div>
      </div>
      <div className="statistics-grid" id="category-breakdown">
        <article className="statistics-card" aria-labelledby="statistics-trend-title">
          <h2 id="statistics-trend-title">{m("statTrend")}</h2>
          <p className="statistics-total">{money(statistics.totalMinor)}</p>
          <p className="statistics-average">
            {statistics.averageMinor === null
              ? m("statNoTransactions")
              : `${m(period === "year" ? "statAverageMonth" : "statAverage")}: ${money(statistics.averageMinor)}`}
          </p>
          <p className="helper">{m("statAverageHelp")}</p>
          {statistics.buckets.every((bucket) => bucket.amountMinor === null) ? (
            <p className="empty-state">{m("statNoTransactions")}</p>
          ) : web ? (
            <>
              <p className="statistics-chart-help">{m("statChartHelp")}</p>
              <div
                className={`statistics-chart statistics-chart-${period}`}
                role="group"
                aria-label={`${m("statTrend")}: ${statistics.buckets
                  .map(
                    (bucket) =>
                      `${period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)} ${bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}`,
                  )
                  .join(", ")}`}
              >
                {statistics.buckets.map((bucket) => (
                  <button
                    key={bucket.key}
                    type="button"
                    className={`statistics-chart-button${selectedBucketKey === bucket.key ? " is-selected" : ""}`}
                    aria-label={`${period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)} · ${bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}`}
                    aria-pressed={selectedBucketKey === bucket.key}
                    onClick={() => setSelectedBucketKey(bucket.key)}
                  >
                    <progress
                      className="statistics-chart-bar"
                      max={100}
                      value={barWidth(bucket.amountMinor)}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <div className="statistics-chart-axis" aria-hidden="true">
                <span>{period === "year" ? formatMonth(locale, statistics.buckets[0]?.key ?? statistics.start.slice(0, 7)) : formatDate(locale, statistics.start)}</span>
                <span>{period === "year" ? formatMonth(locale, statistics.buckets.at(-1)?.key ?? statistics.end.slice(0, 7)) : formatDate(locale, statistics.end)}</span>
              </div>
              <div className="statistics-bucket-picker">
                <Button id="statistics-bucket-previous" variant="outline" aria-label={m("statPreviousBucket")}
                  disabled={selectedBucketIndex <= 0}
                  onClick={() => setSelectedBucketKey(statistics.buckets[selectedBucketIndex - 1]!.key)}><ChevronLeft aria-hidden="true" /></Button>
                <div className="field">
                  <label htmlFor="statistics-bucket-select">{m("statSelectBucket")}</label>
                  <select id="statistics-bucket-select" value={selectedBucketKey ?? ""}
                    onChange={(event) => setSelectedBucketKey(event.target.value || null)}>
                    <option value="">{m("statSelectBucket")}</option>
                    {statistics.buckets.map(bucket => (
                      <option key={bucket.key} value={bucket.key}>
                        {period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)} · {bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button id="statistics-bucket-next" variant="outline" aria-label={m("statNextBucket")}
                  disabled={selectedBucketIndex >= statistics.buckets.length - 1}
                  onClick={() => setSelectedBucketKey(statistics.buckets[selectedBucketIndex + 1]!.key)}><ChevronRight aria-hidden="true" /></Button>
              </div>
              <details id="statistics-trend-details" className="statistics-detail-disclosure">
                <summary>{m("statViewDetails")}</summary>
                <ul
                  className={`statistics-bars statistics-bars-${period}`}
                  aria-label={m("statTrend")}
                >
                  {statistics.buckets.map((bucket) => (
                    <li key={bucket.key}>
                      <button
                        type="button"
                        className="statistics-bar-row"
                        aria-pressed={selectedBucketKey === bucket.key}
                        aria-label={`${period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)} · ${bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}`}
                        onClick={() => setSelectedBucketKey(bucket.key)}
                      >
                        <span className="statistics-bar-label">
                          {period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)}
                        </span>
                        <progress
                          className="statistics-bar-track"
                          max={100}
                          value={barWidth(bucket.amountMinor)}
                          aria-hidden="true"
                        />
                        <span className="statistics-bar-value">
                          {bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          ) : (
            <ul
              className={`statistics-bars statistics-bars-${period}`}
              aria-label={m("statTrend")}
            >
              {statistics.buckets.map((bucket) => (
                <li key={bucket.key}>
                  <button
                    type="button"
                    className="statistics-bar-row"
                    aria-pressed={selectedBucketKey === bucket.key}
                    aria-label={`${period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)} · ${bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}`}
                    onClick={() => setSelectedBucketKey(bucket.key)}
                  >
                    <span className="statistics-bar-label">
                      {period === "year" ? formatMonth(locale, bucket.key) : formatDate(locale, bucket.start)}
                    </span>
                    <progress
                      className="statistics-bar-track"
                      max={100}
                      value={barWidth(bucket.amountMinor)}
                      aria-hidden="true"
                    />
                    <span className="statistics-bar-value">
                      {bucket.amountMinor === null ? m("statFuture") : money(bucket.amountMinor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedBucket !== null && (
            <section
              id="statistics-bucket-detail"
              className="statistics-bucket-detail"
              aria-labelledby="statistics-bucket-detail-title"
            >
              <h3 id="statistics-bucket-detail-title">{m("statBucketDetails")}</h3>
              <p>
                {m("statBucketHelp", {
                  date: selectedBucketLabel,
                  amount:
                    selectedBucket.amountMinor === null
                      ? m("statFuture")
                      : money(selectedBucket.amountMinor),
                })}
              </p>
              {bucketTransactions.length === 0 ? (
                <p className="helper">{m("statNoTransactions")}</p>
              ) : (
                <ul className="statistics-bucket-transactions">
                  {bucketTransactions.map((transaction) => (
                    <li key={transaction.id}>
                      <span>
                        <strong>
                          {transaction.merchant ||
                            transaction.notes ||
                            categoryNames(transaction.splits.map((split) => split.category))}
                        </strong>
                        <span>{formatDate(locale, transaction.date)}</span>
                      </span>
                      <strong>{money(absoluteMinor(transaction.amountMinor).toString())}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p className="statistics-legend">
            {formatDate(locale, statistics.start)} – {formatDate(locale, statistics.end)}
          </p>
        </article>
        <article className="statistics-card" aria-labelledby="statistics-categories-title">
          <h2 id="statistics-categories-title">{m("statCategories")}</h2>
          {statistics.categories.length === 0 ? (
            <p className="empty-state">{m("noCategories")}</p>
          ) : (
            <>
              {categoryView === "ring" && (
                <div
                  className="statistics-donut"
                  role="img"
                  aria-label={`${m("statCategories")}: ${donutCategories.map((category) => `${categoryName(category.category)} ${money(category.amountMinor)}`).join(", ")}`}
                >
                  <svg
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle className="statistics-donut-track" cx="50" cy="50" r="40" />
                    {donutSegments.map((segment) => (
                      <circle
                        key={segment.index}
                        className={`statistics-donut-segment statistics-donut-segment-${segment.index}`}
                        cx="50"
                        cy="50"
                        r="40"
                        strokeDasharray={`${segment.length} ${donutCircumference - segment.length}`}
                        strokeDashoffset={-segment.offset}
                      />
                    ))}
                  </svg>
                  <span>{money(statistics.totalMinor)}</span>
                </div>
              )}
              <ul className="statistics-categories">
                {visibleCategories.map((category) => (
                  <li className="statistics-category-row" key={category.category}>
                    <button
                      type="button"
                      className="statistics-category-button"
                      aria-pressed={selectedCategory === category.category}
                      onClick={() => setSelectedCategory(category.category)}
                    >
                      <strong>{categoryName(category.category)}</strong>
                      <span>{money(category.amountMinor)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {statistics.categories.length > 5 && (
                <Button
                  id="statistics-categories-toggle"
                  type="button"
                  variant="outline"
                  aria-expanded={showAllCategories}
                  onClick={() => setShowAllCategories((current) => !current)}
                >
                  {m(showAllCategories ? "statViewTop" : "statViewAll")}
                </Button>
              )}
              {selectedCategory !== null && (
                <section
                  id="statistics-drilldown"
                  className="statistics-drilldown"
                  aria-labelledby="statistics-drilldown-title"
                >
                  <div className="statistics-drilldown-heading">
                    <div>
                      <h3 id="statistics-drilldown-title">{m("statDrilldown")}</h3>
                      <p>{m("statDrilldownHelp", { category: categoryName(selectedCategory) })}</p>
                    </div>
                    <div className="segmented-control" role="group" aria-label={m("statDrilldown")}>
                      <button
                        id="statistics-sort-amount"
                        type="button"
                        aria-pressed={categorySort === "amount"}
                        onClick={() => setCategorySort("amount")}
                      >
                        {m("statSortAmount")}
                      </button>
                      <button
                        id="statistics-sort-date"
                        type="button"
                        aria-pressed={categorySort === "date"}
                        onClick={() => setCategorySort("date")}
                      >
                        {m("statSortDate")}
                      </button>
                    </div>
                  </div>
                  {categoryRecords.length === 0 ? (
                    <p className="helper">{m("statNoCategoryTransactions")}</p>
                  ) : (
                    <ul className="statistics-drilldown-list">
                      {categoryRecords.map((record) => (
                        <li className="statistics-drilldown-row" key={record.id}>
                          <span>
                            <strong>{record.title}</strong>
                            <span>{formatDate(locale, record.date)} · {record.categories.join(" · ")}</span>
                          </span>
                          <span className="statistics-drilldown-amount">
                            <strong>{money(record.amountMinor)}</strong>
                            <span>{m("statCategoryAmount")}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </article>
      </div>
      <article className="statistics-card statistics-largest-card" aria-labelledby="statistics-largest-title">
        <div className="statistics-card-heading">
          <h2 id="statistics-largest-title">{m("statLargestExpenses")}</h2>
          {statistics.largestExpenses.length > 5 && (
            <Button
              id="statistics-largest-toggle"
              type="button"
              variant="outline"
              aria-controls="largest-expense-list"
              aria-expanded={showAllLargestExpenses}
              onClick={() => setShowAllLargestExpenses((current) => !current)}
            >
              {m(showAllLargestExpenses ? "statViewTop" : "statViewAll")}
            </Button>
          )}
        </div>
        {statistics.largestExpenses.length === 0 ? (
          <p className="empty-state">{m("statNoTransactions")}</p>
        ) : (
          <ol id="largest-expense-list" className="largest-expense-list">
            {visibleLargestExpenses.map((expense, index) => (
              <li className="largest-expense-row" key={expense.id}>
                <span className="largest-expense-rank">{index + 1}</span>
                <span className="largest-expense-copy">
                  <strong>{expense.merchant || expense.notes || expense.categories.map((id) => categoryName(id)).join(" · ")}</strong>
                  <span>{formatDate(locale, expense.date)} · {expense.categories.map((id) => categoryName(id)).join(" · ")}</span>
                </span>
                <strong>{money(expense.amountMinor)}</strong>
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}

function absoluteMinor(value: string): bigint {
  const amount = parseMinorUnits(value);
  return amount < 0n ? -amount : amount;
}

function compareMinorDescending(left: string, right: string): number {
  const difference = parseMinorUnits(right) - parseMinorUnits(left);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}
