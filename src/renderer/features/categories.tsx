import { useState, type FormEvent } from "react";
import type { TransactionType } from "../../shared/domain";
import type {
  CategoryDefinition,
  CategoryUsage,
} from "../../shared/category-catalog";
import { formatDate, formatMoney } from "../i18n";
import { useApp } from "../data/local";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "../components/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";

function errorCode(error: unknown): string {
  return error instanceof Error
    ? /LUNA_ERROR:([a-z-]+)/.exec(error.message)?.[1] ?? ""
    : "";
}

export function Categories() {
  const app = useApp();
  const categories = (app.snapshot.categories ?? []).filter(
    (category) => category.deletedAt === null,
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [usageCategory, setUsageCategory] = useState<CategoryDefinition | null>(null);
  const [usage, setUsage] = useState<CategoryUsage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [batchTarget, setBatchTarget] = useState("");

  const write = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      try {
        await app.refresh();
      } catch {
        app.announce(app.message("savedRefreshFailed"));
        return false;
      }
      app.announce(success);
      return true;
    } catch (cause) {
      setError(app.errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openUsage = async (category: CategoryDefinition) => {
    setUsageCategory(category);
    setUsage([]);
    setSelected(new Set());
    setTargets({});
    setBatchTarget("");
    setError("");
    try {
      setUsage(await window.lunaLedger.getCategoryUsage(category.id));
    } catch (cause) {
      setError(app.errorMessage(cause));
    }
  };

  const targetCategories = usageCategory === null
    ? []
    : categories.filter(
        (category) =>
          category.id !== usageCategory.id &&
          category.type === usageCategory.type &&
          category.enabled,
      );

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await write(
      () => window.lunaLedger.createCategory(
        { type, name },
        app.snapshot.categoryHeadIds,
      ),
      app.message("categoryCreated"),
    );
    if (created) {
      setName("");
      setType("expense");
    }
  };

  const rename = async (category: CategoryDefinition) => {
    const next = window.prompt(app.message("categoryName"), category.name);
    if (next === null || next.trim() === "" || next.trim() === category.name) return;
    await write(
      () => window.lunaLedger.updateCategory(
        category.id,
        { name: next.trim() },
        app.snapshot.categoryHeadIds,
      ),
      app.message("categoryUpdated"),
    );
  };

  const toggle = (category: CategoryDefinition) =>
    void write(
      () => window.lunaLedger.updateCategory(
        category.id,
        { enabled: !category.enabled },
        app.snapshot.categoryHeadIds,
      ),
      app.message("categoryUpdated"),
    );

  const remove = async (category: CategoryDefinition) => {
    if (!window.confirm(app.message("deleteCategoryConfirm"))) return;
    try {
      await window.lunaLedger.deleteCategory(category.id, app.snapshot.categoryHeadIds);
      await app.refresh();
      app.announce(app.message("categoryDeleted"));
    } catch (cause) {
      if (errorCode(cause) === "category-in-use") {
        await openUsage(category);
      } else {
        setError(app.errorMessage(cause));
      }
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const replace = async (ids: string[], target: string) => {
    if (usageCategory === null || ids.length === 0 || target === "") return;
    const rows = usage.filter((row) => ids.includes(row.transactionId));
    const revisions = Object.fromEntries(rows.map((row) => [row.transactionId, row.revision]));
    const done = await write(
      () => window.lunaLedger.reassignCategory({
        sourceCategoryId: usageCategory.id,
        targetCategoryId: target,
        transactionIds: ids,
        expectedRevisions: revisions,
        expectedHeadIds: app.snapshot.categoryHeadIds ?? [],
      }),
      app.message("categoryReassigned"),
    );
    if (done) {
      try {
        setUsage(await window.lunaLedger.getCategoryUsage(usageCategory.id));
      } catch (cause) {
        setError(app.errorMessage(cause));
      }
      setSelected(new Set());
      setTargets({});
      setBatchTarget("");
    }
  };

  const deleteAfterUsage = async () => {
    if (usageCategory === null || usage.length > 0) return;
    const category = usageCategory;
    const done = await write(
      () => window.lunaLedger.deleteCategory(category.id, app.snapshot.categoryHeadIds),
      app.message("categoryDeleted"),
    );
    if (done) setUsageCategory(null);
  };

  const renderGroup = (groupType: TransactionType) => {
    const group = categories.filter((category) => category.type === groupType);
    return (
      <section className="category-settings-group" aria-labelledby={`category-group-${groupType}`}>
        <div className="section-heading compact-heading">
          <div>
            <h3 id={`category-group-${groupType}`}>{app.message(groupType === "expense" ? "spending" : "income")}</h3>
            <p className="helper">{groupType === "expense" ? app.message("spending") : app.message("income")}</p>
          </div>
        </div>
        {group.length === 0 ? (
          <p className="empty-state">{app.message("noSavedCategories")}</p>
        ) : (
          <div className="category-settings-list">
            {group.map((category) => (
              <article className={`category-settings-item${category.enabled ? "" : " is-disabled"}`} key={category.id} data-category-id={category.id}>
                <div>
                  <strong>{category.name}</strong>
                  <span className="category-status">{app.message(category.enabled ? "enabled" : "disabled")}</span>
                </div>
                <div className="category-settings-actions">
                  <Button type="button" variant="outline" onClick={() => rename(category)} disabled={busy}>
                    {app.message("renameCategory")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => toggle(category)} disabled={busy}>
                    {app.message(category.enabled ? "disableCategory" : "enableCategory")}
                  </Button>
                  <Button type="button" variant="ghost" className="danger-button" onClick={() => void remove(category)} disabled={busy}>
                    {app.message("deleteCategory")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <section className="panel settings-panel categories-panel" aria-labelledby="categories-title">
      <div className="section-heading">
        <div>
          <span className="kicker">{app.message("settingsTitle")}</span>
          <h2 id="categories-title">{app.message("categoriesTitle")}</h2>
          <p>{app.message("categoriesHelp")}</p>
        </div>
      </div>
      <div className="form-alert" role="alert">{error}</div>
      <form className="category-create-form" onSubmit={(event) => void submitCategory(event)}>
        <Field
          id="category-name"
          name="name"
          label={app.message("categoryName")}
          placeholder={app.message("categoryNamePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
        />
        <label className="compact-field" htmlFor="category-type">
          <span>{app.message("categoryType")}</span>
          <select id="category-type" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
            <option value="expense">{app.message("spending")}</option>
            <option value="income">{app.message("income")}</option>
          </select>
        </label>
        <Button id="save-category" type="submit" disabled={busy || name.trim() === ""}>{app.message("addCategory")}</Button>
      </form>
      <div className="category-settings-groups">
        {renderGroup("expense")}
        {renderGroup("income")}
      </div>
      <Dialog open={usageCategory !== null} onOpenChange={(open) => { if (!open) setUsageCategory(null); }}>
        <DialogContent id="category-usage-dialog" className="luna-dialog category-dialog-panel" aria-labelledby="category-usage-title">
          <header className="dialog-header">
            <div>
              <DialogTitle id="category-usage-title">{app.message("categoryUsageTitle")}</DialogTitle>
              <DialogDescription>{app.message("categoryUsageHelp")}</DialogDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => setUsageCategory(null)}>{app.message("closeMenu")}</Button>
          </header>
          <p>{app.message(usage.length === 1 ? "categoryUsageCountSingular" : "categoryUsageCount", { count: usage.length })}</p>
          {usage.length === 0 ? (
            <>
              <p className="empty-state">{app.message("noCategoryUsage")}</p>
              <Button type="button" onClick={() => void deleteAfterUsage()} disabled={busy}>{app.message("deleteCategory")}</Button>
            </>
          ) : (
            <>
              <div className="category-usage-toolbar">
                <label className="check-field" htmlFor="category-usage-select-all">
                  <Input
                    id="category-usage-select-all"
                    type="checkbox"
                    checked={selected.size === usage.length}
                    onChange={(event) => setSelected(event.target.checked ? new Set(usage.map((row) => row.transactionId)) : new Set())}
                  />
                  <span>{app.message("selectAll")}</span>
                </label>
                <select id="category-batch-target" value={batchTarget} onChange={(event) => setBatchTarget(event.target.value)}>
                  <option value="">{app.message("selectTargetCategory")}</option>
                  {targetCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                </select>
                <Button type="button" onClick={() => void replace([...selected], batchTarget)} disabled={busy || selected.size === 0 || batchTarget === ""}>{app.message("replaceSelected")}</Button>
              </div>
              <ul className="category-usage-list">
                {usage.map((row) => {
                  const target = targets[row.transactionId] ?? "";
                  return (
                    <li key={row.transactionId} className="category-usage-row">
                      <label className="check-field" htmlFor={`category-usage-${row.transactionId}`}>
                        <Input
                          id={`category-usage-${row.transactionId}`}
                          type="checkbox"
                          checked={selected.has(row.transactionId)}
                          onChange={() => toggleSelected(row.transactionId)}
                        />
                        <span>
                          <strong>{formatDate(app.locale, row.date)}</strong>
                          <small>{row.merchant || row.notes || app.message("emptyValue")} · {formatMoney(app.locale, row.sourceAmountMinor, app.snapshot.workspace?.currency ?? "CNY", app.snapshot.workspace?.precision ?? 2)}</small>
                        </span>
                      </label>
                      <select aria-label={app.message("selectTargetCategory")} value={target} onChange={(event) => setTargets((current) => ({ ...current, [row.transactionId]: event.target.value }))}>
                        <option value="">{app.message("selectTargetCategory")}</option>
                        {targetCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
                      </select>
                      <Button type="button" variant="outline" onClick={() => void replace([row.transactionId], target)} disabled={busy || target === ""}>{app.message("replaceSelected")}</Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
