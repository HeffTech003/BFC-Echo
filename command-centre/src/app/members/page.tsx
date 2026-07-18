// app/members/page.tsx
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { MembersTable, type MemberRow } from "./members-table";

export const metadata = { title: "Members — Bendigo Fight Centre" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function MembersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Exclude Xero-only contacts/suppliers — they're payees, not gym members.
  const MEMBER_TYPES = ["gym_member", "nac", "online_customer", "staff"];

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, primary_email, primary_phone, member_type, member_status, joined_at, merged_into")
    .is("merged_into", null)
    .in("member_type", MEMBER_TYPES)
    .order("full_name")
    .limit(1000);

  const rows: MemberRow[] = members ?? [];

  // Stat counts (derived from client data, no extra DB round trips)
  const active       = rows.filter(r => r.member_status === "active");
  const gymActive    = active.filter(r => r.member_type === "gym_member").length;
  const nacActive    = active.filter(r => r.member_type === "nac").length;
  const onlineActive = active.filter(r => r.member_type === "online_customer").length;
  const inactive     = rows.filter(r => ["inactive","cancelled","suspended"].includes(r.member_status ?? "")).length;

  return (
    <AppShell profile={profile}>
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Members</h1>
        <span className="text-muted-foreground text-sm">{rows.length} total</span>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{gymActive}</div>
            <div className="mt-1 text-sm font-medium">Gym members</div>
            <div className="text-xs text-muted-foreground mt-0.5">active</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{nacActive}</div>
            <div className="mt-1 text-sm font-medium">Non-attending</div>
            <div className="text-xs text-muted-foreground mt-0.5">active NAC</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-warning">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{onlineActive}</div>
            <div className="mt-1 text-sm font-medium">Online customers</div>
            <div className="text-xs text-muted-foreground mt-0.5">active</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{inactive}</div>
            <div className="mt-1 text-sm font-medium">Inactive / lapsed</div>
            <div className="text-xs text-muted-foreground mt-0.5">cancelled or suspended</div>
          </CardContent>
        </Card>
      </div>

      {/* MembersTable renders its own interactive filter chips + table */}
      <MembersTable members={rows} />

      {rows.length === 1000 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Showing first 1 000 members.
        </p>
      )}
    </AppShell>
  );
}
