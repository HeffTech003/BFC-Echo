import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, isoDaysAgo } from "@/lib/format";

export const metadata = { title: "Financial — Bendigo Fight Centre" };

/** Australian FY starts July 1 */
function auFyStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

const STATUS_COLOURS: Record<string, string> = {
  PAID: "bg-success/15 text-success-foreground",
  AUTHORISED: "bg-warning/15 text-warning-foreground",
  DRAFT: "bg-muted text-muted-foreground",
  VOIDED: "bg-muted text-muted-foreground",
};

type InvoiceRow = {
  id: number;
  xero_invoice_id: string;
  invoice_type: string;
  invoice_number: string | null;
  contact_name: string | null;
  status: string;
  date: string | null;
  due_date: string | null;
  total: number | null;
  amount_due: number | null;
  amount_paid: number | null;
};

export default async function FinancialPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const fyStart = auFyStart();
  const rolling12Start = isoDaysAgo(365).slice(0, 10);

  // Fetch all invoices needed for aggregation + display
  const { data: allInvoices, error } = await supabase
    .from("xero_invoices")
    .select(
      "id, xero_invoice_id, invoice_type, invoice_number, contact_name, status, date, due_date, total, amount_due, amount_paid"
    )
    .in("status", ["PAID", "AUTHORISED", "DRAFT", "VOIDED"])
    .order("date", { ascending: false })
    .limit(5000);

  await logAudit("xero_invoices.view", "xero_invoices");

  const invoices: InvoiceRow[] = allInvoices ?? [];
  const hasData = !error && invoices.length > 0;

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const accrec = invoices.filter((i) => i.invoice_type === "ACCREC");
  const accpay = invoices.filter((i) => i.invoice_type === "ACCPAY");

  const sumTotal = (rows: InvoiceRow[]) =>
    rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const sumAmountDue = (rows: InvoiceRow[]) =>
    rows.reduce((s, r) => s + (Number(r.amount_due) || 0), 0);

  // Revenue
  const revenueYtd = sumTotal(
    accrec.filter((i) => i.status === "PAID" && (i.date ?? "") >= fyStart)
  );
  const revenueRolling12 = sumTotal(
    accrec.filter((i) => i.status === "PAID" && (i.date ?? "") >= rolling12Start)
  );
  const revenueOutstanding = sumAmountDue(
    accrec.filter((i) => i.status === "AUTHORISED")
  );
  const revenueOutstandingCount = accrec.filter((i) => i.status === "AUTHORISED").length;

  // Expenses (bills) — includes PAID + AUTHORISED (bills entered in Xero, whether or
  // not Xero bank reconciliation has been done). This gives a full committed-expense view.
  // PAID bills = cash actually transferred; AUTHORISED = approved but not yet reconciled in Xero.
  const expensesYtd = sumTotal(
    accpay.filter((i) => ["PAID", "AUTHORISED"].includes(i.status) && (i.date ?? "") >= fyStart)
  );
  const expensesRolling12 = sumTotal(
    accpay.filter((i) => ["PAID", "AUTHORISED"].includes(i.status) && (i.date ?? "") >= rolling12Start)
  );
  const expensesOutstanding = sumAmountDue(
    accpay.filter((i) => i.status === "AUTHORISED")
  );
  const expensesOutstandingCount = accpay.filter((i) => i.status === "AUTHORISED").length;

  // Net P&L
  const netYtd = revenueYtd - expensesYtd;
  const netRolling12 = revenueRolling12 - expensesRolling12;

  // Recent transactions for the table
  const recentInvoices = accrec
    .filter((i) => i.status === "PAID" || i.status === "AUTHORISED")
    .slice(0, 50);
  const recentBills = accpay
    .filter((i) => i.status === "PAID" || i.status === "AUTHORISED")
    .slice(0, 20);

  const fyLabel = (() => {
    const y = Number(auFyStart().slice(0, 4));
    return `FY ${y}–${String(y + 1).slice(2)}`;
  })();

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Financial</h1>
        <span className="text-muted-foreground text-sm">Xero data · read-only</span>
      </div>

      {!hasData && (
        <div className="bg-muted/40 mb-8 rounded-md p-4 text-sm">
          No Xero invoice data found. Run WF18 (Xero Financial Sync) in n8n to populate.
        </div>
      )}

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-base font-semibold">P&amp;L summary</h2>
        <span className="text-muted-foreground text-xs">rolling 12 months · {fyLabel} YTD</span>
      </div>
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {/* Revenue */}
        <Card className="border-l-4 border-l-success gap-2 py-4">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(revenueRolling12)}
            </div>
            <div className="mt-0.5 text-sm font-medium">Revenue (12 mo)</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {fyLabel}: {formatMoney(revenueYtd)}
            </div>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card className="border-l-4 border-l-warning gap-2 py-4">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(expensesRolling12)}
            </div>
            <div className="mt-0.5 text-sm font-medium">Expenses (12 mo)</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {fyLabel}: {formatMoney(expensesYtd)} · paid + committed
            </div>
          </CardContent>
        </Card>

        {/* Net */}
        <Card
          className={
            "border-l-4 gap-2 py-4 " +
            (netRolling12 >= 0 ? "border-l-success" : "border-l-destructive")
          }
        >
          <CardContent className="px-4">
            <div
              className={
                "text-2xl font-semibold tabular-nums " +
                (netRolling12 >= 0 ? "text-success" : "text-destructive")
              }
            >
              {formatMoney(netRolling12)}
            </div>
            <div className="mt-0.5 text-sm font-medium">Net (12 mo)</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {fyLabel}: {formatMoney(netYtd)}
            </div>
          </CardContent>
        </Card>

        {/* Outstanding revenue */}
        <Card
          className={
            "border-l-4 gap-2 py-4 " +
            (revenueOutstanding > 0 ? "border-l-warning" : "border-l-border")
          }
        >
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(revenueOutstanding)}
            </div>
            <div className="mt-0.5 text-sm font-medium">Outstanding invoices</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {revenueOutstandingCount} authorised, not yet paid
            </div>
          </CardContent>
        </Card>

        {/* Outstanding bills */}
        <Card
          className={
            "border-l-4 gap-2 py-4 " +
            (expensesOutstanding > 0 ? "border-l-destructive" : "border-l-border")
          }
        >
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(expensesOutstanding)}
            </div>
            <div className="mt-0.5 text-sm font-medium">Outstanding bills</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {expensesOutstandingCount} unpaid supplier bills
            </div>
          </CardContent>
        </Card>

        {/* Invoice count */}
        <Card className="border-l-4 border-l-border gap-2 py-4">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">
              {accrec.length}
            </div>
            <div className="mt-0.5 text-sm font-medium">Total invoices</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {accpay.length} bills synced from Xero
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recent invoices ─────────────────────────────────────────────────── */}
      <h2 className="mb-2 text-base font-semibold">
        Customer invoices{" "}
        <span className="text-muted-foreground font-normal">
          (most recent {recentInvoices.length})
        </span>
      </h2>
      {recentInvoices.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">No invoice data yet.</p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">
                    {inv.invoice_number ?? inv.xero_invoice_id.slice(0, 8) + "…"}
                  </TableCell>
                  <TableCell>{inv.contact_name ?? "—"}</TableCell>
                  <TableCell>{formatDate(inv.date)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.amount_paid)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs font-medium " +
                        (STATUS_COLOURS[inv.status] ?? "bg-muted text-muted-foreground")
                      }
                    >
                      {inv.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Recent bills ────────────────────────────────────────────────────── */}
      <h2 className="mb-2 text-base font-semibold">
        Supplier bills{" "}
        <span className="text-muted-foreground font-normal">
          (most recent {recentBills.length})
        </span>
      </h2>
      {recentBills.length === 0 ? (
        <p className="text-muted-foreground text-sm">No bill data yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBills.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">
                    {inv.invoice_number ?? inv.xero_invoice_id.slice(0, 8) + "…"}
                  </TableCell>
                  <TableCell>{inv.contact_name ?? "—"}</TableCell>
                  <TableCell>{formatDate(inv.date)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(inv.amount_due)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs font-medium " +
                        (STATUS_COLOURS[inv.status] ?? "bg-muted text-muted-foreground")
                      }
                    >
                      {inv.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
