// app/(portal)/portal/page.tsx
// Member-facing self-service portal.
// Members log in via Supabase Auth (email magic link or password).
// They see their own data only — enforced by RLS on the Supabase side.
//
// ROUTE GROUP: (portal) — separate layout from the staff Command Centre.
// Create app/(portal)/layout.tsx with a minimal layout (no AppShell).
//
// RLS SETUP REQUIRED in Supabase:
//   -- Members can only read their own row (matched by email):
//   CREATE POLICY "member_self_read" ON members FOR SELECT
//   USING (email = auth.jwt() ->> 'email');
//
//   -- Same for memberships, payment_events, xero_invoices (via join):
//   CREATE POLICY "member_own_memberships" ON memberships FOR SELECT
//   USING (member_id IN (SELECT id FROM members WHERE email = auth.jwt() ->> 'email'));
//
//   CREATE POLICY "member_own_payments" ON payment_events FOR SELECT
//   USING (member_id IN (SELECT id FROM members WHERE email = auth.jwt() ->> 'email'));

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { PortalSignOut } from "@/components/portal-sign-out";
import StripePortalButton from "./stripe-portal-button";

const STATUS_COLOURS: Record<string, string> = {
  active:    "bg-success/15 text-success-foreground",
  inactive:  "bg-muted text-muted-foreground",
  suspended: "bg-warning/15 text-warning-foreground",
  cancelled: "bg-destructive/15 text-destructive",
  PAID:      "bg-success/15 text-success-foreground",
  AUTHORISED:"bg-warning/15 text-warning-foreground",
};

export default async function PortalPage() {
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const userEmail = user.email;

  // Fetch member record for this user
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, primary_email, primary_phone, member_type, member_status, created_at")
    .eq("primary_email", userEmail)
    .single();

  if (!member) {
    // Authenticated but no matching member — show a holding page
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center p-8">
          <h1 className="text-xl font-semibold mb-2">Account not linked</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Your email ({userEmail}) isn't linked to a membership record yet.
            Please contact us at the gym and we'll get it sorted.
          </p>
          <PortalSignOut />
        </Card>
      </div>
    );
  }

  // Parallel data fetch (RLS ensures member sees only their own rows)
  const [membershipsRes, paymentEventsRes, xeroContactRes, bookingsRes, gradingsRes, merchOrdersRes] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, plan_name, billing_provider, status, start_date, end_date")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("payment_events")
      .select("id, event_type, amount, currency, occurred_at, description")
      .eq("member_id", member.id)
      .order("occurred_at", { ascending: false })
      .limit(20),

    supabase
      .from("xero_contacts")
      .select("xero_contact_id")
      .eq("member_id", member.id)
      .single(),
    supabase
      .from("class_bookings")
      .select("id, class_template_id, booked_date, status, class:class_templates(name, start_time, duration_minutes)")
      .eq("member_id", member.id)
      .gte("booked_date", new Date().toISOString().slice(0, 10))
      .order("booked_date")
      .limit(10),
    supabase
      .from("member_gradings")
      .select("id, discipline, grade, graded_at")
      .eq("member_id", member.id)
      .order("graded_at", { ascending: false })
      .limit(20),
    supabase
      .from("merch_orders")
      .select("id, status, total_cents, created_at, merch_order_items(qty, price_cents, products(name))")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const memberships     = membershipsRes.data     ?? [];
  const paymentEvents   = paymentEventsRes.data   ?? [];
  const xeroContactId   = xeroContactRes.data?.xero_contact_id;
  const upcomingBookings = bookingsRes.data ?? [];
  const memberGradings   = gradingsRes.data ?? [];
  const merchOrders      = (merchOrdersRes?.data ?? []) as unknown as { id: string; status: string; total_cents: number; created_at: string; merch_order_items: { qty: number; price_cents: number; products: { name: string } | null }[] }[];

  // Xero invoices for this member
  let xeroInvoices: {
    id: number; invoice_number: string | null; status: string;
    date: string | null; total: number | null; amount_due: number | null;
  }[] = [];

  if (xeroContactId) {
    const { data } = await supabase
      .from("xero_invoices")
      .select("id, invoice_number, status, date, total, amount_due")
      .eq("contact_id", xeroContactId)
      .eq("invoice_type", "ACCREC")
      .order("date", { ascending: false })
      .limit(20);
    xeroInvoices = data ?? [];
  }

  const activeMembership = memberships.find(m => m.status === "active");
  const outstandingTotal = xeroInvoices
    .filter(i => i.status === "AUTHORISED")
    .reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="font-semibold">Bendigo Fight Centre</h1>
            <p className="text-xs text-muted-foreground">Member portal</p>
          </div>
          <PortalSignOut />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Member identity card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold">{member.full_name ?? "Member"}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{member.primary_email}</p>
              </div>
              <Badge
                variant="secondary"
                className={cn("font-normal", STATUS_COLOURS[member.member_status ?? ""] ?? "")}
              >
                {member.member_status ?? "—"}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Phone</p>
                <p>{member.primary_phone ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Member since</p>
                <p>{member.created_at ? formatDate(member.created_at) : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding balance alert */}
        {outstandingTotal > 0 && (
          <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
            <p className="font-medium text-warning-foreground">
              Outstanding balance: {formatMoney(outstandingTotal)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Please contact us to arrange payment.
            </p>
          </div>
        )}

        {/* Active membership */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Current membership</CardTitle>
          </CardHeader>
          <CardContent>
            {!activeMembership ? (
              <p className="text-sm text-muted-foreground">No active membership on record.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-medium">{activeMembership.plan_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Billing</p>
                  <p className="capitalize">{activeMembership.billing_provider ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Start date</p>
                  <p>{activeMembership.start_date ? formatDate(activeMembership.start_date) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">End date</p>
                  <p>{activeMembership.end_date ? formatDate(activeMembership.end_date) : "Ongoing"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment history */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payment history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {paymentEvents.length === 0 && xeroInvoices.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No payment history available.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* GoCardless events */}
                    {paymentEvents.map(e => (
                      <TableRow key={`gc-${e.id}`}>
                        <TableCell className="text-sm">{formatDate(e.occurred_at)}</TableCell>
                        <TableCell className="text-sm">
                          {e.description ?? e.event_type.replace("_", " ")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {e.amount != null ? formatMoney(e.amount / 100, e.currency ?? "AUD") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs font-normal",
                              e.event_type === "payment_paid"   ? "bg-success/15 text-success-foreground" :
                              e.event_type === "payment_failed" ? "bg-destructive/15 text-destructive" :
                              "bg-muted text-muted-foreground"
                            )}
                          >
                            {e.event_type === "payment_paid" ? "Paid" :
                             e.event_type === "payment_failed" ? "Failed" : e.event_type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Xero invoices */}
                    {xeroInvoices.map(inv => (
                      <TableRow key={`xi-${inv.id}`}>
                        <TableCell className="text-sm">{inv.date ? formatDate(inv.date) : "—"}</TableCell>
                        <TableCell className="text-sm">
                          Invoice {inv.invoice_number ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {inv.total != null ? formatMoney(inv.total) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn("text-xs font-normal", STATUS_COLOURS[inv.status] ?? "")}
                          >
                            {inv.status === "PAID" ? "Paid" : inv.status === "AUTHORISED" ? "Unpaid" : inv.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming class bookings */}
        {upcomingBookings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upcoming class bookings</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {upcomingBookings.map(b => {
                  const cls = Array.isArray(b.class) ? b.class[0] : b.class;
                  return (
                    <div key={b.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-sm">{cls?.name ?? "Class"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(b.booked_date)} · {cls?.start_time?.slice(0,5)} · {cls?.duration_minutes}min
                        </p>
                      </div>
                      <Badge variant={b.status === "confirmed" ? "success" : "secondary"} className="text-xs">
                        {b.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Grading history */}
        {memberGradings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My gradings</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="divide-y">
                {memberGradings.map(g => (
                  <div key={g.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-sm capitalize">{g.discipline?.replace("_"," ")} — {g.grade}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(g.graded_at)}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{g.grade}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Questions about your membership?{" "}
              <a href="mailto:info@bendigofightcentre.com.au" className="text-primary hover:underline">
                Email us
              </a>{" "}
              or call us at the gym.
            </p>

            {/* Stripe customer portal */}
            {memberships.some((m) => m.billing_provider === "stripe") && (
              <StripePortalButton />
            )}

            {/* Quick links */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <a href="/merch" className="rounded-lg border p-3 text-center text-sm font-medium hover:bg-muted">
                🛍️ Shop Merch
              </a>
              <a href="/timetable/book" className="rounded-lg border p-3 text-center text-sm font-medium hover:bg-muted">
                📅 Book a Class
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Merch orders */}
        {merchOrders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">My Orders</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {merchOrders.map((order) => (
                <div key={order.id} className="py-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{new Date(order.created_at).toLocaleDateString("en-AU")}</span>
                    <span className="font-bold">${(order.total_cents / 100).toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {order.merch_order_items.map((item, i) => (
                      <div key={i}>{item.qty}x {item.products?.name ?? "Item"}</div>
                    ))}
                  </div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    order.status === "fulfilled" ? "bg-green-100 text-green-700" :
                    order.status === "paid" ? "bg-blue-100 text-blue-700" :
                    order.status === "cancelled" ? "bg-gray-100 text-gray-500" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{order.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
