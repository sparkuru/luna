import { decodeId, DomainError, type TransactionType } from "./domain";
import type { AppLocale } from "./settings";

export const CATEGORY_NAME_MAX_LENGTH = 120;
export const MAX_CATEGORY_COUNT = 2_000;

export interface CategoryDefinition {
  id: string;
  type: TransactionType;
  name: string;
  enabled: boolean;
  position: number;
  deletedAt: string | null;
}

export interface CategoryCatalog {
  categories: CategoryDefinition[];
}

export interface CategoryCreateInput {
  type: TransactionType;
  name: string;
}

export interface CategoryUpdateInput {
  name?: string;
  enabled?: boolean;
}

export interface CategoryUsage {
  transactionId: string;
  revision: number;
  date: string;
  type: TransactionType;
  amountMinor: string;
  merchant: string;
  notes: string;
  sourceAmountMinor: string;
}

export interface CategoryReassignmentInput {
  sourceCategoryId: string;
  targetCategoryId: string;
  transactionIds: string[];
  expectedRevisions: Record<string, number>;
  expectedHeadIds: string[];
}

export function defaultCategoryCatalog(locale: AppLocale): CategoryCatalog {
  const expense = locale === "zh-CN"
    ? ["餐饮", "交通", "购物", "住房", "日用", "娱乐", "医疗", "教育"]
    : ["Food", "Transport", "Shopping", "Housing", "Household", "Leisure", "Health", "Education"];
  const income = locale === "zh-CN"
    ? ["工资", "奖金", "兼职", "投资", "退款", "礼金", "补贴"]
    : ["Salary", "Bonus", "Freelance", "Investment", "Refund", "Gift", "Allowance"];
  return {
    categories: [
      ...expense.map((name, position) => categorySeed("expense", name, position)),
      ...income.map((name, position) => categorySeed("income", name, position)),
    ],
  };
}

function categorySeed(
  type: TransactionType,
  name: string,
  position: number,
): CategoryDefinition {
  return {
    id: `${type}:${position}`,
    type,
    name,
    enabled: true,
    position,
    deletedAt: null,
  };
}

export function normalizeCategoryName(value: string): string {
  if (typeof value !== "string") {
    throw new DomainError("invalid-input", "Category name must be text.");
  }
  const name = value.trim();
  if (name.length === 0) {
    throw new DomainError("invalid-input", "Category name is required.");
  }
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    throw new DomainError("invalid-input", "Category name is too long.");
  }
  return name;
}

export function validateCategoryCatalog(value: CategoryCatalog): CategoryCatalog {
  if (!Array.isArray(value.categories) || value.categories.length > MAX_CATEGORY_COUNT) {
    throw new DomainError("invalid-input", "Category catalog is invalid.");
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const categories = value.categories.map((category) => {
    if (!isTransactionType(category.type)) {
      throw new DomainError("invalid-input", "Category type is invalid.");
    }
    const id = decodeId(category.id, "category id");
    if (ids.has(id)) {
      throw new DomainError("invalid-input", "Category ids must be unique.");
    }
    ids.add(id);
    const name = normalizeCategoryName(category.name);
    if (!Number.isSafeInteger(category.position) || category.position < 0) {
      throw new DomainError("invalid-input", "Category position is invalid.");
    }
    if (typeof category.enabled !== "boolean") {
      throw new DomainError("invalid-input", "Category enabled state is invalid.");
    }
    const key = `${category.type}:${name.toLocaleLowerCase("en-US")}`;
    if (category.deletedAt === null && names.has(key)) {
      throw new DomainError("invalid-input", "Category names must be unique.");
    }
    if (category.deletedAt === null) names.add(key);
    const deletedAt = category.deletedAt;
    if (deletedAt !== null && !isTimestamp(deletedAt)) {
      throw new DomainError("invalid-input", "Category deletion time is invalid.");
    }
    if (deletedAt !== null && category.enabled) {
      throw new DomainError("invalid-input", "Deleted categories cannot be enabled.");
    }
    return { id, type: category.type, name, enabled: category.enabled, position: category.position, deletedAt };
  });
  categories.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  return { categories };
}

export function decodeCategoryCatalog(value: unknown): CategoryCatalog {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "categories")) {
    throw new DomainError("invalid-input", "Category catalog must contain categories.");
  }
  if (!Array.isArray(value.categories)) {
    throw new DomainError("invalid-input", "Category catalog categories must be an array.");
  }
  const categories = value.categories.map((raw) => {
    if (!isRecord(raw) || Object.keys(raw).length !== 6) {
      throw new DomainError("invalid-input", "Category definition is invalid.");
    }
    const deletedAt = raw.deletedAt;
    if (deletedAt !== null && typeof deletedAt !== "string") {
      throw new DomainError("invalid-input", "Category deletion time is invalid.");
    }
    if (typeof raw.id !== "string" || !isTransactionType(raw.type) ||
        typeof raw.name !== "string" || typeof raw.enabled !== "boolean" ||
        typeof raw.position !== "number") {
      throw new DomainError("invalid-input", "Category definition is invalid.");
    }
    return {
      id: decodeId(raw.id, "category id"),
      type: raw.type,
      name: raw.name,
      enabled: raw.enabled,
      position: raw.position,
      deletedAt,
    } satisfies CategoryDefinition;
  });
  return validateCategoryCatalog({ categories });
}

/** Find a category even when it is disabled or tombstoned. */
export function categoryDefinitionById(
  catalog: CategoryCatalog,
  id: string,
): CategoryDefinition | undefined {
  return catalog.categories.find((category) => category.id === id);
}

export function decodeCategoryCreateInput(value: unknown): CategoryCreateInput {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "type") || !Object.hasOwn(value, "name")) {
    throw new DomainError("invalid-input", "Category creation input is invalid.");
  }
  if (!isTransactionType(value.type)) {
    throw new DomainError("invalid-input", "Category type is invalid.");
  }
  return { type: value.type, name: normalizeCategoryName(text(value.name, "Category name")) };
}

export function decodeCategoryUpdateInput(value: unknown): CategoryUpdateInput {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== "name" && key !== "enabled") || Object.keys(value).length === 0) {
    throw new DomainError("invalid-input", "Category update input is invalid.");
  }
  const input: CategoryUpdateInput = {};
  if (Object.hasOwn(value, "name")) input.name = normalizeCategoryName(text(value.name, "Category name"));
  if (Object.hasOwn(value, "enabled")) {
    if (typeof value.enabled !== "boolean") throw new DomainError("invalid-input", "Category enabled state is invalid.");
    input.enabled = value.enabled;
  }
  return input;
}

export function decodeCategoryReassignmentInput(value: unknown): CategoryReassignmentInput {
  if (!isRecord(value) || Object.keys(value).length !== 5 ||
      !Object.hasOwn(value, "sourceCategoryId") || !Object.hasOwn(value, "targetCategoryId") ||
      !Object.hasOwn(value, "transactionIds") || !Object.hasOwn(value, "expectedRevisions") ||
      !Object.hasOwn(value, "expectedHeadIds")) {
    throw new DomainError("invalid-input", "Category reassignment input is invalid.");
  }
  if (!Array.isArray(value.transactionIds) || value.transactionIds.length === 0 ||
      value.transactionIds.length > MAX_CATEGORY_COUNT || !Array.isArray(value.expectedHeadIds)) {
    throw new DomainError("invalid-input", "Category reassignment selection is invalid.");
  }
  if (!isRecord(value.expectedRevisions)) {
    throw new DomainError("invalid-input", "Category reassignment revisions are invalid.");
  }
  const transactionIds = value.transactionIds.map((id) => decodeId(id, "transaction id"));
  if (new Set(transactionIds).size !== transactionIds.length) {
    throw new DomainError("invalid-input", "Category reassignment transactions are duplicated.");
  }
  const expectedRevisions: Record<string, number> = {};
  for (const transactionId of transactionIds) {
    const revision = value.expectedRevisions[transactionId];
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
      throw new DomainError("invalid-input", "Category reassignment revision is invalid.");
    }
    expectedRevisions[transactionId] = revision;
  }
  return {
    sourceCategoryId: decodeId(value.sourceCategoryId, "source category id"),
    targetCategoryId: decodeId(value.targetCategoryId, "target category id"),
    transactionIds,
    expectedRevisions,
    expectedHeadIds: value.expectedHeadIds.map((id) => decodeId(id, "category head id")),
  };
}

export function categoryById(catalog: CategoryCatalog, id: string): CategoryDefinition | undefined {
  return catalog.categories.find((category) => category.id === id && category.deletedAt === null);
}

export function categoryLabel(catalog: CategoryCatalog, id: string): string {
  return categoryById(catalog, id)?.name ?? id;
}

function isTransactionType(value: unknown): value is TransactionType {
  return value === "income" || value === "expense";
}

function isTimestamp(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new DomainError("invalid-input", `${label} must be text.`);
  return value;
}
