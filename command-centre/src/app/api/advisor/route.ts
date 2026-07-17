import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs";

// ── Build live platform context ───────────────────────────────────────────────
async function buildContext(): Promise<string> {
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const sixtyDaysFromNow = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

    const [
      // Members
      { count: activeGymMembers },
      { count: lapsedMembers },
      { count: nacCount },
      { count: newMembersLast30 },
      // Pipeline
      { data: leadsByStage },
      { count: pendingTasks },
      { data: tasksDueSoon },
      // Cancellations last 30 days
      { count: recentCancellations },
      // Finance — GoCardless payment events
      { data: recentPaymentEvents },
      // Finance — Xero paid invoices
      { data: recentXeroInvoices },
      { count: activeSubscriptions },
      // Compliance
      { data: expiringCompliance },
      // Gradings
      { data: recentGradings },
      // Merch
      { data: lowStockProducts },
      { data: recentMerchOrders },
      // Attendance & classes
      { count: attendanceLast30 },
      { data: popularClasses },
      // New members joined this month
    ] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "active").is("merged_into", null),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "lapsed").is("merged_into", null),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "nac").is("merged_into", null),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").gte("joined_at", thirtyDaysAgo).is("merged_into", null),
      supabase.from("leads").select("stage, source")
        .not("stage", "in", "(joined,did_not_convert)"),
      supabase.from("tasks").select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase.from("tasks").select("title, priority, due_date")
        .in("status", ["open", "in_progress"]).lte("due_date", new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10))
        .order("due_date").limit(5),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "cancelled")
        .gte("updated_at", thirtyDaysAgo),
      supabase.from("payment_events").select("amount, occurred_at, event_type")
        .eq("event_type", "payment_paid").gte("occurred_at", thirtyDaysAgo)
        .order("occurred_at", { ascending: false }).limit(500),
      supabase.from("xero_invoices").select("amount_paid, date, status")
        .eq("status", "PAID").eq("invoice_type", "ACCREC").gte("date", thirtyDaysAgo)
        .order("date", { ascending: false }).limit(500),
      supabase.from("memberships").select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("staff_certifications").select("staff_id, cert_type, expiry_date")
        .lte("expiry_date", sixtyDaysFromNow).gte("expiry_date", today)
        .order("expiry_date").limit(10),
      supabase.from("member_gradings").select("discipline, grade, created_at")
        .gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("name, stock_qty")
        .lte("stock_qty", 3).eq("is_active", true),
      supabase.from("merch_orders").select("total_amount, status, created_at")
        .gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(50),
      supabase.from("attendance_records").select("*", { count: "exact", head: true })
        .gte("attended_at", thirtyDaysAgo),
      supabase.from("attendance_records").select("class_name")
        .gte("attended_at", thirtyDaysAgo).limit(500),
    ]);

    // Revenue breakdown by source
    const gcRevenue = (recentPaymentEvents ?? [])
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const xeroRevenue = (recentXeroInvoices ?? [])
      .reduce((sum, i) => sum + (i.amount_paid ?? 0), 0);
    const totalRevenue = gcRevenue + xeroRevenue;
    const revenueBreakdown = [
      gcRevenue > 0 ? `GoCardless $${gcRevenue.toFixed(2)} (${recentPaymentEvents?.length ?? 0} payments)` : null,
      xeroRevenue > 0 ? `Xero invoices $${xeroRevenue.toFixed(2)} (${recentXeroInvoices?.length ?? 0} invoices)` : null,
    ].filter(Boolean).join(", ") || "no payments recorded in last 30 days — check GoCardless and Xero directly";

    // Lead pipeline by stage
    const stageCount: Record<string, number> = {};
    for (const l of leadsByStage ?? []) {
      const s = l.stage ?? "unknown";
      stageCount[s] = (stageCount[s] ?? 0) + 1;
    }
    const leadSourceCount: Record<string, number> = {};
    for (const l of leadsByStage ?? []) {
      const s = l.source ?? "unknown";
      leadSourceCount[s] = (leadSourceCount[s] ?? 0) + 1;
    }

    // Most popular classes last 30 days
    const classCount: Record<string, number> = {};
    for (const a of popularClasses ?? []) {
      if (a.class_name) classCount[a.class_name] = (classCount[a.class_name] ?? 0) + 1;
    }
    const topClasses = Object.entries(classCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, cnt]) => `${name} (${cnt} attendees)`).join(", ") || "no data";

    // Merch revenue last 30 days
    const merchRevenue = (recentMerchOrders ?? [])
      .filter(o => o.status !== "cancelled")
      .reduce((sum, o) => sum + (o.total_amount ?? 0), 0);

    return `
LIVE PLATFORM DATA (as of ${today}) — data is fetched fresh every message:

MEMBERS:
- Active gym members: ${activeGymMembers ?? "unknown"}
- New gym members joined last 30 days: ${newMembersLast30 ?? "unknown"}
- Lapsed gym members (win-back opportunity): ${lapsedMembers ?? "unknown"}
- Cancelled in last 30 days: ${recentCancellations ?? "unknown"}
- NAC accounts (parents/guardians of youth members): ${nacCount ?? "unknown"}
- Active billing subscriptions: ${activeSubscriptions ?? "unknown"}

LEADS PIPELINE:
- By stage: ${Object.entries(stageCount).map(([s, n]) => `${s}: ${n}`).join(", ") || "none"}
- By source: ${Object.entries(leadSourceCount).map(([s, n]) => `${s}: ${n}`).join(", ") || "none"}

TASKS:
- Total open tasks: ${pendingTasks ?? "unknown"}
- Due in next 7 days: ${tasksDueSoon?.map(t => `"${t.title}" (${t.priority}, due ${t.due_date})`).join("; ") || "none"}

FINANCE (last 30 days):
- Total revenue: $${totalRevenue.toFixed(2)}
- Revenue by source: ${revenueBreakdown}
- Merch shop revenue: $${merchRevenue.toFixed(2)}

COMPLIANCE (expiring within 60 days):
${expiringCompliance?.length
  ? expiringCompliance.map(c => `- ${c.cert_type} expires ${c.expiry_date}`).join("\n")
  : "- All certifications current"}

CLASS ATTENDANCE (last 30 days):
- Total attendance records: ${attendanceLast30 ?? "unknown"}
- Most popular classes: ${topClasses}

GRADING & BELTS (last 30 days):
- Recent promotions: ${recentGradings?.map(g => `${g.discipline} ${g.grade}`).join(", ") || "none"}

MERCH INVENTORY:
- Low stock products (≤3 units): ${lowStockProducts?.map(p => `${p.name} (${p.stock_qty})`).join(", ") || "none"}
`.trim();
  } catch {
    return "Live data unavailable.";
  }
}

// ── POST /api/advisor ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireProfile();
  } catch {
    return new Response("Unauthorised", { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Add it to .env.local." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const context = await buildContext();

  const systemPrompt = `You are the BFC AI Advisor — a helpful assistant built into the Bendigo Fight Centre management platform.

You help the BFC team with:
- Understanding member data, trends, and retention
- Reviewing financial performance and cash flow
- Identifying leads that need follow-up
- Analysing class attendance and timetable gaps
- Payroll and compliance questions
- Merch shop inventory decisions
- Operational improvements and suggestions
- Creating action plans and staff tasks

You speak in plain Australian English, are direct and concise, and always ground your advice in the actual data below.

IMPORTANT: The data below is fetched LIVE from the BFC database every single message — it is not static. You have real-time visibility into members, leads, tasks, revenue, attendance, compliance, and merch. When asked about current state, answer confidently from the data provided. Never say you "don't have access" to the app — you do, through this live data feed.

${context}

When you suggest creating a task, format it clearly as:
TASK: [task title]
DESCRIPTION: [what needs doing]

You cannot directly execute changes, but you can advise exactly what to do and where in the platform to do it.`;

  // Stream from Anthropic API
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    let errMsg = "Anthropic API error";
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.error?.message ?? (typeof parsed.error === "string" ? parsed.error : errMsg);
    } catch {}
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: anthropicRes.status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pipe Anthropic SSE → client as plain text stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body?.getReader();
      if (!reader) { controller.close(); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data) continue;
          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          } catch {}
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no",
    },
  });
}
