"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MemberRow = {
  id: string;
  full_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  member_type: string | null;
  member_status: string | null;
  joined_at: string | null;
  merged_into: string | null;
};

const STATUS_COLOURS: Record<string, string> = {
  active:    "bg-success/15 text-success-foreground",
  inactive:  "bg-muted text-muted-foreground",
  suspended: "bg-warning/15 text-warning-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  pending:   "bg-primary/15 text-primary",
};

const TYPE_LABELS: Record<string, string> = {
  gym_member:      "Gym",
  nac:             "Non-Attending",
  online_customer: "Online",
  staff:           "Staff",
  supplier:        "Supplier",
};

const COLUMNS: DataTableColumn<MemberRow>[] = [
  {
    key: "full_name",
    header: "Name",
    cell: (row) => (
      <div className="relative">
        <Link
          href={`/members/${row.id}`}
          className="font-medium before:absolute before:inset-0"
        >
          {row.full_name ?? "Unknown"}
        </Link>
      </div>
    ),
  },
  {
    key: "member_type",
    header: "Type",
    cell: (row) => (
      <Badge variant="outline" className="text-xs font-normal">
        {TYPE_LABELS[row.member_type ?? ""] ?? row.member_type ?? "—"}
      </Badge>
    ),
  },
  {
    key: "member_status",
    header: "Status",
    cell: (row) => (
      <Badge
        variant="secondary"
        className={cn("font-normal text-xs", STATUS_COLOURS[row.member_status ?? ""] ?? "")}
      >
        {row.member_status ?? "—"}
      </Badge>
    ),
  },
  {
    key: "primary_email",
    header: "Email",
    className: "hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate",
    headClassName: "hidden sm:table-cell",
    cell: (row) => (
      <span className="truncate block max-w-[200px]">{row.primary_email ?? "—"}</span>
    ),
  },
  {
    key: "primary_phone",
    header: "Phone",
    className: "hidden md:table-cell text-sm text-muted-foreground",
    headClassName: "hidden md:table-cell",
    sortable: false,
    cell: (row) => <span>{row.primary_phone ?? "—"}</span>,
  },
  {
    key: "joined_at",
    header: "Joined",
    className: "hidden lg:table-cell text-sm text-muted-foreground",
    headClassName: "hidden lg:table-cell",
    cell: (row) => <span>{row.joined_at ? formatDate(row.joined_at) : "—"}</span>,
  },
];

// ── Filter chip definitions ────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "active", "inactive", "suspended", "cancelled", "pending"] as const;
const TYPE_FILTERS   = ["all", "gym_member", "nac", "online_customer", "staff", "supplier"] as const;

// ── MembersTable ──────────────────────────────────────────────────────────────

export function MembersTable({ members: rows }: { members: MemberRow[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [search,       setSearch]       = useState("");

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.member_status !== statusFilter) return false;
    if (typeFilter   !== "all" && r.member_type   !== typeFilter)   return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !(r.full_name     ?? "").toLowerCase().includes(q) &&
        !(r.primary_email ?? "").toLowerCase().includes(q) &&
        !(r.primary_phone ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  return (
    <Card className="overflow-hidden">
      {/* Filter bar */}
      <div className="border-b px-4 py-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-48 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-1 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {s === "all" ? "All status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {t === "all" ? "All types" : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <DataTable columns={COLUMNS} data={filtered} />
    </Card>
  );
}
