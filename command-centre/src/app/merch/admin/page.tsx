import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { upsertProduct, adjustStock, updateOrderStatus } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_COLOURS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  paid:      "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-700",
  refunded:  "bg-purple-100 text-purple-800",
};

type Product = {
  id: string; name: string; category: string; price_cents: number;
  stock_qty: number; sku: string | null; is_active: boolean;
};
type OrderItem = { qty: number; price_cents: number; variant: string | null; products: { name: string } | null };
type Order = {
  id: string; customer_name: string; customer_email: string | null;
  status: string; total_cents: number; notes: string | null;
  created_at: string; merch_order_items: OrderItem[];
};

export default async function MerchAdminPage() {
  const profile = await requireRole(["owner_director", "operations_admin", "finance"]);
  const supabase = await createClient();
  const isManager = ["owner_director", "operations_admin"].includes(profile.role);

  const [{ data: products }, { data: orders }] = await Promise.all([
    supabase.from("products").select("id, name, category, price_cents, stock_qty, sku, is_active").order("category").order("name"),
    supabase.from("merch_orders").select(`
      id, customer_name, customer_email, status, total_cents, notes, created_at,
      merch_order_items ( qty, price_cents, variant, products ( name ) )
    `).order("created_at", { ascending: false }).limit(100),
  ]);

  const typedProducts = (products ?? []) as Product[];
  const typedOrders   = (orders   ?? []) as unknown as Order[];

  const totalProducts = typedProducts.length;
  const lowStock      = typedProducts.filter((p) => p.stock_qty <= 3 && p.is_active).length;
  const pendingOrders = typedOrders.filter((o) => o.status === "pending").length;
  const revenueCents  = typedOrders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((s, o) => s + o.total_cents, 0);

  return (
    <AppShell profile={profile}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Merch Admin</h1>
            <p className="text-sm text-muted-foreground">Products, stock &amp; orders</p>
          </div>
          <a href="/merch" className="text-sm text-muted-foreground hover:underline">← Shop</a>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="gap-2 py-4 border-l-4 border-l-border">
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">{totalProducts}</div>
              <div className="mt-1 text-sm font-medium">Products</div>
              <div className="text-xs text-muted-foreground mt-0.5">active in store</div>
            </CardContent>
          </Card>
          <Card className={`gap-2 py-4 border-l-4 ${lowStock > 0 ? "border-l-warning" : "border-l-border"}`}>
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">{lowStock}</div>
              <div className="mt-1 text-sm font-medium">Low stock</div>
              <div className="text-xs text-muted-foreground mt-0.5">≤3 units remaining</div>
            </CardContent>
          </Card>
          <Card className={`gap-2 py-4 border-l-4 ${pendingOrders > 0 ? "border-l-primary" : "border-l-border"}`}>
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">{pendingOrders}</div>
              <div className="mt-1 text-sm font-medium">Pending orders</div>
              <div className="text-xs text-muted-foreground mt-0.5">need fulfilment</div>
            </CardContent>
          </Card>
          <Card className="gap-2 py-4 border-l-4 border-l-success">
            <CardContent className="px-4">
              <div className="text-3xl font-bold tabular-nums">${(revenueCents / 100).toFixed(0)}</div>
              <div className="mt-1 text-sm font-medium">Revenue</div>
              <div className="text-xs text-muted-foreground mt-0.5">total orders value</div>
            </CardContent>
          </Card>
        </div>

        {/* Add product */}
        {isManager && (
          <Card>
            <CardHeader><CardTitle>Add Product</CardTitle></CardHeader>
            <CardContent>
              <form action={upsertProduct} className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Name *</label>
                  <input name="name" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">SKU</label>
                  <input name="sku" className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Category *</label>
                  <select name="category" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm bg-background">
                    <option value="apparel">Apparel</option>
                    <option value="equipment">Equipment</option>
                    <option value="supplements">Supplements</option>
                    <option value="accessories">Accessories</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Price (AUD) *</label>
                  <input name="price_dollars" type="number" step="0.01" min="0" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Initial Stock *</label>
                  <input name="stock_qty" type="number" min="0" defaultValue="0" required className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-sm font-medium">Image URL</label>
                  <input name="image_url" type="url" className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea name="description" rows={2} className="mt-1 w-full rounded border px-3 py-1.5 text-sm" />
                </div>
                <input type="hidden" name="is_active" value="true" />
                <div className="sm:col-span-2 text-right">
                  <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    Add Product
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Products table */}
        <Card>
          <CardHeader><CardTitle>Products</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Category</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  {isManager && <th className="px-4 py-2 text-left font-medium">Stock Adj.</th>}
                </tr>
              </thead>
              <tbody>
                {typedProducts.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.name}</div>
                      {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
                    </td>
                    <td className="px-4 py-2 capitalize">{p.category}</td>
                    <td className="px-4 py-2 text-right">${(p.price_cents / 100).toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${p.stock_qty <= 3 ? "text-yellow-600" : ""}`}>
                      {p.stock_qty}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isManager && (
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          {([-1, 1, 10] as const).map((delta) => (
                            <form key={delta} action={adjustStock}>
                              <input type="hidden" name="product_id" value={p.id} />
                              <input type="hidden" name="delta" value={String(delta)} />
                              <button type="submit" className="rounded border px-2 py-0.5 text-xs hover:bg-muted">
                                {delta > 0 ? `+${delta}` : delta}
                              </button>
                            </form>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {typedProducts.length === 0 && (
                  <tr><td colSpan={isManager ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">No products yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Orders */}
        <Card>
          <CardHeader><CardTitle>Orders ({typedOrders.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-4">
            {typedOrders.map((o) => (
              <div key={o.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{o.customer_name}</span>
                    {o.customer_email && <span className="ml-2 text-sm text-muted-foreground">{o.customer_email}</span>}
                    <div className="text-xs text-muted-foreground">
                      #{o.id.slice(0, 8).toUpperCase()} · {new Date(o.created_at).toLocaleDateString("en-AU")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${(o.total_cents / 100).toFixed(2)}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[o.status] ?? "bg-gray-100"}`}>
                      {o.status}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {o.merch_order_items.map((item, idx) => (
                    <div key={idx}>
                      {item.qty}× {item.products?.name ?? "Unknown"}
                      {item.variant ? ` (${item.variant})` : ""}
                      {" — "}${((item.price_cents * item.qty) / 100).toFixed(2)}
                    </div>
                  ))}
                </div>
                {o.notes && <p className="text-xs text-muted-foreground italic">Notes: {o.notes}</p>}
                {isManager && o.status !== "fulfilled" && o.status !== "cancelled" && (
                  <div className="flex gap-2 flex-wrap">
                    {o.status === "pending" && (
                      <form action={updateOrderStatus}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <input type="hidden" name="status" value="paid" />
                        <button type="submit" className="rounded border bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                          Mark Paid
                        </button>
                      </form>
                    )}
                    {(o.status === "pending" || o.status === "paid") && (
                      <form action={updateOrderStatus}>
                        <input type="hidden" name="order_id" value={o.id} />
                        <input type="hidden" name="status" value="fulfilled" />
                        <button type="submit" className="rounded border bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                          Mark Fulfilled
                        </button>
                      </form>
                    )}
                    <form action={updateOrderStatus}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button type="submit" className="rounded border bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
                        Cancel
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ))}
            {typedOrders.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No orders yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
