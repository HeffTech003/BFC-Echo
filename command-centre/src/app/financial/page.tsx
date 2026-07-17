// app/financial/page.tsx — Xero-inspired Business Overview
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, isoDaysAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Financial — Bendigo Fight Centre" };

// ── Australian FY ─────────────────────────────────────────────────────────────
function auFyStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}
function auFyLabel(): string {
  const y = Number(auFyStart().slice(0, 4));
  return `FY ${y}–${String(y + 1).slice(2)}`;
}

// ── Status styling ────────────────────────────────────────────────────────────
const STATUS_PILL: Record<string, string> = {
  PAID:       "bg-success/15 text-success-foreground",
  AUTHORISED: "bg-yellow-500/15 text-yellow-700",
  DRAFT:      "bg-muted text-muted-foreground",
  VOIDED:     "bg-muted text-muted-foreground",
};

type InvoiceRow = {
  id: number; xero_invoice_id: string; invoice_type: string;
  invoice_number: string | null; contact_name: string | null;
  status: string; date: string | null; due_date: string | null;
  total: number | null; amount_due: number | null; amount_paid: number | null;
};
type PaymentEventRow = {
  id: string; event_type: string; amount: number | null; occurred_at: string;
};

export default async function FinancialPage() {
  const profile  = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const fyStart       = auFyStart();
  const fyLabel       = auFyLabel();
  const rolling12Start = isoDaysAgo(365).slice(0, 10);
  const today         = new Date().toISOString().slice(0, 10);

  // ── Parallel fetch ────────────────────────────────────────────────────────
  const [invoiceRes, gcEventsRes] = await Promise.all([
    supabase
      .from("xero_invoices")
      .select("id, xero_invoice_id, invoice_type, invoice_number, contact_name, status, date, due_date, total, amount_due, amount_paid")
      .in("status", ["PAID", "AUTHORISED", "DRAFT", "VOIDED"])
      .order("date", { ascending: false })
      .limit(5000),

    supabase
      .from("payment_events")
      .select("id, event_type, amount, occurred_at")
      .in("event_type", ["payment_collected", "invoice_paid"])
      .gte("occurred_at", rolling12Start)
      .order("occurred_at", { ascending: false })
      .limit(2000),
  ]);

  await logAudit("xero_invoices.view", "xero_invoices");

  const invoices: InvoiceRow[] = invoiceRes.data ?? [];
  const gcEvents: PaymentEventRow[] = gcEventsRes.data ?? [];

  // ── Split AR vs AP ────────────────────────────────────────────────────────
  const accrec = invoices.filter(i => i.invoice_type === "ACCREC");
  const accpay = invoices.filter(i => i.invoice_type === "ACCPAY");

  const sum = (rows: InvoiceRow[], field: "total" | "amount_due" | "amount_paid") =>
    rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  // Revenue (Xero)
  const xeroRevYtd       = sum(accrec.filter(i => i.status === "PAID" && (i.date ?? "") >= fyStart), "total");
  const xeroRevRolling12 = sum(accrec.filter(i => i.status === "PAID" && (i.date ?? "") >= rolling12Start), "total");
  const xeroOutstanding  = sum(accrec.filter(i => i.status === "AUTHORISED"), "amount_due");
  const xeroOutstandingCount = accrec.filter(i => i.status === "AUTHORISED").length;

  // Expenses (Xero bills)
  const expYtd       = sum(accpay.filter(i => ["PAID","AUTHORISED"].includes(i.status) && (i.date ?? "") >= fyStart), "total");
  const expRolling12 = sum(accpay.filter(i => ["PAID","AUTHORISED"].includes(i.status) && (i.date ?? "") >= rolling12Start), "total");
  const billsOutstanding = sum(accpay.filter(i => i.status === "AUTHORISED"), "amount_due");
  const billsOutstandingCount = accpay.filter(i => i.status === "AUTHORISED").length;

  // GoCardless revenue (12 months)
  const gcRevRolling12 = gcEvents.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Total income
  const totalIncomeRolling12 = xeroRevRolling12 + gcRevRolling12;
  const netRolling12 = totalIncomeRolling12 - expRolling12;
  const netYtd       = xeroRevYtd - expYtd;

  // ── Monthly cashflow (12 months) ──────────────────────────────────────────
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return {
      key:      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label:    d.toLocaleDateString("en-AU", { month: "short" }),
      year:     d.toLocaleDateString("en-AU", { year: "2-digit" }),
      xeroRev:  0,
      expenses: 0,
      gc:       0,
    };
  });

  for (const inv of accrec) {
    if (inv.status !== "PAID" || !inv.date) continue;
    const mk = inv.date.slice(0, 7);
    const b = months.find(m => m.key === mk);
    if (b) b.xeroRev += Number(inv.total) || 0;
  }
  for (const inv of accpay) {
    if (!["PAID","AUTHORISED"].includes(inv.status) || !inv.date) continue;
    const mk = inv.date.slice(0, 7);
    const b = months.find(m => m.key === mk);
    if (b) b.expenses += Number(inv.total) || 0;
  }
  for (const e of gcEvents) {
    const mk = e.occurred_at.slice(0, 7);
    const b = months.find(m => m.key === mk);
    if (b) b.gc += Number(e.amount) || 0;
  }

  const maxBar = Math.max(...months.map(m => Math.max(m.xeroRev + m.gc, m.expenses)), 1);

  // ── Top customers ─────────────────────────────────────────────────────────
  const custMap: Record<string, number> = {};
  for (const inv of accrec.filter(i => i.status === "PAID")) {
    const name = inv.contact_name ?? "Unknown";
    custMap[name] = (custMap[name] ?? 0) + (Number(inv.total) || 0);
  }
  const topCustomers = Object.entries(custMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ── Top expense categories (by supplier) ─────────────────────────────────
  const supplierMap: Record<string, number> = {};
  for (const inv of accpay.filter(i => ["PAID","AUTHORISED"].includes(i.status))) {
    const name = inv.contact_name ?? "Unknown";
    supplierMap[name] = (supplierMap[name] ?? 0) + (Number(inv.total) || 0);
  }
  const topSuppliers = Object.entries(supplierMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // ── Recent lists ──────────────────────────────────────────────────────────
  const recentInvoices = accrec.filter(i => ["PAID","AUTHORISED"].includes(i.status)).slice(0, 50);
  const recentBills    = accpay.filter(i => ["PAID","AUTHORISED"].includes(i.status)).slice(0, 20);

  return (
    <AppShell profile={profile}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold">Financial</h1>
        <span className="text-sm text-muted-foreground">Xero + GoCardless · read-only</span>
        <div className="ml-auto flex gap-2">
          <Link href="/invoices" className="text-xs text-primary hover:underline">All invoices →</Link>
          <Link href="/expenses" className="text-xs text-primary hover:underline">Expenses →</Link>
          <Link href="/payments" className="text-xs text-primary hover:underline">Payments →</Link>
        </div>
      </div>

      {/* ── BUSINESS OVERVIEW (Xero-style) ──────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">

        {/* Total Income 12mo */}
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total income (12 mo)</div>
            <div className="text-xl font-bold text-green-600 tabular-nums">{formatMoney(totalIncomeRolling12)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Xero {formatMoney(xeroRevRolling12)} + GC {formatMoney(gcRevRolling12)}
            </div>
          </CardContent>
        </Card>

        {/* Expenses 12mo */}
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Expenses (12 mo)</div>
            <div className="text-xl font-bold text-orange-600 tabular-nums">{formatMoney(expRolling12)}</div>
            <div className="text-xs text-muted-foreground mt-1">{accpay.length} bills · {fyLabel}: {formatMoney(expYtd)}</div>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className={cn("border-l-4", netRolling12 >= 0 ? "border-l-green-500" : "border-l-destructive")}>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Net profit (12 mo)</div>
            <div className={cn("text-xl font-bold tabular-nums", netRolling12 >= 0 ? "text-green-600" : "text-destructive")}>
              {formatMoney(netRolling12)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{fyLabel}: {formatMoney(netYtd)}</div>
          </CardContent>
        </Card>

        {/* GoCardless */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">GoCardless (12 mo)</div>
            <div className="text-xl font-bold text-blue-600 tabular-nums">{formatMoney(gcRevRolling12)}</div>
            <div className="text-xs text-muted-foreground mt-1">{gcEvents.length} payment events</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Invoices owed / Bills to pay (Xero homepage style) ──────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Invoices owed to you</div>
            <div className="flex items-end gap-6">
              <div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{formatMoney(xeroOutstanding)}</div>
                <div className="text-xs text-muted-foreground">{xeroOutstandingCount} awaiting payment</div>
              </div>
              <div className="text-muted-foreground text-sm">
                {xeroOutstanding > 0
                  ? <span className="text-yellow-600 font-medium">⚠ {xeroOutstandingCount} overdue</span>
                  : <span className="text-green-600">✓ All collected</span>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Bills to pay</div>
            <div className="flex items-end gap-6">
              <div>
                <div className="text-2xl font-bold tabular-nums text-foreground">{formatMoney(billsOutstanding)}</div>
                <div className="text-xs text-muted-foreground">{billsOutstandingCount} awaiting payment</div>
              </div>
              <div className="text-muted-foreground text-sm">
                {billsOutstanding > 0
                  ? <span className="text-orange-600 font-medium">⚠ {billsOutstandingCount} unpaid</span>
                  : <span className="text-green-600">✓ All paid</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Cashflow Chart ──────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-4">
            Cashflow — last 12 months
            <div className="flex gap-4 ml-auto text-xs font-normal text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-500 inline-block" />Income (Xero)</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-blue-400 inline-block" />GoCardless</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-orange-400 inline-block" />Expenses</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Y-axis gridlines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ bottom: "24px", top: 0 }}>
              {[100, 75, 50, 25, 0].map(pct => {
                const yVal = maxBar * pct / 100;
                const yLabel = pct > 0
                  ? "$" + (yVal >= 1000 ? Math.round(yVal / 1000) + "k" : Math.round(yVal))
                  : "$0";
                return (
                  <div key={pct} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-14 text-right shrink-0">{yLabel}</span>
                    <div className="flex-1 border-t border-dashed border-border/40" />
                  </div>
                );
              })}
            </div>

            {/* Bars */}
            <div className="ml-16 flex items-end gap-1" style={{ height: "180px" }}>
              {months.map(m => {
                const totalIncome = m.xeroRev + m.gc;
                const incomeH = Math.max((m.xeroRev / maxBar) * 160, m.xeroRev > 0 ? 2 : 0);
                const gcH     = Math.max((m.gc / maxBar) * 160, m.gc > 0 ? 2 : 0);
                const expH    = Math.max((m.expenses / maxBar) * 160, m.expenses > 0 ? 2 : 0);
                const isCur   = m.key === today.slice(0, 7);
                const ttip    = m.label + " " + m.year + ": Income " + formatMoney(totalIncome) + ", Expenses " + formatMoney(m.expenses);
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center" title={ttip}>
                    <div className="w-full flex items-end justify-center gap-px" style={{ height: "160px" }}>
                      <div className="flex-1 flex flex-col items-center justify-end" style={{ height: "160px" }}>
                        <div className="w-full bg-green-500" style={{ height: incomeH + "px" }} />
                        <div className="w-full bg-blue-400" style={{ height: gcH + "px" }} />
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-end" style={{ height: "160px" }}>
                        <div className="w-full bg-orange-400" style={{ height: expH + "px" }} />
                      </div>
                    </div>
                    <div className={cn("text-[10px] mt-1 text-center", isCur ? "font-bold text-foreground" : "text-muted-foreground")}>
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Monthly breakdown ───────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Xero income</TableHead>
                <TableHead className="text-right">GoCardless</TableHead>
                <TableHead className="text-right">Total income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...months].reverse().map(m => {
                const totalInc = m.xeroRev + m.gc;
                const net = totalInc - m.expenses;
                const isCur = m.key === today.slice(0, 7);
                return (
                  <TableRow key={m.key} className={isCur ? "bg-muted/50" : ""}>
                    <TableCell className="font-medium">
                      {m.label} {m.year}
                      {isCur && <Badge variant="outline" className="ml-2 text-[10px]">Now</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(m.xeroRev)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(m.gc)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(totalInc)}</TableCell>
                    <TableCell className="text-right tabular-nums text-orange-600">{formatMoney(m.expenses)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-semibold", net >= 0 ? "text-green-600" : "text-destructive")}>
                      {formatMoney(net)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Top customers / suppliers ───────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top customers</CardTitle></CardHeader>
          <CardContent>
            {topCustomers.length === 0
              ? <p className="text-sm text-muted-foreground">No paid invoices yet</p>
              : <div className="space-y-2">
                  {topCustomers.map(([name, amt]) => {
                    const max = topCustomers[0] ? topCustomers[0][1] : 1;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="truncate max-w-[60%]">{name}</span>
                          <span className="tabular-nums text-muted-foreground">{formatMoney(amt)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: (amt / max * 100) + "%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top suppliers</CardTitle></CardHeader>
          <CardContent>
            {topSuppliers.length === 0
              ? <p className="text-sm text-muted-foreground">No bills yet</p>
              : <div className="space-y-2">
                  {topSuppliers.map(([name, amt]) => {
                    const max = topSuppliers[0] ? topSuppliers[0][1] : 1;
                    return (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className="truncate max-w-[60%]">{name}</span>
                          <span className="tabular-nums text-muted-foreground">{formatMoney(amt)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-orange-400 rounded-full" style={{ width: (amt / max * 100) + "%" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </CardContent>
        </Card>
      </div>

      {/* ── Recent customer invoices ──────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent customer invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentInvoices.map(inv => {
                const isOverdue = inv.status === "AUTHORISED" && inv.due_date != null && inv.due_date < today;
                return (
                  <TableRow key={inv.id} className={isOverdue ? "bg-red-50/50" : ""}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{inv.contact_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatDate(inv.date)}</TableCell>
                    <TableCell className={cn("text-sm", isOverdue ? "text-destructive font-medium" : "")}>
                      {formatDate(inv.due_date)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_PILL[inv.status] ?? "bg-muted text-muted-foreground")}>
                        {inv.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMoney(inv.total)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-sm", inv.amount_due && inv.amount_due > 0 ? "text-warning-foreground" : "text-muted-foreground")}>
                      {formatMoney(inv.amount_due)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Recent supplier bills ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent supplier bills</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBills.map(inv => {
                const isOverdue = inv.status === "AUTHORISED" && inv.due_date != null && inv.due_date < today;
                return (
                  <TableRow key={inv.id} className={isOverdue ? "bg-orange-50/50" : ""}>
                    <TableCell className="font-mono text-xs">{inv.invoice_number ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{inv.contact_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{formatDate(inv.date)}</TableCell>
                    <TableCell className={cn("text-sm", isOverdue ? "text-destructive font-medium" : "")}>
                      {formatDate(inv.due_date)}
                    </TableCell>
                    <TableCell>
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_PILL[inv.status] ?? "bg-muted text-muted-foreground")}>
                        {inv.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatMoney(inv.total)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums text-sm", inv.amount_due && inv.amount_due > 0 ? "text-orange-600" : "text-muted-foreground")}>
                      {formatMoney(inv.amount_due)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </AppShell>
  );
}
