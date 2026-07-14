"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// ── Product management ────────────────────────────────────────────────────────

export async function upsertProduct(formData: FormData) {
  const profile = await requireProfile();
  if (!["owner_director", "operations_admin"].includes(profile.role))
    throw new Error("Unauthorised");

  const supabase = await createClient();
  const id = formData.get("id") as string | null;

  const payload = {
    name:          formData.get("name") as string,
    description:   (formData.get("description") as string) || null,
    category:      formData.get("category") as string,
    price_cents:   Math.round(parseFloat(formData.get("price_dollars") as string) * 100),
    stock_qty:     parseInt(formData.get("stock_qty") as string, 10),
    sku:           (formData.get("sku") as string) || null,
    image_url:     (formData.get("image_url") as string) || null,
    is_active:     formData.get("is_active") === "true",
    updated_at:    new Date().toISOString(),
  };

  if (id) {
    await supabase.from("products").update(payload).eq("id", id);
  } else {
    await supabase.from("products").insert(payload);
  }
  revalidatePath("/merch");
  revalidatePath("/merch/admin");
}

export async function adjustStock(formData: FormData) {
  const profile = await requireProfile();
  if (!["owner_director", "operations_admin"].includes(profile.role))
    throw new Error("Unauthorised");

  const supabase = await createClient();
  const product_id = formData.get("product_id") as string;
  const delta = parseInt(formData.get("delta") as string, 10);

  const { data } = await supabase
    .from("products")
    .select("stock_qty")
    .eq("id", product_id)
    .single();

  if (!data) throw new Error("Product not found");
  const newQty = Math.max(0, (data as { stock_qty: number }).stock_qty + delta);
  await supabase.from("products").update({ stock_qty: newQty, updated_at: new Date().toISOString() }).eq("id", product_id);
  revalidatePath("/merch/admin");
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function createOrder(formData: FormData) {
  const supabase = await createClient();

  // Profile optional — guests can order too
  let memberId: string | null = null;
  try {
    const profile = await requireProfile();
    memberId = profile.member_id ?? null;
  } catch {}

  const items: { product_id: string; qty: number; variant?: string }[] = JSON.parse(
    formData.get("items") as string
  );

  if (!items.length) throw new Error("Cart is empty");

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price_cents, stock_qty, is_active")
    .in("id", items.map((i) => i.product_id));

  if (!products) throw new Error("Products not found");

  const productMap: Record<string, { id: string; name: string; price_cents: number; stock_qty: number; is_active: boolean }> =
    Object.fromEntries(products.map((p) => [p.id, p]));

  let totalCents = 0;
  for (const item of items) {
    const p = productMap[item.product_id];
    if (!p || !p.is_active) throw new Error(`Product unavailable`);
    if (p.stock_qty < item.qty) throw new Error(`${p.name} has insufficient stock`);
    totalCents += p.price_cents * item.qty;
  }

  const customerName  = formData.get("customer_name") as string;
  const customerEmail = (formData.get("customer_email") as string) || null;

  const { data: order, error } = await supabase
    .from("merch_orders")
    .insert({
      member_id:      memberId,
      customer_name:  customerName,
      customer_email: customerEmail,
      status:         "pending",
      total_cents:    totalCents,
      notes:          (formData.get("notes") as string) || null,
    })
    .select("id")
    .single();

  if (error || !order) throw new Error("Failed to create order");

  await supabase.from("merch_order_items").insert(
    items.map((item) => ({
      order_id:    order.id,
      product_id:  item.product_id,
      qty:         item.qty,
      price_cents: productMap[item.product_id].price_cents,
      variant:     item.variant ?? null,
    }))
  );

  // Decrement stock
  for (const item of items) {
    const p = productMap[item.product_id];
    await supabase
      .from("products")
      .update({ stock_qty: p.stock_qty - item.qty, updated_at: new Date().toISOString() })
      .eq("id", item.product_id);
  }

  revalidatePath("/merch");
  revalidatePath("/merch/admin");
  return { orderId: order.id as string, totalCents };
}

export async function updateOrderStatus(formData: FormData) {
  const profile = await requireProfile();
  if (!["owner_director", "operations_admin", "finance"].includes(profile.role))
    throw new Error("Unauthorised");

  const supabase = await createClient();
  const order_id = formData.get("order_id") as string;
  const status   = formData.get("status") as string;

  await supabase.from("merch_orders").update({ status }).eq("id", order_id);
  revalidatePath("/merch/admin");
}
