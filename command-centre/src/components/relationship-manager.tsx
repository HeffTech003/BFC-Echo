"use client";

// RelationshipManager — shows family/relationship links on a member profile.
// Allows admins to add new links (with member search) and remove existing ones.

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addRelationship,
  removeRelationship,
  searchMembers,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_INVERSE,
  type RelationshipType,
} from "@/app/actions/relationships";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelationshipRow = {
  id: string;
  member_id: string;
  related_member_id: string;
  relationship_type: string;
  notes: string | null;
  // joined from members
  related_member: {
    id: string;
    full_name: string | null;
    member_type: string | null;
    member_status: string | null;
  } | null;
  // is this row "outgoing" (member_id === currentMemberId) or "incoming"?
  direction: "outgoing" | "incoming";
};

type SearchResult = {
  id: string;
  full_name: string | null;
  member_type: string | null;
  member_status: string | null;
};

const MEMBER_TYPE_LABEL: Record<string, string> = {
  gym_member:      "Gym",
  nac:             "NAC",
  online_customer: "Online",
  staff:           "Staff",
  supplier:        "Supplier",
};

const REL_OPTIONS: { value: RelationshipType; label: string }[] = [
  { value: "parent",            label: "Parent / Guardian of" },
  { value: "child",             label: "Child / Dependent of" },
  { value: "spouse",            label: "Spouse" },
  { value: "partner",           label: "Partner" },
  { value: "sibling",           label: "Sibling" },
  { value: "emergency_contact", label: "Emergency Contact for" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  currentMemberId: string;
  relationships: RelationshipRow[];
  canWrite: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function RelationshipManager({ currentMemberId, relationships, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();

  // ── Add form state ─────────────────────────────────────────────────────────
  const [showForm, setShowForm]       = useState(false);
  const [query, setQuery]             = useState("");
  const [results, setResults]         = useState<SearchResult[]>([]);
  const [selected, setSelected]       = useState<SearchResult | null>(null);
  const [relType, setRelType]         = useState<RelationshipType>("parent");
  const [notes, setNotes]             = useState("");
  const [formMsg, setFormMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Search debounce ────────────────────────────────────────────────────────
  useEffect(() => {
    if (selected) return; // don't re-search once a member is chosen
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setResults([]); return; }

    searchTimer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchMembers(query, currentMemberId);
        setResults(res);
      });
    }, 300);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, currentMemberId, selected]);

  function handleSelect(r: SearchResult) {
    setSelected(r);
    setQuery(r.full_name ?? "");
    setResults([]);
  }

  function resetForm() {
    setQuery("");
    setSelected(null);
    setResults([]);
    setRelType("parent");
    setNotes("");
    setFormMsg(null);
  }

  function handleAdd() {
    if (!selected) return;
    setFormMsg(null);
    startTransition(async () => {
      const res = await addRelationship(currentMemberId, selected.id, relType, notes || undefined);
      if (res.success) {
        setFormMsg({ ok: true, text: `Linked ${selected.full_name ?? "member"} successfully.` });
        resetForm();
        setShowForm(false);
      } else {
        setFormMsg({ ok: false, text: res.error ?? "Failed to add relationship." });
      }
    });
  }

  // ── Remove ─────────────────────────────────────────────────────────────────
  const [removingId, setRemovingId] = useState<string | null>(null);

  function handleRemove(rel: RelationshipRow) {
    setRemovingId(rel.id);
    startTransition(async () => {
      await removeRelationship(rel.id, rel.member_id, rel.related_member_id);
      setRemovingId(null);
    });
  }

  // ── Display label helper ───────────────────────────────────────────────────
  function relLabel(rel: RelationshipRow): string {
    const type = rel.relationship_type as RelationshipType;
    if (rel.direction === "outgoing") {
      return RELATIONSHIP_LABELS[type] ?? type;
    } else {
      return RELATIONSHIP_INVERSE[type] ?? type;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Existing relationships */}
      {relationships.length === 0 ? (
        <p className="text-sm text-muted-foreground">No relationships linked yet.</p>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const other = rel.related_member;
            return (
              <div
                key={rel.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="shrink-0 text-xs font-normal">
                    {relLabel(rel)}
                  </Badge>
                  <Link
                    href={`/members/${other?.id ?? ""}`}
                    className="font-medium hover:underline truncate"
                  >
                    {other?.full_name ?? "Unknown"}
                  </Link>
                  {other?.member_type && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {MEMBER_TYPE_LABEL[other.member_type] ?? other.member_type}
                    </span>
                  )}
                  {rel.notes && (
                    <span className="text-xs text-muted-foreground truncate hidden md:inline">
                      — {rel.notes}
                    </span>
                  )}
                </div>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={removingId === rel.id || isPending}
                    onClick={() => handleRemove(rel)}
                  >
                    {removingId === rel.id ? "…" : "Remove"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Success / error message from add */}
      {formMsg && (
        <p className={`mt-2 text-sm ${formMsg.ok ? "text-success-foreground" : "text-destructive"}`}>
          {formMsg.text}
        </p>
      )}

      {/* Add relationship form */}
      {canWrite && (
        <div className="mt-3">
          {!showForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowForm(true); setFormMsg(null); }}
            >
              + Link a person
            </Button>
          ) : (
            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Link a person to this member</p>

              {/* Member search */}
              <div className="relative">
                <label className="text-xs text-muted-foreground block mb-1">Search by name</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                  placeholder="Type a name…"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                        onClick={() => handleSelect(r)}
                      >
                        <span className="font-medium">{r.full_name ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground">
                          {MEMBER_TYPE_LABEL[r.member_type ?? ""] ?? r.member_type ?? ""}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">{r.member_status ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Relationship type */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  This member is the…
                </label>
                <select
                  value={relType}
                  onChange={(e) => setRelType(e.target.value as RelationshipType)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {REL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Optional notes */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. paying parent, emergency contact only"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!selected || isPending}
                  onClick={handleAdd}
                >
                  {isPending ? "Saving…" : "Add link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { resetForm(); setShowForm(false); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
