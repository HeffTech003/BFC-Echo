import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import MerchClient from "./merch-client";

export const dynamic = "force-dynamic";

export default async function MerchPage() {
  const supabase = await createClient();

  let profile;
  try { profile = await requireProfile(); }
  catch { redirect("/login"); }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, description, category, price_cents, stock_qty, image_url")
    .eq("is_active", true)
    .order("category")
    .order("name");

  const grouped: Record<string, typeof products> = {};
  for (const p of products ?? []) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category]!.push(p);
  }

  const isAdmin = ["owner_director", "operations_admin"].includes(profile.role);

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Merch Shop</h1>
            <p className="text-sm text-muted-foreground">BFC gear &amp; equipment</p>
          </div>
          {isAdmin && (
            <a
              href="/merch/admin"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Manage Shop
            </a>
          )}
        </div>

        {Object.keys(grouped).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No products available yet. Check back soon!
            </CardContent>
          </Card>
        )}

        <MerchClient grouped={grouped ?? {}} profile={profile} />
      </div>
    </AppShell>
  );
}
