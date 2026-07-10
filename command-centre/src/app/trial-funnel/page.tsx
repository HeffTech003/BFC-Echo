// app/trial-funnel/page.tsx
// Shows the lead → trial → active member conversion pipeline.
// Assumes a `leads` table with columns: id, full_name, email, phone, status,
// source, created_at, converted_at, member_id (nullable, set on conversion).
// Adjust column names below if your schema differs.

import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FunnelChart } from "@/components/funnel-chart";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trial Funnel — BFC Command Centre" };

const nDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

// Lead status stages — adjust to match your leads table values
const FUNNEL_STAGES = [
  { key: "new",        label: "Enquiry",    colour: "bg-primary/15 text-primary" },
  { key: "contacted",  label: "Contacted",  colour: "bg-primary/20 text-primary" },
  { key: "trial",      label: "Trial",      colour: "bg-warning/15 text-warning-foreground" },
  { key: "converted",  label: "Converted",  colour: "bg-success/15 text-success-foreground" },
  { key: "lost",       label: "Lost",       colour: "bg-muted text-muted-foreground" },
];

type Lead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
  converted_at: string | null;
  member_id: string | null;
};

export default async function TrialFunnelPage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const [leadsRes, recentConversionsRes] = await Promise.all([
    // All leads — we aggregate client-side for funnel
    supabase
      .from("leads")
      .select("id, full_name, email, phone, status, source, created_at, converted_at, member_id")
      .order("created_at", { ascending: false })
      .limit(500),

    // Recently converted in last 90 days (for conversion rate context)
    supabase
      .from("leads")
      .select("id, full_name, converted_at, source")
      .eq("status", "converted")
      .gte("converted_at", nDaysAgo(90))
      .order("converted_at", { ascending: false })
      .limit(20),
  ]);

  const leads: Lead[] = leadsRes.data ?? [];
  const recentConversions = recentConversionsRes.data ?? [];

  // ── Funnel counts ────────────────────────────────────────────────────────

  const stageCounts: Record<string, number> = {};
  for (const l of leads) {
    const s = l.status ?? "new";
    stageCounts[s] = (stageCounts[s] ?? 0) + 1;
  }

  const activeStages = FUNNEL_STAGES.filter(s => s.key !== "lost");
  const funnelData = activeStages.map(s => ({
    label: s.label,
    value: stageCounts[s.key] ?? 0,
    colour: s.colour,
  }));

  const totalInPipeline = leads.filter(l => !["converted", "lost"].includes(l.status ?? "")).length;
  const totalConverted  = stageCounts["converted"] ?? 0;
  const totalLost       = stageCounts["lost"] ?? 0;
  const conversionRate  = (totalConverted + totalLost) > 0
    ? ((totalConverted / (totalConverted + totalLost)) * 100).toFixed(1)
    : "—";

  // Avg days to convert
  const conversionTimes = leads
    .filter(l => l.status === "converted" && l.converted_at && l.created_at)
    .map(l => Math.floor(
      (new Date(l.converted_at!).getTime() - new Date(l.created_at).getTime()) / 86_400_000
    ))
    .filter(d => d >= 0 && d < 365);
  const avgDaysToConvert = conversionTimes.length > 0
    ? Math.round(conversionTimes.reduce((s, d) => s + d, 0) / conversionTimes.length)
    : null;

  // Source breakdown
  const sourceCounts: Record<string, number> = {};
  for (const l of leads) {
    const src = l.source ?? "unknown";
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  }
  const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Active pipeline (not converted/lost)
  const activePipeline = leads.filter(l => !["converted", "lost"].includes(l.status ?? ""));

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Trial Funnel</h1>
        <span className="text-muted-foreground text-sm">lead → member conversion</span>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">{totalInPipeline}</div>
            <div className="text-sm font-medium mt-0.5">In pipeline</div>
            <div className="text-xs text-muted-foreground">active leads</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-success-foreground">
              {conversionRate}{conversionRate !== "—" ? "%" : ""}
            </div>
            <div className="text-sm font-medium mt-0.5">Conversion rate</div>
            <div className="text-xs text-muted-foreground">{totalConverted} converted · {totalLost} lost</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {avgDaysToConvert ?? "—"}
              {avgDaysToConvert && <span className="text-base font-normal text-muted-foreground">d</span>}
            </div>
            <div className="text-sm font-medium mt-0.5">Avg to convert</div>
            <div className="text-xs text-muted-foreground">enquiry → member</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums text-primary">
              {recentConversions.length}
            </div>
            <div className="text-sm font-medium mt-0.5">New members</div>
            <div className="text-xs text-muted-foreground">last 90 days</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Funnel chart + source breakdown ──────────────────────────────── */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline stages</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnelData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Lead sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topSources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No source data.</p>
              ) : (
                topSources.map(([source, count]) => {
                  const pct = leads.length > 0
                    ? Math.round((count / leads.length) * 100)
                    : 0;
                  return (
                    <div key={source}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm capitalize">{source}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Active pipeline table ─────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            Active pipeline
            <Badge variant="secondary" className="font-normal text-xs">
              {activePipeline.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activePipeline.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Pipeline is empty.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Enquired</TableHead>
                  <TableHead>Days in pipeline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePipeline.map(lead => {
                  const daysIn = Math.floor(
                    (Date.now() - new Date(lead.created_at).getTime()) / 86_400_000
                  );
                  const stage = FUNNEL_STAGES.find(s => s.key === lead.status);
                  return (
                    <TableRow key={lead.id} className="relative cursor-pointer hover:bg-muted/40">
                      <TableCell className="font-medium">
                        {lead.member_id ? (
                          <Link
                            href={`/members/${lead.member_id}`}
                            className="hover:underline before:absolute before:inset-0"
                          >
                            {lead.full_name ?? "Unknown"}
                          </Link>
                        ) : (
                          lead.full_name ?? "Unknown"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn("font-normal text-xs", stage?.colour ?? "")}
                        >
                          {stage?.label ?? lead.status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{lead.source ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.email ?? lead.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(lead.created_at)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-sm tabular-nums",
                          daysIn > 30 ? "text-destructive font-medium" : "text-muted-foreground"
                        )}>
                          {daysIn}d
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Recent conversions ────────────────────────────────────────────── */}
      {recentConversions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent conversions (90d)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Converted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentConversions.map(lead => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.full_name ?? "—"}</TableCell>
                    <TableCell className="text-sm capitalize">{lead.source ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.converted_at ? formatDate(lead.converted_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
