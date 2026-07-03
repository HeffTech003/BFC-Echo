import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isoDaysAgo, isoToday } from "@/lib/format";

export const metadata = { title: "Compliance — BFC Command Centre" };

export default async function CompliancePage() {
  const profile = await requireRole([
    "owner_director",
    "operations_admin",
    "child_safety_lead",
  ]);
  const supabase = await createClient();
  const isRestricted = ["owner_director", "child_safety_lead"].includes(profile.role);
  const today = isoToday();
  const sixtyDaysOut = isoDaysAgo(-60);

  const [policies, acks, expiringForms, openIncidents, overdueReviews, activeLinks] =
    await Promise.all([
      supabase
        .from("policy_versions")
        .select("*", { count: "exact", head: true })
        .eq("is_current", true),
      supabase
        .from("policy_acknowledgements")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("medical_forms")
        .select("*", { count: "exact", head: true })
        .eq("status", "submitted")
        .lte("expires_at", sixtyDaysOut),
      supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .neq("status", "closed"),
      supabase
        .from("incident_reports")
        .select("*", { count: "exact", head: true })
        .neq("status", "closed")
        .lt("review_date", today),
      supabase
        .from("form_links")
        .select("*", { count: "exact", head: true })
        .is("used_at", null)
        .gt("expires_at", isoDaysAgo(0)),
    ]);

  const areas = [
    {
      href: "/compliance/policies",
      title: "Policy Library",
      description: `${policies.count ?? 0} current policies · ${acks.count ?? 0} acknowledgements recorded`,
      show: true,
    },
    {
      href: "/compliance/forms",
      title: "Medical & Emergency Forms",
      description: `${expiringForms.count ?? 0} expiring within 60 days · ${activeLinks.count ?? 0} active form links`,
      show: isRestricted,
    },
    {
      href: "/compliance/incidents",
      title: "Incident Reports",
      description: `${openIncidents.count ?? 0} open · ${overdueReviews.count ?? 0} overdue review${(overdueReviews.count ?? 0) === 1 ? "" : "s"}`,
      show: isRestricted,
      alert: (overdueReviews.count ?? 0) > 0,
    },
  ].filter((a) => a.show);

  return (
    <AppShell profile={profile}>
      <h1 className="mb-1 text-2xl font-semibold">Compliance & Safety</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Restricted area. Medical and incident data is limited to the Owner/Director and
        Child Safety Lead; every access is audit-logged.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {areas.map((a) => (
          <Link key={a.href} href={a.href}>
            <Card className={a.alert ? "border-l-destructive h-full border-l-4" : "h-full"}>
              <CardHeader>
                <CardTitle className="text-base">{a.title}</CardTitle>
                <CardDescription>{a.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-muted-foreground mt-8 max-w-2xl text-xs">
        ⚠️ Before collecting real health or child-safety data in production, complete a
        legal/privacy review (Australian Privacy Principles / health records requirements)
        and enable MFA for all staff accounts in Supabase Auth.
      </p>
    </AppShell>
  );
}
