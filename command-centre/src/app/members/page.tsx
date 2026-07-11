// app/members/page.tsx
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MembersTable, type MemberRow } from "./members-table";

export const metadata = { title: "Members — BFC Command Centre" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MembersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, primary_email, primary_phone, member_type, member_status, created_at, merged_into")
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

      {/* Interactive table — client component receives only serialisable data */}
      <MembersTable members={rows} />

      {rows.length === 1000 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing first 1 000 members.
        </p>
      )}
    </AppShell>
  );
}
