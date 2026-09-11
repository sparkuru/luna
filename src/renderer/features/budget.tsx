import { useEffect, useRef, useState } from "react";
import {
  decimalToMinorUnits,
  formatMinorMagnitude,
  parseMinorUnits,
} from "../../shared/domain";
import { formatMonth, formatMoney } from "../i18n";
import {
  useApp,
  useLocalWrite,
  queryClient,
  snapshotOptions,
} from "../data/local";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
export function BudgetEditor() {
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
export function Statistics() {
  const { snapshot, locale, message: m } = useApp();
  const w = snapshot.workspace!;
  const totals = snapshot.summary!.categoryTotals;
  const money = (value: string) =>
    formatMoney(locale, value, w.currency, w.precision);
  return (
    <section className="panel category-panel" aria-labelledby="category-title">
      <div className="section-heading">
        <div>
          <h2 id="category-title">{m("categoryBreakdown")}</h2>
          <p>{m("splitCountHelp")}</p>
        </div>
      </div>
      <div id="category-breakdown">
        {totals.length === 0 ? (
          <p className="empty-state">{m("noCategories")}</p>
        ) : (
          <ul className="transaction-list">
            {totals.map((category) => (
              <li key={category.category} className="transaction-item">
                <strong>{category.category}</strong>
                <div className="transaction-bottomline">
                  {m("categoryTotals", {
                    spending: money(category.expenseMinor),
                    income: money(category.incomeMinor),
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
