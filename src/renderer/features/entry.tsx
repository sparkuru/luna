import { useEffect, useRef, useState } from "react";
import { Calculator, ImagePlus, X } from "lucide-react";
import type { Transaction, TransactionType } from "../../shared/domain";
import {
  currentLocalDate,
  currentLocalMonth,
  formatMinorUnits,
  formatMinorMagnitude,
} from "../../shared/domain";
import {
  AmountExpressionError,
  evaluateAmountExpression,
  normalizeAmountExpressionInput,
} from "../../shared/amount-expression";
import {
  MAX_SOURCE_IMAGE_BYTES,
  validateNormalizedImage,
  validateSourceImage,
  type AttachmentMetadata,
  type AttachmentRef,
} from "../../shared/attachment-contract";
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
import {
  closeAndroidSelectedImages,
  isAndroidImageInputAvailable,
  isAndroidImagePickerCancelled,
  pickAndroidImages,
  readAndroidSelectedImage,
} from "../../web/android-image-input";
import { secureRandomId } from "../../shared/secure-random";
import type { AppLocale } from "../../shared/settings";

export interface Entry {
  type: "income" | "expense";
  transaction?: Transaction;
  returnFocus: string;
}

function builtInCategoriesFor(
  locale: AppLocale,
  type: TransactionType,
): readonly string[] {
  if (locale === "zh-CN") {
    return type === "expense"
      ? ["餐饮", "交通", "购物", "住房", "日用", "娱乐", "医疗", "教育"]
      : ["工资", "奖金", "兼职", "投资", "退款", "礼金", "补贴"];
  }
  return type === "expense"
    ? ["Food", "Transport", "Shopping", "Housing", "Household", "Leisure", "Health", "Education"]
    : ["Salary", "Bonus", "Freelance", "Investment", "Refund", "Gift", "Allowance"];
}

interface EntryAttachment {
  ref: AttachmentRef;
  metadata: AttachmentMetadata;
  previewUrl?: string;
}

async function normalizeImageFile(file: File): Promise<{
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
}> {
  if (file.size === 0 || file.size > MAX_SOURCE_IMAGE_BYTES)
    throw new Error("LUNA_ERROR:attachment-source-too-large");
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await normalizeImageBytes(sourceBytes, file.type);
  } finally {
    sourceBytes.fill(0);
  }
}

async function normalizeImageBytes(
  sourceBytes: Uint8Array,
  declaredMime: string,
): Promise<{
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
}> {
  const source = validateSourceImage(sourceBytes, declaredMime);
  let drawable: ImageBitmap | HTMLImageElement | undefined;
  let objectUrl: string | undefined;
  const sourceCopy = new Uint8Array(sourceBytes.byteLength);
  sourceCopy.set(sourceBytes);
  const sourceBlob = new Blob([sourceCopy.buffer], { type: declaredMime });
  sourceCopy.fill(0);
  try {
    if (typeof createImageBitmap === "function") {
      drawable = await createImageBitmap(sourceBlob, { imageOrientation: "from-image" });
    } else {
      const url = URL.createObjectURL(sourceBlob);
      objectUrl = url;
      const image = new Image();
      drawable = await new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("LUNA_ERROR:attachment-invalid-source"));
        image.src = url;
      });
    }
    const decodedWidth =
      "naturalWidth" in drawable ? drawable.naturalWidth : drawable.width;
    const decodedHeight =
      "naturalHeight" in drawable ? drawable.naturalHeight : drawable.height;
    if (!Number.isSafeInteger(decodedWidth) || !Number.isSafeInteger(decodedHeight) || decodedWidth < 1 || decodedHeight < 1)
      throw new Error("LUNA_ERROR:attachment-invalid-source");
    const scale = Math.min(1, 2048 / decodedWidth, 2048 / decodedHeight);
    const width = Math.max(1, Math.round(decodedWidth * scale));
    const height = Math.max(1, Math.round(decodedHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("LUNA_ERROR:attachment-crypto-unavailable");
    if (drawable === undefined) throw new Error("LUNA_ERROR:attachment-invalid-source");
    if (!source.hasAlpha) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(drawable, 0, 0, width, height);
    const mime = source.hasAlpha ? "image/png" : "image/jpeg";
    const normalizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value === null ? reject(new Error("LUNA_ERROR:attachment-invalid-source")) : resolve(value)),
        mime,
        0.9,
      );
    });
    const bytes = new Uint8Array(await normalizedBlob.arrayBuffer());
    validateNormalizedImage(bytes, mime, width, height);
    return { bytes, mime, width, height };
  } finally {
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    if (drawable !== undefined && "close" in drawable && typeof drawable.close === "function") drawable.close();
  }
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
  const [expression, setExpression] = useState(initial.amount);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [categoryError, setCategoryError] = useState(false);
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [attachments, setAttachments] = useState<EntryAttachment[]>(() =>
    (original?.attachments ?? []).map((metadata) => ({
      ref: { attachmentId: metadata.id },
      metadata,
    })),
  );
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const objectUrls = useRef(new Set<string>());
  const draftSessionId = useRef(secureRandomId("entry"));
  const mutation = useLocalWrite();
  const locked = (original?.splits.length ?? 0) > 1;
  const initialAttachmentKey = (original?.attachments ?? [])
    .map((item) => item.id)
    .join("|");
  const attachmentKey = attachments.map((item) => item.metadata.id).join("|");
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    attachmentKey !== initialAttachmentKey;
  useEffect(() => {
    app.setDirty("entry", dirty);
    return () => app.setDirty("entry", false);
  }, [dirty]);
  useEffect(() => {
    return () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      for (const item of attachmentsRef.current) {
        if (item.ref.draftToken !== undefined)
          void window.lunaLedger
            .discardDraftImage(item.ref.draftToken)
            .catch(() => undefined);
      }
    };
  }, []);
  const busyRef = useRef(false);
  const change = (name: keyof typeof draft, value: string) =>
    setDraft((prev) => ({ ...prev, [name]: value }));
  const changeAmount = (value: string) => {
    if (value === "") {
      setExpression("");
      change("amount", "");
      setError("");
      return;
    }
    try {
      const normalized = normalizeAmountExpressionInput(value);
      setExpression(normalized);
      change("amount", normalized);
      setError("");
    } catch (cause) {
      setExpression(value);
      change("amount", value);
      if (cause instanceof AmountExpressionError) setError(cause.message);
    }
  };
  const pressCalculator = (token: string) => {
    if (token === "clear") {
      setExpression("");
      change("amount", "");
      setError("");
      return;
    }
    if (token === "backspace") {
      changeAmount(expression.slice(0, -1));
      return;
    }
    if (token === "=") {
      try {
        const result = evaluateAmountExpression(expression, workspace.precision);
        const formatted = formatMinorUnits(result, workspace.precision).replaceAll(",", "");
        setExpression(formatted);
        change("amount", formatted);
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : app.errorMessage(cause));
      }
      return;
    }
    changeAmount(`${expression}${token}`);
  };
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
  const categoriesForType = (type: TransactionType) => [
    ...new Set([
      ...snapshot.transactions
        .filter((tx) => tx.deletedAt === null && tx.type === type)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
        .flatMap((tx) => tx.splits.map((split) => split.category).filter(Boolean)),
      ...builtInCategoriesFor(app.locale, type),
    ]),
  ];
  const categories = categoriesForType(draft.type);
  const changeType = (type: TransactionType) => {
    if (type === draft.type) return;
    const currentCategory = draft.category.trim();
    const compatible =
      currentCategory === "" || categoriesForType(type).includes(currentCategory);
    if (!compatible) {
      if (!window.confirm(m("changeTypeCategoryConfirm"))) return;
      setDraft((previous) => ({ ...previous, type, category: "" }));
      return;
    }
    change("type", type);
  };
  async function addImages(files: FileList | null) {
    const android = isAndroidImageInputAvailable();
    if (!android && (files === null || files.length === 0)) return;
    setImageBusy(true);
    setError("");
    const staged: EntryAttachment[] = [];
    let nativeImages: Awaited<ReturnType<typeof pickAndroidImages>> = [];
    try {
      if (android) nativeImages = await pickAndroidImages();
      const count = android ? nativeImages.length : files?.length ?? 0;
      if (count === 0) return;
      if (attachments.length + count > 9) {
        setError(m("imageLimit"));
        return;
      }
      const stage = async (normalized: Awaited<ReturnType<typeof normalizeImageBytes>>) => {
        try {
          const result = await window.lunaLedger.stageTransactionImage(
            draftSessionId.current,
            normalized.bytes,
            normalized.mime,
            normalized.width,
            normalized.height,
          );
          const previewBytes = new Uint8Array(normalized.bytes.byteLength);
          previewBytes.set(normalized.bytes);
          const previewUrl = URL.createObjectURL(
            new Blob([previewBytes], { type: normalized.mime }),
          );
          objectUrls.current.add(previewUrl);
          staged.push({
            ref: { draftToken: result.draftToken },
            metadata: result.metadata,
            previewUrl,
          });
        } finally {
          normalized.bytes.fill(0);
        }
      };
      if (android) {
        for (const image of nativeImages) {
          const sourceBytes = await readAndroidSelectedImage(image);
          try {
            await stage(await normalizeImageBytes(sourceBytes, image.mime));
          } finally {
            sourceBytes.fill(0);
          }
        }
      } else {
        for (const file of Array.from(files ?? []))
          await stage(await normalizeImageFile(file));
      }
      setAttachments((current) => [...current, ...staged]);
    } catch (cause) {
      for (const item of staged) {
        if (item.previewUrl !== undefined) {
          URL.revokeObjectURL(item.previewUrl);
          objectUrls.current.delete(item.previewUrl);
        }
        if (item.ref.draftToken !== undefined)
          void window.lunaLedger.discardDraftImage(item.ref.draftToken).catch(() => undefined);
      }
      if (!isAndroidImagePickerCancelled(cause)) setError(app.errorMessage(cause));
    } finally {
      if (android) await closeAndroidSelectedImages(nativeImages);
      setImageBusy(false);
    }
  }
  function removeImage(item: EntryAttachment) {
    if (item.previewUrl !== undefined) {
      URL.revokeObjectURL(item.previewUrl);
      objectUrls.current.delete(item.previewUrl);
    }
    if (item.ref.draftToken !== undefined)
      void window.lunaLedger
        .discardDraftImage(item.ref.draftToken)
        .catch(() => undefined);
    setAttachments((current) => current.filter((candidate) => candidate !== item));
  }
  async function save() {
    if (busyRef.current || locked) return;
    busyRef.current = true;
    setError("");
    try {
      const evaluated = evaluateAmountExpression(expression, workspace.precision);
      const evaluatedMinor = BigInt(evaluated);
      if (evaluatedMinor <= 0n) throw new Error("LUNA_ERROR:invalid-amount");
      const amountMinor = evaluatedMinor.toString();
      const value = {
        type: draft.type,
        amountMinor,
        date: draft.date,
        splits: [{ category: draft.category.trim(), amountMinor }],
        merchant: draft.merchant,
        paymentMethod: draft.payment,
        notes: draft.notes,
        // An explicit empty list means “remove all images” on update; omitting
        // the field intentionally preserves existing attachments at the host.
        attachments: attachments.map((item) => item.ref),
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
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (categoryOpen) setCategoryOpen(false);
          else requestClose();
        }}
        aria-labelledby="transaction-form-title"
        aria-describedby="transaction-form-description"
        className="luna-dialog transaction-dialog-panel"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("transaction-amount")?.focus({ preventScroll: true });
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
            disabled={locked || mutation.isPending || imageBusy}
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
              onChange={(e) => changeType(e.target.value as TransactionType)}
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
                  onClick={() => changeType(type)}
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
            {categories.length > 0 && (
              <div
                id="category-grid"
                className="category-grid"
                aria-label={m("category")}
              >
                {categories.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    variant={draft.category === category ? "secondary" : "outline"}
                    aria-pressed={draft.category === category}
                    onClick={() => change("category", category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
            )}
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
                  onChange={(e) => changeAmount(e.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      /[+-]/.test(expression)
                    ) {
                      event.preventDefault();
                      pressCalculator("=");
                    }
                  }}
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
                <div className="calculator" aria-label={m("calculator")}>
                  <div className="calculator-title">
                    <Calculator size={17} aria-hidden="true" />
                    <span>{m("calculator")}</span>
                  </div>
                  <p className="helper">{m("calculatorHelp")}</p>
                  <div className="calculator-grid">
                    {["7", "8", "9", "backspace", "4", "5", "6", "+", "1", "2", "3", "-", ".", "0", "clear", "="]
                      .map((token) => (
                        <Button
                          key={token}
                          type="button"
                          variant={token === "=" ? "default" : "outline"}
                          className={token === "=" ? "equals" : ["+", "-", "backspace"].includes(token) ? "operator" : undefined}
                          aria-label={token === "=" ? m("calculatorEquals") : token === "backspace" ? m("calculatorBackspace") : token}
                          onClick={() => pressCalculator(token)}
                        >
                          {token === "backspace" ? "⌫" : token === "clear" ? "C" : token === "=" ? "=" : token}
                        </Button>
                      ))}
                  </div>
                </div>
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
              <Field
                id="transaction-date"
                name="date"
                label={m("date")}
                type="date"
                required
                value={draft.date}
                onChange={(e) => change("date", e.target.value)}
              />
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
            <div className="attachment-picker">
              <div>
                {isAndroidImageInputAvailable() ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void addImages(null)}
                    disabled={imageBusy || mutation.isPending || locked}
                  >
                    <ImagePlus size={17} aria-hidden="true" /> {m("addImage")}
                  </Button>
                ) : (
                  <label htmlFor="transaction-images">
                    <ImagePlus size={17} aria-hidden="true" /> {m("addImage")}
                  </label>
                )}
                <p className="helper">{m("imageHelp")}</p>
              </div>
              <input
                id="transaction-images"
                name="images"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden={isAndroidImageInputAvailable()}
                disabled={imageBusy || mutation.isPending || locked}
                onChange={(event) => {
                  void addImages(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {imageBusy && <p className="helper" role="status">{m("imageProcessing")}</p>}
              {attachments.length > 0 && (
                <ul className="attachment-preview-list" aria-label={m("attachments")}>
                  {attachments.map((item, index) => (
                    <li className="attachment-preview" key={item.metadata.id}>
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={`${m("attachments")} ${index + 1}`}
                          width={item.metadata.width}
                          height={item.metadata.height}
                          loading="lazy"
                        />
                      ) : (
                        <span aria-hidden="true" className="attachment-preview-placeholder">▧</span>
                      )}
                      <span className="attachment-preview-meta">
                        {item.metadata.width}×{item.metadata.height} · {item.metadata.mime}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`${m("removeImage")} ${index + 1}`}
                        onClick={() => removeImage(item)}
                      >
                        <X size={17} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="form-actions">
            <Button
              id="save-transaction"
              type="submit"
              disabled={imageBusy || mutation.isPending || locked}
            >
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
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              setCategoryOpen(false);
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
