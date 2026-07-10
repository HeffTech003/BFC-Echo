// components/ui/data-table.tsx
"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DataTableColumn<T extends Record<string, unknown>> {
  /** Key in the data object, or a dot-path like "member.name" */
  key: string;
  header: string;
  /** Enable click-to-sort on this column */
  sortable?: boolean;
  /** Include this column's raw value in the global search */
  searchable?: boolean;
  /** Custom cell renderer. Receives the full row object. */
  cell?: (row: T) => React.ReactNode;
  /** Extra className on the <TableHead> and <TableCell> */
  className?: string;
  /** Extra className on <TableHead> only */
  headClassName?: string;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: DataTableColumn<T>[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Extra content to the right of the search box (e.g. filter buttons) */
  toolbar?: React.ReactNode;
  /** Called when the visible row count changes (useful for parent summaries) */
  onFilteredCountChange?: (count: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reads a potentially nested value from an object using a dot-path key */
function getValue<T extends Record<string, unknown>>(row: T, key: string): unknown {
  return key.split(".").reduce<unknown>((obj, k) => {
    if (obj && typeof obj === "object") return (obj as Record<string, unknown>)[k];
    return undefined;
  }, row);
}

function toSortable(val: unknown): string | number {
  if (val == null) return "";
  if (typeof val === "number") return val;
  return String(val).toLowerCase();
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ direction }: { direction: "asc" | "desc" | null }) {
  return (
    <span className="ml-1 inline-flex flex-col leading-none text-[8px]">
      <span className={direction === "asc" ? "opacity-100" : "opacity-25"}>▲</span>
      <span className={direction === "desc" ? "opacity-100" : "opacity-25"}>▼</span>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchPlaceholder = "Search…",
  emptyMessage = "No results.",
  toolbar,
  onFilteredCountChange,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const searchableCols = useMemo(
    () => columns.filter((c) => c.searchable !== false),
    [columns]
  );

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchableCols.some((col) => {
        const val = getValue(row, col.key);
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchableCols]);

  // Notify parent
  useMemo(() => {
    onFilteredCountChange?.(filtered.length);
  }, [filtered.length, onFilteredCountChange]);

  // ── Sort ────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = toSortable(getValue(a, sortKey));
      const bv = toSortable(getValue(b, sortKey));
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              "h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm",
              "placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-ring"
            )}
          />
        </div>
        {toolbar}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {sorted.length !== data.length
            ? `${sorted.length} of ${data.length}`
            : `${data.length} rows`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.headClassName,
                    col.className,
                    col.sortable !== false && "cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  )}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center">
                    {col.header}
                    {col.sortable !== false && (
                      <SortIcon
                        direction={sortKey === col.key ? sortDir : null}
                      />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  {search ? `No results for "${search}"` : emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row, ri) => (
                <TableRow key={(row.id as string | number | undefined) ?? ri}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell
                        ? col.cell(row)
                        : (() => {
                            const v = getValue(row, col.key);
                            return v != null ? String(v) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
