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

    const [
      { count: totalMembers },
      { count: activeMembers },
      { count: openLeads },
      { count: pendingTasks },
      { data: recentGradings },
      { data: lowStockProducts },
    ] = await Promise.all([
      supabase.from("members").select("*", { count: "exact", head: true }),
      supabase.from("members").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("crm_leads").select("*", { count: "exact", head: true }).in("status", ["new", "contacted", "qualified"]),
      supabase.from("staff_tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("member_gradings").select("discipline, grade, created_at").gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("name, stock_qty").lte("stock_qty", 3).eq("is_active", true),
    ]);

    return `
LIVE PLATFORM DATA (as of ${today}):
- Total members: ${totalMembers ?? "unknown"}
- Active members: ${activeMembers ?? "unknown"}
- Open CRM leads: ${openLeads ?? "unknown"}
- Open staff tasks: ${pendingTasks ?? "unknown"}
- Recent gradings (last 30d): ${recentGradings?.map((g) => `${g.discipline} ${g.grade}`).join(", ") || "none"}
- Low stock products (≤3): ${lowStockProducts?.map((p) => `${p.name} (${p.stock_qty})`).join(", ") || "none"}
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
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return new Response(errText, { status: anthropicRes.status });
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
