// app/expenses/page.tsx
// Supplier bills from Xero (invoice_type = 'ACCPAY') — one-off payments to suppliers.
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
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Expenses — Bendigo Fight Centre" };

const STATUS_COLOURS: Record<string, string> = {
  PAID:       "bg-success/15 text-success-foreground",
  AUTHORISED: "bg-warning/15 text-warning-foreground",
  DRAFT:      "bg-muted text-muted-foreground",
  VOIDED:     "bg-muted text-muted-foreground",
  DELETED:    "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  PAID:       "Paid",
  AUTHORISED: "Unpaid",
  DRAFT:      "Draft",
  VOIDED:     "Voided",
  DELETED:    "Deleted",
};

// Financial year helper — July 1 of current or previous year
function fyStart(): string {
  const now = new Date();
  const fyYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyYear}-07-01`;
}

const today = new Date().toISOString().slice(0, 10);

export default async function ExpensesPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const [allBillsRes, overdueRes] = await Promise.all([
    // All supplier bills — most recent first
    supabase
      .from("xero_invoices")
      .select("id, xero_invoice_id, invoice_number, contact_name, status, date, due_date, total, amount_due, amount_paid")
      .eq("invoice_type", "ACCPAY")
      .order("date", { ascending: false })
      .limit(500),

    // Overdue unpaid bills
    supabase
      .from("xero_invoices")
      .select("id, invoice_number, contact_name, amount_due, due_date")
      .eq("invoice_type", "ACCPAY")
      .eq("status", "AUTHORISED")
      .lt("due_date", today)
      .order("due_date"),
  ]);

  const bills   = allBillsRes.data ?? [];
  const overdue = overdueRes.data ?? [];

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const fyS = fyStart();
  const fyBills    = bills.filter(b => (b.date ?? "") >= fyS);
  const totalPaidFY    = fyBills.filter(b => b.status === "PAID").reduce((s, b) => s + (Number(b.total) || 0), 0);
  const totalUnpaid    = bills.filter(b => b.status === "AUTHORISED").reduce((s, b) => s + (Number(b.amount_due) || 0), 0);
  const overdueTotal   = overdue.reduce((s, b) => s + (Number(b.amount_due) || 0), 0);

  // ── Supplier breakdown (top spends this FY) ───────────────────────────────
  const supplierTotals: Record<string, number> = {};
  for (const b of fyBills) {
    if (b.status === "PAID" && b.contact_name) {
      supplierTotals[b.contact_name] = (supplierTotals[b.contact_name] ?? 0) + (Number(b.total) || 0);
    }
  }
  const topSuppliers = Object.entries(supplierTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <span className="text-muted-foreground text-sm">Xero supplier bills</span>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className="text-2xl font-semibold tabular-nums">{formatMoney(totalPaidFY)}</div>
            <div className="text-sm font-medium mt-0.5">Paid this FY</div>
            <div className="text-xs text-muted-foreground">from {fyS}</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn("text-2xl font-semibold tabular-nums", totalUnpaid > 0 ? "text-warning-foreground" : "text-foreground")}>
              {formatMoney(totalUnpaid)}
            </div>
            <div className="text-sm font-medium mt-0.5">Outstanding</div>
            <div className="text-xs text-muted-foreground">awaiting payment</div>
          </CardContent>
        </Card>
        <Card className="py-4 gap-1">
          <CardContent className="px-4">
            <div className={cn("text-2xl font-semibold tabular-nums", overdueTotal > 0 ? "text-destructive" : "text-foreground")}>
              {formatMoney(overdueTotal)}
            </div>
            <div className="text-sm font-medium mt-0.5">Overdue</div>
            <div className="text-xs text-muted-foreground">{overdue.length} bills past due date</div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue bills alert */}
      {overdue.length > 0 && (
        <Card className="mb-6 border-warning/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Overdue bills
              <Badge className="bg-warning/15 text-warning-foreground font-normal text-xs">
                {formatMoney(overdueTotal)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map(b => {
                  const daysOver = b.due_date
                    ? Math.floor((Date.now() - new Date(b.due_date).getTime()) / 86_400_000)
                    : 0;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.contact_name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{b.invoice_number ?? "—"}</TableCell>
                      <TableCell>
                        <span className={cn("text-sm", daysOver >= 30 ? "text-destructive font-medium" : "text-warning-foreground")}>
                          {b.due_date ? formatDate(b.due_date) : "—"}
                          {daysOver > 0 && <span className="ml-1 text-xs">({daysOver}d)</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(Number(b.amount_due))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top suppliers this FY */}
        {topSuppliers.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top suppliers this FY</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSuppliers.map(([name, total]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* All bills */}
        <Card className={topSuppliers.length > 0 ? "" : "lg:col-span-2"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              All bills
              <Badge variant="secondary" className="font-normal text-xs">{bills.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {bills.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">
                No supplier bills found. Check Xero sync (WF18) is running.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.contact_name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {b.invoice_number ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.date ? formatDate(b.date) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("font-normal text-xs", STATUS_COLOURS[b.status ?? ""] ?? "")}
                          >
                            {STATUS_LABEL[b.status ?? ""] ?? b.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(Number(b.total))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Data synced from Xero via n8n WF18. Bills = accounts payable (ACCPAY).
      </p>
    </AppShell>
  );
}
