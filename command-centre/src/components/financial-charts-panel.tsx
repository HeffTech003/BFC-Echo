// components/financial-charts-panel.tsx
// Drop this component into financial/page.tsx after the summary cards section.
// It receives the full invoice array (already fetched server-side) and builds
// chart data client-side, so no extra DB queries are needed.
"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RevenueTrendChart,
  MonthlyBarChart,
  type RevenueTrendPoint,
  type MonthlyBarPoint,
} from "@/components/charts";

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceRow = {
  invoice_type: string;
  status: string;
  date: string | null;
  total: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function last12MonthKeys(): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }));
  }
  return keys;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FinancialChartsPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const months = last12MonthKeys();

  const trendData = useMemo<RevenueTrendPoint[]>(() => {
    const rev: Record<string, number> = {};
    const exp: Record<string, number> = {};
    for (const m of months) { rev[m] = 0; exp[m] = 0; }

    for (const inv of invoices) {
      if (!inv.date || inv.status !== "PAID") continue;
      const mk = monthKey(inv.date);
      if (!months.includes(mk)) continue;
      const amt = Number(inv.total) || 0;
      if (inv.invoice_type === "ACCREC") rev[mk] = (rev[mk] ?? 0) + amt;
      if (inv.invoice_type === "ACCPAY") exp[mk] = (exp[mk] ?? 0) + amt;
    }

    return months.map((m) => ({ month: m, revenue: rev[m] ?? 0, expenses: exp[m] ?? 0 }));
  }, [invoices, months]);

  const netData = useMemo<MonthlyBarPoint[]>(() => {
    return trendData.map((d) => ({
      month: d.month,
      value: d.revenue - d.expenses,
    }));
  }, [trendData]);

  const hasData = trendData.some((d) => d.revenue > 0 || d.expenses > 0);
  if (!hasData) return null;

  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2">
      {/* Revenue vs Expenses */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium">Revenue vs Expenses — last 12 months</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueTrendChart data={trendData} />
        </CardContent>
      </Card>

      {/* Net P&L bar */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium">Net P&L by month</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart data={netData} label="Net" />
        </CardContent>
      </Card>

      {/* Monthly revenue bar */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium">Monthly revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart
            data={trendData.map((d) => ({ month: d.month, value: d.revenue }))}
            label="Revenue"
          />
        </CardContent>
      </Card>
    </div>
  );
}
