import type { CategoryDefinition } from "../shared/category-catalog";

/**
 * Category ids are the stored value. Renderer surfaces should resolve them to
 * the current label in one place, while retaining an id fallback for an
 * historical record whose catalog is no longer present.
 */
export function labelCategory(
  categories: readonly CategoryDefinition[] | undefined,
  id: string,
): string {
  return categories?.find((category) => category.id === id)?.name ?? id;
}

export function labelCategories(
  categories: readonly CategoryDefinition[] | undefined,
  ids: readonly string[],
  separator = " · ",
): string {
  return ids.map((id) => labelCategory(categories, id)).join(separator);
}
