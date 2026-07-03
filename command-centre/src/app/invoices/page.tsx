import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatMoney, isoToday } from "@/lib/format";
import { updateInvoice } from "./actions";

export const metadata = { title: "Supplier Invoices — BFC Command Centre" };

const STATUS_VARIANT: Record<string, "warning" | "secondary" | "success" | "destructive" | "outline"> = {
  pending_review: "warning",
  reviewed: "secondary",
  paid: "success",
  disputed: "destructive",
  not_an_invoice: "outline",
};

export default async function InvoicesPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("supplier_invoices")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);

  await logAudit("supplier_invoices.view", "supplier_invoices");

  const invoices = data ?? [];
  const openStatuses = ["pending_review", "reviewed"];
  const open = invoices.filter((i) => openStatuses.includes(i.status));
  const done = invoices.filter((i) => !openStatuses.includes(i.status));
  const today = isoToday();

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Supplier Invoices</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        From the Gmail invoice scanner. Marking &ldquo;paid&rdquo; records that a human
        paid it via the bank/Xero — the platform never makes payments.
      </p>

      <h2 className="mb-2 font-medium">
        Needs attention <span className="text-muted-foreground">({open.length})</span>
      </h2>
      {open.length === 0 ? (
        <p className="text-muted-foreground mb-8 text-sm">Nothing outstanding.</p>
      ) : (
        <div className="mb-8 rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((inv) => {
                const overdue = inv.due_date && inv.due_date <= today;
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="font-medium">{inv.supplier ?? "—"}</div>
                      {inv.email_link && (
                        <a
                          href={inv.email_link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary text-xs underline-offset-4 hover:underline"
                        >
                          open email
                        </a>
                      )}
                    </TableCell>
                    <TableCell>{formatMoney(inv.amount, inv.currency)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {inv.invoice_reference ?? "—"}
                    </TableCell>
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>
                      {formatDate(inv.due_date)}
                      {overdue && " (due)"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>
                        {inv.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <form action={updateInvoice} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={inv.id} />
                        <select
                          name="status"
                          defaultValue={inv.status}
                          className="border-input h-8 rounded-md border bg-transparent px-2 text-xs"
                        >
                          <option value="pending_review">Pending review</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="paid">Paid (by human)</option>
                          <option value="disputed">Disputed</option>
                          <option value="not_an_invoice">Not an invoice</option>
                        </select>
                        <Input name="notes" placeholder="notes" className="h-8 w-36 text-xs" />
                        <Button size="sm" variant="outline" type="submit">
                          Save
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <h2 className="mb-2 font-medium">
        Resolved <span className="text-muted-foreground">({done.length})</span>
      </h2>
      {done.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {done.slice(0, 30).map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>
                {inv.status.replace(/_/g, " ")}
              </Badge>
              <span>{inv.supplier ?? "—"}</span>
              <span className="text-muted-foreground">
                {formatMoney(inv.amount, inv.currency)} · due {formatDate(inv.due_date)}
                {inv.notes ? ` · ${inv.notes}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
