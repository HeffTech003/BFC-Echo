import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, sourceLabel } from "@/lib/format";
import { updateLead, moveLeadStage, createLead, deleteLead, triggerLeadFollowup } from "./actions";
import { UserPlus, Phone, Mail, Calendar, ChevronRight, CheckCircle2, XCircle, Clock, TrendingUp } from "lucide-react";

export const metadata = { title: "Leads & Pipeline — Bendigo Fight Centre" };

const PIPELINE_STAGES = [
  { key: "new_enquiry",        label: "New Enquiry",    next: "trial_booked",       color: "bg-blue-500" },
  { key: "trial_booked",       label: "Trial Booked",   next: "trial_attended",     color: "bg-amber-500" },
  { key: "trial_attended",     label: "Trial Attended", next: "follow_up_required", color: "bg-orange-500" },
  { key: "follow_up_required", label: "Follow-up",      next: "joined",             color: "bg-red-500" },
] as const;

const CLOSED_STAGES = [
  { key: "joined",           label: "Joined",           color: "bg-green-500" },
  { key: "did_not_convert",  label: "Did Not Convert",  color: "bg-slate-400" },
] as const;

const ALL_STAGES = [...PIPELINE_STAGES, ...CLOSED_STAGES];

const STAGE_BADGE: Record<string, string> = {
  new_enquiry:        "bg-blue-100 text-blue-800",
  trial_booked:       "bg-amber-100 text-amber-800",
  trial_attended:     "bg-orange-100 text-orange-800",
  follow_up_required: "bg-red-100 text-red-800",
  joined:             "bg-green-100 text-green-800",
  did_not_convert:    "bg-slate-100 text-slate-600",
};

const SOURCES = [
  { value: "walk_in",         label: "Walk-in" },
  { value: "phone",           label: "Phone" },
  { value: "web_form",        label: "Web form" },
  { value: "website_chatbot", label: "Website chatbot" },
  { value: "referral",        label: "Referral" },
  { value: "social_media",    label: "Social media" },
  { value: "other",           label: "Other" },
];

function daysSince(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function stageLabel(key: string) {
  return ALL_STAGES.find((s) => s.key === key)?.label ?? key;
}

type Lead = {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  source: string | null; source_system: string | null; interested_class: string | null;
  stage: string; trial_date: string | null; assigned_to: string | null;
  lost_reason: string | null; notes: string | null; created_at: string; updated_at: string;
  assignee: { id: string; full_name: string | null } | null;
};

function LeadCard({ lead, nextStage, staff }: {
  lead: Lead;
  nextStage: string | null;
  staff: { id: string; full_name: string | null }[];
}) {
  const age = daysSince(lead.created_at);
  const isStale = age !== null && age >= 7 && !["joined", "did_not_convert"].includes(lead.stage);

  return (
    <div className={`rounded-lg border bg-white p-3 shadow-sm text-sm ${isStale ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-slate-900 leading-tight">{lead.full_name ?? "Unknown"}</div>
        {age !== null && (
          <span className={`text-xs shrink-0 ${isStale ? "text-red-500 font-medium" : "text-slate-400"}`}>{age}d</span>
        )}
      </div>
      {(lead.email || lead.phone) && (
        <div className="flex flex-col gap-0.5 mb-2 text-slate-500 text-xs">
          {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{lead.email}</span></span>}
          {lead.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{lead.phone}</span>}
        </div>
      )}
      {lead.interested_class && <div className="mb-1 text-xs text-slate-600">{lead.interested_class}</div>}
      {(lead.source || lead.source_system) && (
        <div className="mb-1 text-xs text-slate-400">via {sourceLabel(lead.source ?? lead.source_system)}</div>
      )}
      {lead.trial_date && (
        <div className="flex items-center gap-1 text-xs text-amber-700 mb-2">
          <Calendar className="h-3 w-3" />Trial: {formatDate(lead.trial_date)}
        </div>
      )}
      {lead.assignee?.full_name && (
        <div className="text-xs text-slate-400 mb-2">Assigned: {lead.assignee.full_name}</div>
      )}
      {nextStage && (
        <form action={moveLeadStage} className="mt-2">
          <input type="hidden" name="id" value={lead.id} />
          <input type="hidden" name="stage" value={nextStage} />
          {nextStage === "trial_booked" && (
            <input type="date" name="trial_date" className="mb-1 w-full h-7 rounded border border-slate-200 px-2 text-xs" />
          )}
          <Button size="sm" variant="outline" type="submit" className="w-full h-7 text-xs gap-1">
            Move to {stageLabel(nextStage)}<ChevronRight className="h-3 w-3" />
          </Button>
        </form>
      )}
      {!["joined", "did_not_convert"].includes(lead.stage) && (
        <div className="mt-1 flex gap-1">
          <form action={moveLeadStage} className="flex-1">
            <input type="hidden" name="id" value={lead.id} />
            <input type="hidden" name="stage" value="joined" />
            <Button size="sm" variant="ghost" type="submit" className="w-full h-7 text-xs text-green-700 hover:bg-green-50 gap-1">
              <CheckCircle2 className="h-3 w-3" />Joined
            </Button>
          </form>
          <form action={moveLeadStage} className="flex-1">
            <input type="hidden" name="id" value={lead.id} />
            <input type="hidden" name="stage" value="did_not_convert" />
            <Button size="sm" variant="ghost" type="submit" className="w-full h-7 text-xs text-slate-500 hover:bg-slate-50 gap-1">
              <XCircle className="h-3 w-3" />Lost
            </Button>
          </form>
        </div>
      )}
      {lead.stage === "did_not_convert" && lead.lost_reason && (
        <div className="mt-1 text-xs text-slate-400 italic">&ldquo;{lead.lost_reason}&rdquo;</div>
      )}
      {lead.stage === "follow_up_required" && (
        <form action={triggerLeadFollowup} className="mt-1">
          <input type="hidden" name="lead_id" value={lead.id} />
          <Button size="sm" variant="ghost" type="submit" className="w-full h-7 text-xs text-blue-600 hover:bg-blue-50 gap-1">
            &#8594; Trigger Auto Follow-up
          </Button>
        </form>
      )}
    </div>
  );
}

export default async function LeadsPage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  const supabase = await createClient();

  const [leadsRes, staffRes] = await Promise.all([
    supabase.from("leads").select("*, assignee:profiles!leads_assigned_to_fkey(id, full_name)")
      .order("updated_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  const leads = (leadsRes.data ?? []) as Lead[];
  const staff = staffRes.data ?? [];

  const totalJoined = leads.filter((l) => l.stage === "joined").length;
  const open = leads.filter((l) => !["joined", "did_not_convert"].includes(l.stage));
  const staleOpen = open.filter((l) => { const d = daysSince(l.created_at); return d !== null && d >= 7; });
  const conversionRate = leads.length > 0 ? Math.round((totalJoined / leads.length) * 100) : 0;

  const byStage = new Map<string, Lead[]>();
  for (const s of ALL_STAGES) byStage.set(s.key, []);
  for (const l of leads) { const b = byStage.get(l.stage); if (b) b.push(l); }

  return (
    <AppShell profile={profile}>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Leads &amp; Trial Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-0.5">New enquiry &rarr; trial booked &rarr; attended &rarr; follow-up &rarr; joined</p>
        </div>
        <details className="relative">
          <summary className="cursor-pointer list-none">
            <Button variant="default" size="sm" className="gap-1">
              <UserPlus className="h-4 w-4" />Add Lead
            </Button>
          </summary>
          <div className="absolute right-0 mt-2 w-80 rounded-lg border bg-white shadow-lg z-10 p-4">
            <h3 className="font-medium mb-3">New Lead</h3>
            <form action={createLead} className="flex flex-col gap-2">
              <input name="full_name" placeholder="Full name *" required className="h-8 rounded border border-slate-200 px-3 text-sm" />
              <input name="email" type="email" placeholder="Email" className="h-8 rounded border border-slate-200 px-3 text-sm" />
              <input name="phone" placeholder="Phone" className="h-8 rounded border border-slate-200 px-3 text-sm" />
              <input name="interested_class" placeholder="Interested in (e.g. Boxing, BJJ)" className="h-8 rounded border border-slate-200 px-3 text-sm" />
              <select name="source" className="h-8 rounded border border-slate-200 px-3 text-sm">
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select name="stage" className="h-8 rounded border border-slate-200 px-3 text-sm">
                {ALL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <input name="trial_date" type="date" className="h-8 rounded border border-slate-200 px-3 text-sm" />
              <textarea name="notes" placeholder="Notes" rows={2} className="rounded border border-slate-200 px-3 py-1.5 text-sm resize-none" />
              <Button type="submit" size="sm">Create Lead</Button>
            </form>
          </div>
        </details>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="gap-2 py-4 border-l-4 border-l-primary">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{open.length}</div>
            <div className="mt-1 text-sm font-medium">Open leads</div>
            <div className="text-xs text-muted-foreground mt-0.5">in pipeline</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-success">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{totalJoined}</div>
            <div className="mt-1 text-sm font-medium">Total joined</div>
            <div className="text-xs text-muted-foreground mt-0.5">converted to member</div>
          </CardContent>
        </Card>
        <Card className="gap-2 py-4 border-l-4 border-l-border">
          <CardContent className="px-4">
            <div className="text-3xl font-bold tabular-nums">{conversionRate}%</div>
            <div className="mt-1 text-sm font-medium">Conversion rate</div>
            <div className="text-xs text-muted-foreground mt-0.5">leads → members</div>
          </CardContent>
        </Card>
        <Card className={`gap-2 py-4 border-l-4 ${staleOpen.length > 0 ? "border-l-destructive" : "border-l-border"}`}>
          <CardContent className="px-4">
            <div className={`text-3xl font-bold tabular-nums ${staleOpen.length > 0 ? "text-destructive" : ""}`}>{staleOpen.length}</div>
            <div className="mt-1 text-sm font-medium">Stale leads</div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="h-3 w-3" />no activity &gt;7 days
            </div>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 font-medium text-slate-700">Active Pipeline</h2>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4" style={{ minWidth: `${PIPELINE_STAGES.length * 260}px` }}>
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = byStage.get(stage.key) ?? [];
            return (
              <div key={stage.key} className="flex-1 min-w-[240px]">
                <div className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-white text-sm font-medium ${stage.color}`}>
                  <span>{stage.label}</span>
                  <span className="ml-auto rounded-full bg-white/30 px-2 py-0.5 text-xs font-semibold">{stageLeads.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {stageLeads.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No leads</div>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} nextStage={stage.next} staff={staff} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {CLOSED_STAGES.map((stage) => {
          const stageLeads = byStage.get(stage.key) ?? [];
          return (
            <div key={stage.key}>
              <div className={`mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-white text-sm font-medium ${stage.color}`}>
                <span>{stage.label}</span>
                <span className="ml-auto rounded-full bg-white/30 px-2 py-0.5 text-xs font-semibold">{stageLeads.length}</span>
              </div>
              {stageLeads.length === 0 ? (
                <p className="text-muted-foreground text-sm">None yet.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {stageLeads.slice(0, 20).map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-white px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{lead.full_name ?? "Unknown"}</div>
                        <div className="text-xs text-slate-400">
                          {lead.email ?? lead.phone ?? ""}{lead.lost_reason ? ` - ${lead.lost_reason}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0">{formatDate(lead.updated_at)}</div>
                    </div>
                  ))}
                  {stageLeads.length > 20 && <p className="text-xs text-slate-400 text-center pt-1">+{stageLeads.length - 20} more</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details className="mt-10">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900">
          Edit / manage all leads ({leads.length})
        </summary>
        <div className="mt-4 overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Lead</th>
                <th className="px-3 py-2 text-left font-medium">Interested in</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-left font-medium">Trial</th>
                <th className="px-3 py-2 text-left font-medium">Stage</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-medium">{l.full_name ?? "Unknown"}</div>
                    <div className="text-xs text-slate-400">{l.email ?? l.phone ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.interested_class ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{sourceLabel(l.source ?? l.source_system)}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{formatDate(l.trial_date)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[l.stage] ?? "bg-slate-100 text-slate-600"}`}>
                      {stageLabel(l.stage)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <form action={updateLead} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <select name="stage" defaultValue={l.stage} className="h-7 rounded border border-slate-200 px-1.5 text-xs">
                          {ALL_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <select name="assigned_to" defaultValue={l.assigned_to ?? ""} className="h-7 rounded border border-slate-200 px-1.5 text-xs">
                          <option value="">unassigned</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.id.slice(0, 8)}</option>)}
                        </select>
                        <Button size="sm" variant="outline" type="submit" className="h-7 text-xs">Save</Button>
                      </form>
                      <form action={deleteLead}>
                        <input type="hidden" name="id" value={l.id} />
                        <Button size="sm" variant="ghost" type="submit" className="h-7 text-xs text-red-500 hover:bg-red-50">Del</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </AppShell>
  );
}
