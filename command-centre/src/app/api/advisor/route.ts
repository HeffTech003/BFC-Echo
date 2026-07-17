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
      // Members — gym_member type only (excludes NACs, historical WooCommerce/GoCardless-only records)
      { count: activeGymMembers },
      { count: lapsedMembers },
      { count: nacCount },
      // Pipeline
      { count: openLeads },
      { count: pendingTasks },
      // Cancellations last 30 days
      { count: recentCancellations },
      // Finance — revenue last 30 days
      { data: recentPayments },
      // Subscriptions
      { count: activeSubscriptions },
      // Compliance expiring in 60 days
      { data: expiringCompliance },
      // Gradings
      { data: recentGradings },
      // Merch low stock
      { data: lowStockProducts },
      // Attendance last 30 days
      { count: attendanceLast30 },
    ] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "active").is("merged_into", null),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "lapsed").is("merged_into", null),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "nac").is("merged_into", null),
      supabase.from("leads").select("*", { count: "exact", head: true })
        .not("stage", "in", "(joined,did_not_convert)"),
      supabase.from("tasks").select("*", { count: "exact", head: true })
        .eq("status", "open"),
      supabase.from("members").select("*", { count: "exact", head: true })
        .eq("member_type", "gym_member").eq("member_status", "cancelled")
        .gte("updated_at", thirtyDaysAgo),
      supabase.from("payments").select("amount, payment_date, source")
        .gte("payment_date", thirtyDaysAgo).order("payment_date", { ascending: false }).limit(200),
      supabase.from("memberships").select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase.from("staff_certifications").select("staff_id, cert_type, expiry_date")
        .lte("expiry_date", sixtyDaysFromNow).gte("expiry_date", today)
        .order("expiry_date", { ascending: true }).limit(10),
      supabase.from("member_gradings").select("discipline, grade, created_at")
        .gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("name, stock_qty")
        .lte("stock_qty", 3).eq("is_active", true),
      supabase.from("attendance_records").select("*", { count: "exact", head: true })
        .gte("attended_at", thirtyDaysAgo),
    ]);

    // Sum revenue by source
    const revenueBySource: Record<string, number> = {};
    let totalRevenue = 0;
    for (const p of recentPayments ?? []) {
      const src = p.source ?? "unknown";
      revenueBySource[src] = (revenueBySource[src] ?? 0) + (p.amount ?? 0);
      totalRevenue += (p.amount ?? 0);
    }
    const revenueBreakdown = Object.entries(revenueBySource)
      .map(([src, amt]) => `${src} $${amt.toFixed(2)}`).join(", ") || "no payments recorded";

    return `
LIVE PLATFORM DATA (as of ${today}):

MEMBERS (gym members only — excludes historical/NAC records):
- Active gym members: ${activeGymMembers ?? "unknown"}
- Lapsed gym members: ${lapsedMembers ?? "unknown"}
- NAC accounts (parents/guardians of youth members): ${nacCount ?? "unknown"}
- Cancelled in last 30 days: ${recentCancellations ?? "unknown"}
- Active billing subscriptions: ${activeSubscriptions ?? "unknown"}

PIPELINE:
- Open leads: ${openLeads ?? "unknown"}
- Open tasks: ${pendingTasks ?? "unknown"}

FINANCE (last 30 days):
- Total revenue: $${totalRevenue.toFixed(2)}
- Revenue by source: ${revenueBreakdown}

COMPLIANCE (expiring within 60 days):
${expiringCompliance?.length
  ? expiringCompliance.map(c => `- ${c.cert_type} expires ${c.expiry_date}`).join("\n")
  : "- All certifications current"}

ACTIVITY (last 30 days):
- Class attendance records: ${attendanceLast30 ?? "unknown"}
- Recent gradings: ${recentGradings?.map((g) => `${g.discipline} ${g.grade}`).join(", ") || "none"}

MERCH:
- Low stock products (≤3 units): ${lowStockProducts?.map((p) => `${p.name} (${p.stock_qty})`).join(", ") || "none"}
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
