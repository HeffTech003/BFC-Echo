// components/dashboard-charts-panel.tsx
// Drop into dashboard/page.tsx after the KPI cards.
// Receives pre-fetched arrays from the server component.
"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  StatusDonutChart,
  PaymentEventsChart,
  type StatusSlice,
  type PaymentEventPoint,
} from "@/components/charts";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberStatusRow = { member_status: string | null };
type PaymentEventRow = { event_type: string; occurred_at: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function last6MonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }));
  }
  return keys;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardChartsPanel({
  memberStatuses,
  paymentEvents,
}: {
  memberStatuses: MemberStatusRow[];
  paymentEvents: PaymentEventRow[];
}) {
  // Member status donut
  const donutData = useMemo<StatusSlice[]>(() => {
    const counts: Record<string, number> = {};
    for (const m of memberStatuses) {
      const s = m.member_status ?? "unknown";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    const order = ["active", "inactive", "suspended", "cancelled", "pending"];
    return [
      ...order.filter((s) => counts[s]).map((s) => ({ name: s, value: counts[s] })),
      ...Object.entries(counts)
        .filter(([s]) => !order.includes(s))
        .map(([s, v]) => ({ name: s, value: v })),
    ];
  }, [memberStatuses]);

  // Payment events per month (last 6)
  const months = useMemo(last6MonthKeys, []);
  const paymentChartData = useMemo<PaymentEventPoint[]>(() => {
    const paid: Record<string, number>   = {};
    const failed: Record<string, number> = {};
    for (const m of months) { paid[m] = 0; failed[m] = 0; }

    for (const e of paymentEvents) {
      const mk = monthKey(e.occurred_at);
      if (!months.includes(mk)) continue;
      if (e.event_type === "payment_paid")   paid[mk]   = (paid[mk]   ?? 0) + 1;
      if (e.event_type === "payment_failed") failed[mk] = (failed[mk] ?? 0) + 1;
    }

    return months.map((m) => ({ month: m, paid: paid[m] ?? 0, failed: failed[m] ?? 0 }));
  }, [paymentEvents, months]);

  const hasMembers = donutData.length > 0;
  const hasPayments = paymentChartData.some((d) => d.paid > 0 || d.failed > 0);

  if (!hasMembers && !hasPayments) return null;

  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2">
      {hasMembers && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Member status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDonutChart data={donutData} />
          </CardContent>
        </Card>
      )}

      {hasPayments && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium">Payments — last 6 months</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentEventsChart data={paymentChartData} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
