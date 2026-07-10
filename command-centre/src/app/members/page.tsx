// app/members/page.tsx
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Members — BFC Command Centre" };

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  member_type: string | null;
  member_status: string | null;
  joined_at: string | null;
  merged_into: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Column definitions (defined outside component so they're stable) ──────────

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
    key: "email",
    header: "Email",
    className: "hidden sm:table-cell text-sm text-muted-foreground max-w-[200px] truncate",
    headClassName: "hidden sm:table-cell",
    cell: (row) => (
      <span className="truncate block max-w-[200px]">{row.email ?? "—"}</span>
    ),
  },
  {
    key: "phone",
    header: "Phone",
    className: "hidden md:table-cell text-sm text-muted-foreground",
    headClassName: "hidden md:table-cell",
    sortable: false,
    cell: (row) => <span>{row.phone ?? "—"}</span>,
  },
  {
    key: "joined_at",
    header: "Joined",
    className: "hidden lg:table-cell text-sm text-muted-foreground",
    headClassName: "hidden lg:table-cell",
    cell: (row) => <span>{row.joined_at ? formatDate(row.joined_at) : "—"}</span>,
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MembersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, email, phone, member_type, member_status, joined_at, merged_into")
    .is("merged_into", null)
    .order("full_name")
    .limit(1000);

  const rows: MemberRow[] = members ?? [];

  // Status summary counts
  const counts: Record<string, number> = {};
  for (const m of rows) {
    const s = m.member_status ?? "unknown";
    counts[s] = (counts[s] ?? 0) + 1;
  }

  const statChips = [
    { label: "active",    className: "text-success-foreground" },
    { label: "suspended", className: "text-warning-foreground" },
    { label: "cancelled", className: "text-destructive" },
    { label: "inactive",  className: "text-muted-foreground" },
  ].filter(({ label }) => counts[label]);

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Members</h1>
        <span className="text-muted-foreground text-sm">{rows.length} total</span>
      </div>

      {/* Status summary */}
      <div className="mb-6 flex flex-wrap gap-3">
        {statChips.map(({ label, className }) => (
          <Card key={label} className="flex items-baseline gap-2 px-4 py-3 min-w-[90px]">
            <span className={cn("text-xl font-semibold tabular-nums", className)}>
              {counts[label]}
            </span>
            <span className="text-sm text-muted-foreground capitalize">{label}</span>
          </Card>
        ))}
        {/* NAC count */}
        {(() => {
          const nac = rows.filter((r) => r.member_type === "nac").length;
          if (!nac) return null;
          return (
            <Card className="flex items-baseline gap-2 px-4 py-3 min-w-[90px]">
              <span className="text-xl font-semibold tabular-nums">{nac}</span>
              <span className="text-sm text-muted-foreground">NAC</span>
            </Card>
          );
        })()}
      </div>

      {/* Interactive table — client component */}
      <DataTable
        data={rows as unknown as Record<string, unknown>[]}
        columns={COLUMNS as DataTableColumn<Record<string, unknown>>[]}
        searchPlaceholder="Search name, email, phone…"
        emptyMessage="No members found."
      />

      {rows.length === 1000 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing first 1 000 members.
        </p>
      )}
    </AppShell>
  );
}
