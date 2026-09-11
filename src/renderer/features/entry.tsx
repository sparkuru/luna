import { useEffect, useRef, useState } from "react";
import type { Transaction } from "../../shared/domain";
import {
  currentLocalDate,
  currentLocalMonth,
  decimalToMinorUnits,
  formatMinorMagnitude,
} from "../../shared/domain";
import { useApp, useLocalWrite } from "../data/local";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "../components/form";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";

export interface Entry {
  type: "income" | "expense";
  transaction?: Transaction;
  returnFocus: string;
}
export function TransactionDialog({
  entry,
  open,
  close,
  saved,
}: {
  entry: Entry;
  open: boolean;
  close(): void;
  saved(): void;
}) {
  const app = useApp();
  const { message: m, snapshot, month } = app;
  const workspace = snapshot.workspace!;
  const original = entry.transaction;
  const initial = {
    type: original?.type ?? entry.type,
    amount: original
      ? formatMinorMagnitude(
          original.amountMinor,
          workspace.precision,
        ).replaceAll(",", "")
      : "",
    category: original?.splits.map((s) => s.category).join(" · ") ?? "",
    date:
      original?.date ??
      (month === currentLocalMonth() ? currentLocalDate() : `${month}-01`),
    merchant: original?.merchant ?? "",
    payment: original?.paymentMethod ?? "",
    notes: original?.notes ?? "",
  };
  const [draft, setDraft] = useState(initial);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [categoryError, setCategoryError] = useState(false);
  const [error, setError] = useState("");
  const mutation = useLocalWrite();
  const locked = (original?.splits.length ?? 0) > 1;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => {
    app.setDirty("entry", dirty);
    return () => app.setDirty("entry", false);
  }, [dirty]);
  const busyRef = useRef(false);
  const change = (name: keyof typeof draft, value: string) =>
    setDraft((prev) => ({ ...prev, [name]: value }));
  const requestClose = () => {
    if (!mutation.isPending) close();
  };
  useEffect(() => {
    const back = () => {
      if (categoryOpen) setCategoryOpen(false);
      else close();
    };
    window.addEventListener("luna:back", back);
    return () => window.removeEventListener("luna:back", back);
  }, [categoryOpen, close]);
  const categories = [
    ...new Set(
      snapshot.transactions
        .flatMap((tx) => tx.splits.map((s) => s.category))
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, app.locale));
  async function save() {
    if (busyRef.current || locked) return;
    busyRef.current = true;
    setError("");
    try {
      const amountMinor = decimalToMinorUnits(
        draft.amount,
        workspace.precision,
      );
      const value = {
        type: draft.type,
        amountMinor,
        date: draft.date,
        splits: [{ category: draft.category.trim(), amountMinor }],
        merchant: draft.merchant,
        paymentMethod: draft.payment,
        notes: draft.notes,
      };
      const refreshed = await mutation.mutateAsync({
        write: () =>
          original
            ? window.lunaLedger.updateTransaction(
                original.id,
                value,
                original.revision,
              )
            : window.lunaLedger.createTransaction(value),
        saved: () => {
          app.setDirty("entry", false);
          saved();
        },
      });
      if (refreshed)
        app.announce(m(original ? "transactionUpdated" : "transactionSaved"));
    } catch (cause) {
      setError(app.errorMessage(cause));
      document.getElementById("transaction-amount")?.focus();
    } finally {
      busyRef.current = false;
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent
        active={open}
        id="transaction-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (categoryOpen) setCategoryOpen(false);
            else requestClose();
          }
        }}
        aria-labelledby="transaction-form-title"
        aria-describedby="transaction-form-description"
        className="luna-dialog transaction-dialog-panel"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("transaction-amount")?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (
            document.getElementById(entry.returnFocus) ??
            document.getElementById("record-expense")
          )?.focus();
        }}
      >
        <header className="dialog-header">
          <div>
            <span className="kicker">{m("quickEntryKicker")}</span>
            <DialogTitle id="transaction-form-title">
              {m(original ? "editTransaction" : "quickEntryTitle")}
            </DialogTitle>
            <DialogDescription className="quick-entry-description">
              {m("quickEntryDescription")}
            </DialogDescription>
            <p id="transaction-form-description" className="helper">
              {m(
                locked
                  ? "multiCategoryLocked"
                  : original
                    ? "transactionLocalHelp"
                    : "quickEntryCoreHelp",
              )}
            </p>
          </div>
          <Button
            id="close-transaction"
            variant="outline"
            onClick={requestClose}
          >
            {m("closeMenu")}
          </Button>
        </header>
        <div id="transaction-alert" className="form-alert" role="alert">
          {error}
        </div>
        <form
          id="transaction-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset
            disabled={locked || mutation.isPending}
            className="entry-fieldset"
          >
            <label className="visually-hidden" htmlFor="transaction-type">
              {m("type")}
            </label>
            <select
              id="transaction-type"
              className="visually-hidden"
              name="type"
              value={draft.type}
              onChange={(e) => change("type", e.target.value)}
            >
              <option value="expense">{m("spending")}</option>
              <option value="income">{m("income")}</option>
            </select>
            <div
              id="quick-type-switcher"
              className="quick-type-switcher"
              role="group"
              aria-label={m("quickEntryType")}
            >
              {(["expense", "income"] as const).map((type) => (
                <Button
                  key={type}
                  id={`quick-${type}`}
                  type="button"
                  className={`quick-type-button ${type}`}
                  aria-pressed={draft.type === type}
                  onClick={() => change("type", type)}
                >
                  {m(
                    type === "expense"
                      ? "quickEntryExpense"
                      : "quickEntryIncome",
                  )}
                </Button>
              ))}
            </div>
            <p className="quick-entry-core-help">{m("quickEntryCoreHelp")}</p>
            <div className="form-grid quick-core-fields">
              <div className="field">
                <label htmlFor="transaction-amount">{m("amount")} *</label>
                <Input
                  id="transaction-amount"
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={draft.amount}
                  onChange={(e) => change("amount", e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby="transaction-alert amount-helper"
                />
                <span id="amount-helper" className="helper">
                  {m("amountHelp", {
                    currency:
                      workspace.currency === "CNY"
                        ? m("currencyCny")
                        : workspace.currency,
                    precision: workspace.precision,
                  })}
                </span>
              </div>
              <div className="field">
                <label htmlFor="transaction-category">{m("category")} *</label>
                <div className="category-control">
                  <Input
                    id="transaction-category"
                    name="category"
                    maxLength={120}
                    required
                    value={draft.category}
                    onChange={(e) => change("category", e.target.value)}
                  />
                  <Button
                    id="choose-category"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCustom(draft.category);
                      setCategoryError(false);
                      setCategoryOpen(true);
                    }}
                  >
                    {m("chooseCategory")}
                  </Button>
                </div>
              </div>
            </div>
            <details
              id="transaction-advanced-details"
              className="advanced-fields"
              open={original ? true : undefined}
            >
              <summary>{m("moreDetails")}</summary>
              <p className="helper">{m("moreDetailsHelp")}</p>
              <div className="form-grid">
                <Field
                  id="transaction-date"
                  name="date"
                  label={m("date")}
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => change("date", e.target.value)}
                />
                <Field
                  id="transaction-merchant"
                  name="merchant"
                  label={m("merchant")}
                  maxLength={160}
                  value={draft.merchant}
                  onChange={(e) => change("merchant", e.target.value)}
                />
                <Field
                  id="transaction-payment"
                  name="payment"
                  label={m("paymentMethod")}
                  maxLength={120}
                  placeholder={m("paymentPlaceholder")}
                  value={draft.payment}
                  onChange={(e) => change("payment", e.target.value)}
                />
                <div className="field full">
                  <label htmlFor="transaction-notes">{m("notes")}</label>
                  <textarea
                    id="transaction-notes"
                    name="notes"
                    maxLength={2000}
                    value={draft.notes}
                    onChange={(e) => change("notes", e.target.value)}
                  />
                </div>
              </div>
            </details>
            <div className="form-actions">
              <Button id="save-transaction" type="submit">
                {m(
                  mutation.isPending
                    ? "saving"
                    : original
                      ? "saveChanges"
                      : "saveTransaction",
                )}
              </Button>
            </div>
          </fieldset>
          {original && (
            <Button
              id="cancel-edit"
              type="button"
              variant="outline"
              onClick={requestClose}
            >
              {m("cancel")}
            </Button>
          )}
        </form>
        <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
          <DialogContent
            id="category-dialog"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setCategoryOpen(false);
              }
            }}
            aria-labelledby="category-dialog-title"
            className="luna-dialog category-dialog-panel"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("category-custom")?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // Radix resumes the parent focus scope after this callback returns.
              queueMicrotask(() =>
                document.getElementById("choose-category")?.focus(),
              );
            }}
          >
            <header className="dialog-header">
              <div>
                <DialogTitle id="category-dialog-title">
                  {m("categoryPickerTitle")}
                </DialogTitle>
                <DialogDescription>{m("categoryPickerHelp")}</DialogDescription>
              </div>
              <Button
                id="close-category"
                variant="outline"
                onClick={() => setCategoryOpen(false)}
              >
                {m("closeMenu")}
              </Button>
            </header>
            <div id="category-options" className="category-options" role="list">
              {categories.length === 0 ? (
                <p className="empty-state">{m("noSavedCategories")}</p>
              ) : (
                categories.map((category) => (
                  <div role="listitem" key={category}>
                    <Button
                      type="button"
                      variant="outline"
                      className="category-option"
                      onClick={() => {
                        change("category", category);
                        setCategoryOpen(false);
                      }}
                    >
                      {category}
                    </Button>
                  </div>
                ))
              )}
            </div>
            <form
              id="category-picker-form"
              className="category-custom-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!custom.trim()) {
                  setCategoryError(true);
                  return;
                }
                change("category", custom.trim());
                setCategoryOpen(false);
              }}
            >
              <Field
                id="category-custom"
                label={m("customCategory")}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={120}
              />
              <Button id="use-category" type="submit">
                {m("useCategory")}
              </Button>
            </form>
            <p id="category-alert" role="alert" className="form-alert">
              {categoryError ? m("categoryRequired") : ""}
            </p>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
