import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TransactionType } from "../../shared/domain";
import type {
  CategoryDefinition,
  CategoryUsage,
} from "../../shared/category-catalog";
import { formatDate, formatMoney } from "../i18n";
import { useApp, queryClient, snapshotOptions } from "../data/local";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Field } from "../components/form";
import { getClientSurface } from "../client-surface";
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
  const mobile = getClientSurface() === "mobile";
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
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageFailed, setUsageFailed] = useState(false);
  const usageTrigger = useRef<HTMLElement | null>(null);
  const usageRequest = useRef(0);
  const usageSource = useRef<string | null>(null);
  const usageHeadIds = useRef<string[]>([]);
  const usageDeletionConfirmed = useRef(false);
  const CreateContainer = mobile ? "details" : "div";
  function closeUsage() {
    usageRequest.current++;
    usageSource.current = null;
    setUsageCategory(null);
  }
  useEffect(() => () => {
    usageRequest.current++;
    usageSource.current = null;
  }, []);
  useEffect(() => {
    if (!usageCategory) return;
    const back = (event: Event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      if (!busy) closeUsage();
    };
    window.addEventListener("luna:navigate-back", back, true);
    return () => window.removeEventListener("luna:navigate-back", back, true);
  }, [usageCategory, busy]);

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

  const openUsage = async (category: CategoryDefinition, deletionConfirmed = false) => {
    const request = ++usageRequest.current;
    usageSource.current = category.id;
    usageHeadIds.current = [...(app.snapshot.categoryHeadIds ?? [])];
    usageDeletionConfirmed.current = deletionConfirmed;
    const current = () => request === usageRequest.current && usageSource.current === category.id;
    if (usageCategory === null) usageTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setUsageCategory(category);
    setUsage([]);
    setSelected(new Set());
    setTargets({});
    setBatchTarget("");
    setError("");
    setUsageLoading(true);
    setUsageFailed(false);
    try {
      const rows = await window.lunaLedger.getCategoryUsage(category.id);
      if (current()) setUsage(rows);
    } catch (cause) {
      if (current()) {
        setUsageFailed(true);
        setError(app.errorMessage(cause));
      }
    } finally {
      if (current()) setUsageLoading(false);
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
      if (!mobile) setType("expense");
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
    if (!window.confirm(app.message("deleteCategoryConfirm", { name: category.name }))) return;
    try {
      await window.lunaLedger.deleteCategory(category.id, app.snapshot.categoryHeadIds);
      await app.refresh();
      app.announce(app.message("categoryDeleted"));
    } catch (cause) {
      if (errorCode(cause) === "category-in-use") {
        await openUsage(category, true);
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
    const category = usageCategory;
    const request = usageRequest.current;
    const current = () => request === usageRequest.current && usageSource.current === category.id;
    const rows = usage.filter((row) => ids.includes(row.transactionId));
    const revisions = Object.fromEntries(rows.map((row) => [row.transactionId, row.revision]));
    const done = await write(
      () => window.lunaLedger.reassignCategory({
        sourceCategoryId: category.id,
        targetCategoryId: target,
        transactionIds: ids,
        expectedRevisions: revisions,
        expectedHeadIds: [...usageHeadIds.current],
      }),
      app.message("categoryReassigned"),
    );
    if (done && current()) {
      // Reobserve only after our successful write and explicit snapshot refresh;
      // unrelated background renders cannot upgrade a usage draft's token.
      const fresh = queryClient.getQueryData(snapshotOptions(app.month, app.scope).queryKey);
      if (fresh) usageHeadIds.current = [...(fresh.categoryHeadIds ?? [])];
      setUsageLoading(true);
      setSelected(new Set());
      setTargets({});
      setBatchTarget("");
      try {
        const rows = await window.lunaLedger.getCategoryUsage(category.id);
        if (current()) setUsage(rows);
      } catch (cause) {
        if (current()) {
          setUsageFailed(true);
          setError(app.errorMessage(cause));
        }
      } finally {
        if (current()) setUsageLoading(false);
      }
    }
  };

  const deleteAfterUsage = async () => {
    if (usageCategory === null || usage.length > 0) return;
    const category = usageCategory;
    if (!usageDeletionConfirmed.current) {
      if (!window.confirm(app.message("deleteCategoryConfirm", { name: category.name }))) return;
      usageDeletionConfirmed.current = true;
    }
    const done = await write(
      () => window.lunaLedger.deleteCategory(category.id, [...usageHeadIds.current]),
      app.message("categoryDeleted"),
    );
    if (done) closeUsage();
  };

  const renderGroup = (groupType: TransactionType) => {
    const group = categories.filter((category) => category.type === groupType);
    return (
      <section className="category-settings-group" aria-labelledby={`category-group-${groupType}`}>
        {mobile && <h3 id={`category-group-${groupType}`} className="visually-hidden">{app.message(groupType === "expense" ? "spending" : "income")}</h3>}
        {!mobile && <div className="section-heading compact-heading">
          <div>
            <h3 id={`category-group-${groupType}`}>{app.message(groupType === "expense" ? "spending" : "income")}</h3>
            <p className="helper">{groupType === "expense" ? app.message("spending") : app.message("income")}</p>
          </div>
        </div>}
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
                {mobile && <details className="category-row-menu" onToggle={(event) => {
                  if (event.currentTarget.open) document.querySelectorAll<HTMLDetailsElement>(".category-row-menu[open]").forEach((menu) => { if (menu !== event.currentTarget) menu.open = false; });
                }}>
                  <summary aria-label={app.message("manageCategory", { name: category.name })}>{app.message("manageCategoryAction")}</summary>
                  <div className="category-settings-actions">
                    <Button type="button" variant="ghost" onClick={() => void rename(category)} disabled={busy}>{app.message("renameCategory")}</Button>
                    <Button type="button" variant="ghost" onClick={() => toggle(category)} disabled={busy}>{app.message(category.enabled ? "disableCategory" : "enableCategory")}</Button>
                    <Button id={`category-open-usage-${category.id}`} type="button" variant="ghost" onClick={() => void openUsage(category)} disabled={busy}>{app.message("categoryUsageAction")}</Button>
                    <Button type="button" variant="ghost" className="danger-button" onClick={() => void remove(category)} disabled={busy}>{app.message("deleteCategory")}</Button>
                  </div>
                </details>}
                {!mobile && <div className="category-settings-actions">
                  <Button type="button" variant="outline" onClick={() => rename(category)} disabled={busy}>
                    {app.message("renameCategory")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => toggle(category)} disabled={busy}>
                    {app.message(category.enabled ? "disableCategory" : "enableCategory")}
                  </Button>
                  <Button type="button" variant="ghost" className="danger-button" onClick={() => void remove(category)} disabled={busy}>
                    {app.message("deleteCategory")}
                  </Button>
                </div>}
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
          {!mobile && <span className="kicker">{app.message("settingsTitle")}</span>}
          <h2 id="categories-title">{app.message("categoriesTitle")}</h2>
          {!mobile && <p>{app.message("categoriesHelp")}</p>}
        </div>
      </div>
      <div className="form-alert" role="alert">{error}</div>
      {mobile && <div className="mobile-category-tabs" aria-label={app.message("categoryType")}>
        {(["expense", "income"] as const).map((value) => <Button key={value} id={`category-tab-${value}`} type="button" variant={type === value ? "default" : "outline"} aria-pressed={type === value} disabled={busy} onClick={() => setType(value)}>{app.message(value === "expense" ? "spending" : "income")}</Button>)}
      </div>}
      <CreateContainer id="category-create-details" className="category-create-details">
      {mobile && <summary>{app.message("addCategory")}</summary>}
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
        {!mobile && <label className="compact-field" htmlFor="category-type">
          <span>{app.message("categoryType")}</span>
          <select id="category-type" value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
            <option value="expense">{app.message("spending")}</option>
            <option value="income">{app.message("income")}</option>
          </select>
        </label>}
        <Button id="save-category" type="submit" disabled={busy || name.trim() === ""}>{app.message("addCategory")}</Button>
      </form>
      </CreateContainer>
      <div className="category-settings-groups">
        {mobile ? renderGroup(type) : <>{renderGroup("expense")}{renderGroup("income")}</>}
      </div>
      <Dialog open={usageCategory !== null} onOpenChange={(open) => { if (!open && !busy) closeUsage(); }}>
        <DialogContent id="category-usage-dialog" className="luna-dialog category-dialog-panel" aria-labelledby="category-usage-title" onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Radix removes its modal focus scope after this callback.
          queueMicrotask(() => (usageTrigger.current?.isConnected ? usageTrigger.current : document.getElementById(`category-tab-${type}`) ?? document.getElementById("category-name"))?.focus({ preventScroll: true }));
        }}>
          <header className="dialog-header">
            <div>
              <DialogTitle id="category-usage-title">{app.message("categoryUsageTitle")}</DialogTitle>
              <DialogDescription>{app.message("categoryUsageHelp")}</DialogDescription>
            </div>
            <Button type="button" variant="outline" disabled={busy} onClick={closeUsage}>{app.message("closeMenu")}</Button>
          </header>
          <div className="form-alert" role="alert">{error}</div>
          {usageLoading ? <p role="status">{app.message("loadingCategoryUsage")}</p> : usageFailed ? <Button type="button" variant="outline" onClick={() => usageCategory && void openUsage(usageCategory, usageDeletionConfirmed.current)}>{app.message("tryAgain")}</Button> : <>
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
                <select id="category-batch-target" aria-label={app.message("selectTargetCategory")} value={batchTarget} onChange={(event) => setBatchTarget(event.target.value)}>
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
          )}</>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
