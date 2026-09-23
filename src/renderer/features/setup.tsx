import { useRef, useState } from "react";
import { decimalToMinorUnits } from "../../shared/domain";
import { useApp, useLocalWrite, formString } from "../data/local";
import { Field } from "../components/form";
import { Button } from "../components/ui/button";
export function Setup({ navigate }: { navigate: (to: string) => void }) {
  const { message: m, locale, errorMessage } = useApp();
  const [currency, setCurrency] = useState(locale === "zh-CN" ? "CNY" : "USD");
  const [precision, setPrecision] = useState("2");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);
  const clearFieldError = (field: string) => {
    if (errorField === field) { setError(""); setErrorField(null); }
  };
  const lock = useRef(false);
  const mutation = useLocalWrite();
  async function submit(form: HTMLFormElement) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setErrorField(null);
    let field: string | null = "workspace-name";
    try {
      if (!formString(form, "name").trim()) {
        setError(m("workspaceNameRequired"));
        setErrorField(field);
        document.getElementById(field)?.focus();
        return;
      }
      field = "workspace-precision";
      if (!Number.isInteger(Number(precision)) || Number(precision) < 0 || Number(precision) > 4 || precision === "") {
        setError(m("workspacePrecisionInvalid"));
        setErrorField(field);
        const advanced = document.getElementById("setup-advanced") as HTMLDetailsElement | null;
        if (advanced) advanced.open = true;
        document.getElementById(field)?.focus();
        return;
      }
      field = "workspace-budget";
      const budget = formString(form, "budget").trim();
      const monthlyBudgetMinor = budget ? decimalToMinorUnits(budget, Number(precision)) : null;
      field = null;
      await mutation.mutateAsync({
        write: () =>
          window.lunaLedger.createWorkspace({
            name: formString(form, "name"),
            currency,
            precision: Number(precision),
            monthlyBudgetMinor,
          }),
        saved: () => {
          form.reset();
        },
      });
    } catch (e) {
      setError(errorMessage(e));
      setErrorField(field);
      document.getElementById(field ?? "setup-alert")?.focus();
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
        <nav className="setup-recovery-actions" aria-label={m("setupExistingLedger")}>
          <Button id="setup-restore" variant="outline" onClick={() => navigate("/settings/backup")}>
            {m("setupRestore")}
          </Button>
          <Button id="setup-connect" variant="outline" onClick={() => navigate("/settings/account")}>
            {m("setupConnect")}
          </Button>
        </nav>
      </section>
      <section className="setup-card" aria-labelledby="setup-title">
        <h2 id="setup-title">{m("setupTitle")}</h2>
        <p>{m("setupHelp")}</p>
        <div id="setup-alert" className="form-alert" role="alert" tabIndex={-1}>
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
            aria-invalid={errorField === "workspace-name"}
            aria-describedby={errorField === "workspace-name" ? "setup-alert" : undefined}
            onChange={() => clearFieldError("workspace-name")}
            placeholder={m("workspaceNameExample")}
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
                  clearFieldError("workspace-precision");
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
          </div>
          <p className="helper" id="setup-precision-summary">{m("setupPrecisionSummary", { precision })}</p>
          <details id="setup-advanced">
            <summary>{m("setupAdvanced")}</summary>
            <Field
              id="workspace-precision"
              name="precision"
              label={m("decimalPlaces")}
              type="number"
              min={0}
              max={4}
              step={1}
              value={precision}
              aria-invalid={errorField === "workspace-precision"}
              aria-describedby={errorField === "workspace-precision" ? "setup-alert" : undefined}
              onChange={(e) => { clearFieldError("workspace-precision"); setPrecision(e.target.value); }}
              required
            />
          </details>
          <Field
            id="workspace-budget"
            name="budget"
            label={`${m("monthlyLimit")} (${m("optional")})`}
            aria-invalid={errorField === "workspace-budget"}
            aria-describedby={errorField === "workspace-budget" ? "setup-alert" : undefined}
            onChange={() => clearFieldError("workspace-budget")}
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
