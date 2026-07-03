# Notes for AI agents working on this app

- This is **Next.js 16** — several conventions differ from older training data.
  Read `node_modules/next/dist/docs/` before assuming an API. Known differences
  used here: `src/proxy.ts` replaces `middleware.ts`; `cookies()` and
  `searchParams` are async (`await` them).
- Supabase RLS in `supabase/migrations/` is the real authorisation layer;
  `requireRole()` page gates are UX only. Never weaken an RLS policy to make a
  feature work — restructure the feature.
- Call `logAudit()` on every sensitive view/write/export.
- Guardrails (non-negotiable): no credentials in code, no AI-initiated
  cancellations/refunds/payment changes, no general-staff access to
  health/youth/incident data, read-only before write-enabled.
