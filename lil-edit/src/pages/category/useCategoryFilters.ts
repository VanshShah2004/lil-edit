import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { CategoryFilters, CategorySort } from "@/services/categoryService";

/**
 * The category listing's filter + sort state, held in the URL rather than in
 * component state.
 *
 * The URL is the only place it CAN live: a filtered listing is a thing shoppers
 * send each other ("the 2-3 Years lehengas"), and it is what the browser restores
 * when they come back from a product. Keeping it in useState would lose all of
 * that on the first Back press.
 *
 * Param names are the API's own (gender, occasion, fabric, size, color, badge,
 * price, sale, stock, sort), so the page URL and the request behind it read the
 * same and there is no translation table to keep in step.
 */

const SORTS = new Set<CategorySort>(["newest", "price-asc", "price-desc", "discount"]);

/** One list param → its values. Accepts comma-joined or repeated keys. */
function readList(params: URLSearchParams, key: string): string[] {
  const parts = params.getAll(key).flatMap((v) => v.split(","));
  return [...new Set(parts.map((v) => v.trim().toLowerCase()).filter(Boolean))];
}

export interface CategoryFilterControls {
  filters: CategoryFilters;
  /** A stable string for the current state — the fetch effect's dependency. */
  key: string;
  setSort: (sort: CategorySort) => void;
  /** Adds the value to that group, or removes it if already selected. */
  toggle: (group: ListGroup, value: string) => void;
  /**
   * Replaces a whole group in one write. Needed because every write rebuilds the
   * params from the CURRENT ones: calling toggle() in a loop would have each pass
   * start from the same stale copy and only the last would survive.
   */
  setGroup: (group: ListGroup, values: string[]) => void;
  setFlag: (flag: "onSale" | "inStockOnly", on: boolean) => void;
  clearAll: () => void;
}

/** The filter groups that hold a list of values (i.e. everything but the two toggles). */
export type ListGroup = "genders" | "occasions" | "tags" | "sizes" | "colors" | "badges" | "priceBuckets";

const PARAM_OF: Record<ListGroup, string> = {
  genders: "gender",
  occasions: "occasion",
  tags: "tag",
  sizes: "size",
  colors: "color",
  badges: "badge",
  priceBuckets: "price",
};

export function useCategoryFilters(): CategoryFilterControls {
  const [params, setParams] = useSearchParams();

  const filters: CategoryFilters = useMemo(() => {
    const rawSort = (params.get("sort") ?? "newest") as CategorySort;
    return {
      sort: SORTS.has(rawSort) ? rawSort : "newest",
      genders: readList(params, "gender"),
      occasions: readList(params, "occasion"),
      tags: readList(params, "tag"),
      sizes: readList(params, "size"),
      colors: readList(params, "color"),
      badges: readList(params, "badge"),
      priceBuckets: readList(params, "price"),
      onSale: params.get("sale") === "1",
      inStockOnly: params.get("stock") === "1",
    };
  }, [params]);

  // Writes replace rather than push: a shopper ticking four boxes should not have
  // to press Back four times to leave the page. The URL still carries the state,
  // so sharing and reload both work — only the intermediate steps are dropped.
  const write = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setSort = useCallback(
    (sort: CategorySort) => {
      console.log("[CategoryFilters] sort →", sort);
      write((next) => {
        if (sort === "newest") next.delete("sort");
        else next.set("sort", sort);
      });
    },
    [write],
  );

  const toggle = useCallback(
    (group: ListGroup, value: string) => {
      const param = PARAM_OF[group];
      const current = filters[group];
      const on = !current.includes(value);
      console.log("[CategoryFilters]", param, on ? "+" : "−", value);
      write((next) => {
        const updated = on ? [...current, value] : current.filter((v) => v !== value);
        if (updated.length) next.set(param, updated.join(","));
        else next.delete(param);
      });
    },
    [filters, write],
  );

  const setGroup = useCallback(
    (group: ListGroup, values: string[]) => {
      const param = PARAM_OF[group];
      console.log("[CategoryFilters]", param, "=", values);
      write((next) => {
        if (values.length) next.set(param, [...new Set(values)].join(","));
        else next.delete(param);
      });
    },
    [write],
  );

  const setFlag = useCallback(
    (flag: "onSale" | "inStockOnly", on: boolean) => {
      const param = flag === "onSale" ? "sale" : "stock";
      console.log("[CategoryFilters]", param, "→", on);
      write((next) => {
        if (on) next.set(param, "1");
        else next.delete(param);
      });
    },
    [write],
  );

  const clearAll = useCallback(() => {
    console.log("[CategoryFilters] cleared all filters");
    // Sort survives a clear — it isn't a filter, and losing the shopper's chosen
    // ordering when they empty the panel would read as a bug.
    write((next) => {
      for (const param of Object.values(PARAM_OF)) next.delete(param);
      next.delete("sale");
      next.delete("stock");
    });
  }, [write]);

  const key = useMemo(() => JSON.stringify(filters), [filters]);

  return { filters, key, setSort, toggle, setGroup, setFlag, clearAll };
}
