import { useRef, useState } from "react";
import { decimalToMinorUnits } from "../../shared/domain";
import { useApp, useLocalWrite, formString } from "../data/local";
import { Field } from "../components/form";
import { Button } from "../components/ui/button";
export function Setup() {
  const { message: m, locale, errorMessage } = useApp();
  const [currency, setCurrency] = useState(locale === "zh-CN" ? "CNY" : "USD");
  const [precision, setPrecision] = useState("2");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mutation = useLocalWrite();
  async function submit(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    try {
      const budget = formString(form, "budget").trim();
      await mutation.mutateAsync({
        write: () =>
          window.lunaLedger.createWorkspace({
            name: formString(form, "name"),
            currency,
            precision: Number(precision),
            monthlyBudgetMinor: budget
              ? decimalToMinorUnits(budget, Number(precision))
              : null,
          }),
        saved: () => {
          form.reset();
        },
      });
    } catch (e) {
      setError(errorMessage(e));
      document.getElementById("workspace-name")?.focus();
    } finally {
      lock.current = false;
    }
  }
  return (
    <div className="setup-shell">
      <section className="setup-copy" aria-labelledby="welcome-title">
        <span className="kicker">{m("setupKicker")}</span>
        <h1 id="welcome-title">{m("setupWelcome")}</h1>
        <p>{m("setupDescription")}</p>
      </section>
      <section className="setup-card" aria-labelledby="setup-title">
        <h2 id="setup-title">{m("setupTitle")}</h2>
        <p>{m("setupHelp")}</p>
        <div id="setup-alert" className="form-alert" role="alert">
          {error}
        </div>
        <form
          id="workspace-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <Field
            id="workspace-name"
            name="name"
            label={m("workspaceName")}
            maxLength={80}
            autoComplete="organization"
            required
          />
          <div className="form-grid">
            <div className="field">
              <label htmlFor="workspace-currency">{m("currency")}</label>
              <select
                id="workspace-currency"
                name="currency"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setPrecision(e.target.value === "JPY" ? "0" : "2");
                }}
              >
                {(
                  [
                    "CNY",
                    "USD",
                    "SGD",
                    "EUR",
                    "GBP",
                    "JPY",
                    "AUD",
                    "CAD",
                  ] as const
                ).map((value, index) => (
                  <option value={value} key={value}>
                    {m(
                      (
                        [
                          "currencyCny",
                          "currencyUsd",
                          "currencySgd",
                          "currencyEur",
                          "currencyGbp",
                          "currencyJpy",
                          "currencyAud",
                          "currencyCad",
                        ] as const
                      )[index]!,
                    )}
                  </option>
                ))}
              </select>
            </div>
            <Field
              id="workspace-precision"
              name="precision"
              label={m("decimalPlaces")}
              type="number"
              min={0}
              max={4}
              step={1}
              value={precision}
              onChange={(e) => setPrecision(e.target.value)}
              required
            />
          </div>
          <Field
            id="workspace-budget"
            name="budget"
            label={m("monthlyLimit")}
            inputMode="decimal"
            placeholder={m("budgetPlaceholder")}
          />
          <p className="helper">{m("budgetPlanningHelp")}</p>
          <Button type="submit" disabled={mutation.isPending}>
            {m(mutation.isPending ? "creating" : "createWorkspace")}
          </Button>
        </form>
        <p className="setup-note">{m("setupLocalNote")}</p>
      </section>
    </div>
  );
}
