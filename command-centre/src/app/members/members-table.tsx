"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
  nac:             "NAC",
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

export function MembersTable({ members }: { members: MemberRow[] }) {
  return (
    <DataTable
      data={members}
      columns={COLUMNS}
      searchPlaceholder="Search name, email, phone…"
 