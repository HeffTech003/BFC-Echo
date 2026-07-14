/**
 * POST /api/bank-feed/sync
 * Pulls recent bank transactions from Xero Accounting API and upserts them.
 * Requires XERO_TENANT_ID env var + valid Xero token in xero_tokens table.
 */
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  try { await requireRole(["owner_director", "operations_admin", "finance"]); }
  catch { return Response.json({ error: "Unauthorised" }, { status: 401 }); }

  const supabase = await createClient();
  const { data: tokenRow } = await supabase
    .from("xero_tokens").select("access_token, expires_at")
    .order("created_at", { ascending: false }).limit(1).single();

  if (!tokenRow?.access_token)
    return Response.json({ error: "No Xero token. Complete OAuth via n8n." }, { status: 503 });
  if (tokenRow.expires_at && tokenRow.expires_at < new Date().toISOString())
    return Response.json({ error: "Xero token expired. Re-authenticate via n8n." }, { status: 503 });

  const tenantId = process.env.XERO_TENANT_ID;
  if (!tenantId) return Response.json({ error: "XERO_TENANT_ID not set" }, { status: 503 });

  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [y, m, d] = since.split("-");
  const url = `https://api.xero.com/api.xro/2.0/BankTransactions?where=Date>DateTime(${y},${m},${d})&order=Date DESC&pageSize=200`;

  const xeroRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
    },
  });

  if (!xeroRes.ok) {
    const errText = await xeroRes.text();
    return Response.json({ error: `Xero ${xeroRes.status}`, detail: errText }, { status: 502 });
  }

  type XeroTxn = {
    BankTransactionID: string;
    BankAccount?: { Name?: string; AccountID?: string };
    Date: string;
    LineItems?: { Description?: string }[];
    Reference?: string;
    Total: number;
    Type: string;
    IsReconciled?: boolean;
  };

  const data = await xeroRes.json() as { BankTransactions?: XeroTxn[] };
  const txns = data.BankTransactions ?? [];

  const rows = txns.map((t) => {
    const isCredit = ["RECEIVE", "RECEIVE-OVERPAYMENT", "RECEIVE-PREPAYMENT"].includes(t.Type);
    const amountCents = Math.round(Math.abs(t.Total) * 100) * (isCredit ? 1 : -1);
    const dateMatch = t.Date.match(/\/Date\((\d+)\)\//);
    const date = dateMatch
      ? new Date(parseInt(dateMatch[1])).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      source:        "xero" as const,
      external_id:   t.BankTransactionID,
      account_name:  t.BankAccount?.Name ?? null,
      account_id:    t.BankAccount?.AccountID ?? null,
      date,
      description:   t.LineItems?.[0]?.Description ?? null,
      reference:     t.Reference ?? null,
      amount_cents:  amountCents,
      currency:      "AUD",
      is_reconciled: t.IsReconciled ?? false,
      raw_json:      t as unknown as Record<string, unknown>,
      synced_at:     new Date().toISOString(),
    };
  });

  if (!rows.length) return Response.json({ synced: 0 });

  const { error: upsertErr } = await supabase
    .from("bank_transactions").upsert(rows, { onConflict: "external_id" });

  if (upsertErr)
    return Response.json({ error: upsertErr.message }, { status: 500 });

  return Response.json({ synced: rows.length, from: since });
}
