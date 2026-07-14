"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/roles";

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  stock_qty: number;
  image_url: string | null;
};

type CartItem = { product: Product; qty: number };

const CATEGORY_LABELS: Record<string, string> = {
  apparel:      "Apparel",
  equipment:    "Equipment",
  supplements:  "Supplements",
  accessories:  "Accessories",
  other:        "Other",
};

export default function MerchClient({
  grouped,
  profile,
}: {
  grouped: Record<string, Product[] | null>;
  profile: Profile | null;
}) {
  const [cart, setCart]         = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [name, setName]         = useState(profile?.full_name ?? "");
  const [email, setEmail]       = useState("");
  const [notes, setNotes]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{ orderId: string; totalCents: number } | null>(null);
  const [error, setError]       = useState("");

  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  const totalCents = cart.reduce((s, i) => s + i.product.price_cents * i.qty, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  }

  async function submitOrder() {
    if (!name.trim()) { setError("Please enter your name"); return; }
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("customer_name",  name);
      fd.append("customer_email", email);
      fd.append("notes",          notes);
      fd.append("items", JSON.stringify(cart.map((i) => ({ product_id: i.product.id, qty: i.qty }))));

      const { createOrder } = await import("./actions");
      const result = await createOrder(fd);
      setOrderResult(result);
      setCart([]);
      setShowCart(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  }

  if (orderResult) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-12 text-center space-y-4">
          <div className="text-4xl">🎉</div>
          <h2 className="text-xl font-bold text-green-800">Order placed!</h2>
          <p className="text-green-700">
            Order #{orderResult.orderId.slice(0, 8).toUpperCase()} — Total:{" "}
            ${(orderResult.totalCents / 100).toFixed(2)}
          </p>
          <p className="text-sm text-green-600">A staff member will contact you for payment &amp; pickup.</p>
          <Button onClick={() => setOrderResult(null)}>Continue shopping</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Cart bar */}
      {totalItems > 0 && (
        <div className="sticky top-14 z-20 flex items-center justify-between rounded-lg border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">
            {totalItems} item{totalItems !== 1 ? "s" : ""} in cart — ${(totalCents / 100).toFixed(2)}
          </span>
          <Button size="sm" onClick={() => setShowCart(true)}>View Cart</Button>
        </div>
      )}

      {/* Product grid */}
      {Object.entries(grouped).map(([cat, products]) => (
        <div key={cat}>
          <h2 className="mb-3 text-lg font-semibold capitalize">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(products ?? []).map((p) => {
              const inCart = cart.find((i) => i.product.id === p.id)?.qty ?? 0;
              const outOfStock = p.stock_qty === 0;
              return (
                <Card key={p.id} className={outOfStock ? "opacity-60" : ""}>
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-48 w-full rounded-t-lg object-cover"
                    />
                  )}
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{p.name}</h3>
                        {p.description && (
                          <p className="text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </div>
                      <span className="ml-2 shrink-0 font-bold">
                        ${(p.price_cents / 100).toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {outOfStock ? "Out of stock" : `${p.stock_qty} in stock`}
                    </p>
                    {inCart > 0 ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => changeQty(p.id, -1)}>−</Button>
                        <span className="w-6 text-center text-sm">{inCart}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => changeQty(p.id, 1)}
                          disabled={inCart >= p.stock_qty}
                        >+</Button>
                        <span className="ml-auto text-xs text-muted-foreground">In cart</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={outOfStock}
                        onClick={() => addToCart(p)}
                      >
                        {outOfStock ? "Out of stock" : "Add to cart"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Cart modal */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl sm:rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Your Cart</h2>
              <button onClick={() => setShowCart(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>

            {cart.map((item) => (
              <div key={item.product.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{item.product.name}</span>
                  <span className="ml-2 text-muted-foreground">× {item.qty}</span>
                </div>
                <span className="font-semibold">${((item.product.price_cents * item.qty) / 100).toFixed(2)}</span>
                <button onClick={() => removeFromCart(item.product.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            ))}

            <div className="border-t pt-3 font-bold text-right">
              Total: ${(totalCents / 100).toFixed(2)}
            </div>

            <div className="space-y-2">
              <div>
                <Label htmlFor="cn">Name *</Label>
                <Input id="cn" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ce">Email</Label>
                <Input id="ce" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="cn2">Notes</Label>
                <Input id="cn2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Size, colour, special requests…" />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button className="w-full" onClick={submitOrder} disabled={submitting}>
              {submitting ? "Placing order…" : "Place Order"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Staff will contact you for payment &amp; pickup.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
