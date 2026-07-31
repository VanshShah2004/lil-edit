import { type ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./states";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  // Custom cell content; defaults to String(row[key]).
  render?: (row: T) => ReactNode;
  // Value used for sorting (defaults to row[key]); return number for numeric sort.
  sortValue?: (row: T) => number | string;
  // Value for CSV export (defaults to row[key]).
  csv?: (row: T) => string | number;
  // Include this column's text in the search filter.
  searchable?: boolean;
  // Column width hint (Tailwind class).
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  pageSize?: number;
  exportName?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  dense?: boolean;
  emptyMessage?: string;
}

function toCsvValue(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Escape per RFC 4180 when the value contains a comma, quote or newline.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  searchPlaceholder = "Search…",
  pageSize = 10,
  exportName = "analytics",
  initialSort,
  dense = false,
  emptyMessage = "No rows match your filters.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);
  const [page, setPage] = useState(0);

  const searchableCols = useMemo(() => columns.filter((c) => c.searchable), [columns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      searchableCols.some((c) => {
        const raw = c.csv ? c.csv(row) : (row as Record<string, unknown>)[c.key];
        return String(raw ?? "").toLowerCase().includes(q);
      })
    );
  }, [rows, query, searchableCols]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const val = (row: T): number | string => {
      if (col.sortValue) return col.sortValue(row);
      const raw = (row as Record<string, unknown>)[col.key];
      return typeof raw === "number" ? raw : String(raw ?? "");
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null; // third click clears
    });
  };

  const exportCsv = () => {
    const header = columns.map((c) => toCsvValue(c.header)).join(",");
    const body = sorted
      .map((row) =>
        columns
          .map((c) => {
            const v = c.csv ? c.csv(row) : (row as Record<string, unknown>)[c.key];
            return toCsvValue(v);
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`[DataTable] exported ${sorted.length} rows → ${a.download}`);
  };

  const cellPad = dense ? "px-3 py-1.5" : "px-3 py-2.5";

  return (
    <div className="rounded-xl border border-gray-400 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-400 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-800 outline-none placeholder:text-gray-400 focus:border-gray-500 focus:bg-white"
          />
        </div>
        <span className="text-[11px] tabular-nums text-gray-400">{sorted.length} rows</span>
        <button
          type="button"
          onClick={exportCsv}
          disabled={sorted.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-400 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-500 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="p-6">
          <EmptyState title={emptyMessage} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    const SortIcon = !active ? ChevronsUpDown : sort.dir === "desc" ? ChevronDown : ChevronUp;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          "bg-gray-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          !c.align && "text-left",
                          c.width
                        )}
                      >
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn(
                              "inline-flex items-center gap-1 hover:text-gray-800",
                              c.align === "right" && "flex-row-reverse",
                              active && "text-gray-900"
                            )}
                          >
                            {c.header}
                            <SortIcon className="h-3 w-3" />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={getRowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-gray-50 last:border-0",
                      onRowClick && "cursor-pointer hover:bg-gray-50"
                    )}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          cellPad,
                          "text-gray-700",
                          c.align === "right" && "text-right tabular-nums",
                          c.align === "center" && "text-center",
                          c.width
                        )}
                      >
                        {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 p-3">
              <span className="text-[11px] tabular-nums text-gray-400">
                Page {safePage + 1} of {pageCount}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-400 text-gray-600 hover:border-gray-500 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-400 text-gray-600 hover:border-gray-500 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
