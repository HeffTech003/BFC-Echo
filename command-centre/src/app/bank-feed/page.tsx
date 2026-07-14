import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BankFeedClient from "./bank-feed-client";

export const dynamic = "force-dynamic";

type Txn = {
  id: string;
  date: string;
  description: string | null;
  reference: string | null;
  amount_cents: number;
  account_name: string | null;
  is_reconciled: boolean;
  source: string;
};

export default async function BankFeedPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

  const [{ data: recent }, { data: all90 }, { count: totalRows }] = await Promise.all([
    supabase.from("bank_transactions").select("id, date, description, reference, amount_cents, account_name, is_reconciled, source")
      .gte("date", thirtyDaysAgo).order("date", { ascending: false }).limit(200),
    supabase.from("bank_transactions").select("amount_cents").gte("date", ninetyDaysAgo),
    supabase.from("bank_transactions").select("*", { count: "exact", head: true }),
  ]);

  const txns = (recent ?? []) as Txn[];

  const inflow30  = txns.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
  const outflow30 = txns.filter((t) => t.amount_cents < 0).reduce((s, t) => s + Math.abs(t.amount_cents), 0);
  const net30     = inflow30 - outflow30;

  const inflow90  = (all90 ?? []).filter((t) => t.amount_cents > 0).reduce((s: number, t) => s + t.amount_cents, 0);
  const outflow90 = (all90 ?? []).filter((t) => t.amount_cents < 0).reduce((s: number, t) => s + Math.abs(t.amount_cents), 0);

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bank Feed</h1>
            <p className="text-sm text-muted-foreground">
              Real cash flow from Xero · {totalRows ?? 0} total transactions
            </p>
          </div>
          <BankFeedClient syncButton />
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Inflow (30d)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-green-600">+${(inflow30 / 100).toFixed(2)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Outflow (30d)</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold text-red-600">−${(outflow30 / 100).toFixed(2)}</p></CardContent>
          </Card>
          <Card className={net30 >= 0 ? "border-green-200" : "border-red-200"}>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Net (30d)</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${net30 >= 0 ? "text-green-600" : "text-red-600"}`}>
                {net30 >= 0 ? "+" : "−"}${(Math.abs(net30) / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Net (90d)</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${inflow90 >= outflow90 ? "text-green-600" : "text-red-600"}`}>
                {inflow90 >= outflow90 ? "+" : "−"}${(Math.abs(inflow90 - outflow90) / 100).toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Transactions (last 30 days)</CardTitle>
              <span className="text-sm text-muted-foreground">{txns.length} shown</span>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {txns.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p className="mb-2">No transactions yet.</p>
                <p className="text-sm">Click <strong>Sync from Xero</strong> to pull your bank data.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Description</th>
                    <th className="px-4 py-2 text-left font-medium">Account</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <div className="truncate">{t.description ?? "—"}</div>
                        {t.reference && <div className="text-xs text-muted-foreground truncate">Ref: {t.reference}</div>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{t.account_name ?? "—"}</td>
                      <td className={`px-4 py-2 text-right font-medium tabular-nums ${t.amount_cents >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {t.amount_cents >= 0 ? "+" : "−"}${(Math.abs(t.amount_cents) / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${t.is_reconciled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {t.is_reconciled ? "Reconciled" : "Pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
