"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TriageResult } from "../api/email-triage/route";

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "success"> = {
  high:   "destructive",
  medium: "warning",
  low:    "success",
};

const CATEGORY_LABELS: Record<string, string> = {
  membership_enquiry:   "Membership Enquiry",
  trial_class_request:  "Trial Class",
  cancellation_request: "Cancellation",
  billing_dispute:      "Billing Dispute",
  injury_complaint:     "Injury/Complaint",
  general_enquiry:      "General Enquiry",
  lead:                 "Lead",
  spam:                 "Spam",
  supplier:             "Supplier",
  compliment:           "Compliment",
  media_press:          "Media/Press",
  other:                "Other",
};

const EXAMPLE_EMAILS = [
  {
    from: "sarah.jones@gmail.com",
    subject: "Interested in trying BJJ",
    body: "Hi there, I've been thinking about trying BJJ for a while and stumbled across your gym. I'm a complete beginner — do you offer trial classes? I work full time so I'd need something in the evenings or weekends. What does membership cost? Thanks, Sarah",
  },
  {
    from: "mike.burns@hotmail.com",
    subject: "Cancel my membership",
    body: "I want to cancel my membership effective immediately. I've been charged again this month and I sent you a message two weeks ago about this. I'm not happy with how this has been handled. Please confirm cancellation and refund the last charge.",
  },
  {
    from: "tom.nguyen@gmail.com",
    subject: "Injured during class on Tuesday",
    body: "Hi, I injured my knee during the Tuesday wrestling class. I fell awkwardly and my knee has been swelling since. I've been to the doctor and they said it might be ligament damage. I'm not sure what to do from here and wanted to let you know.",
  },
];

export default function EmailTriageClient() {
  const [from,    setFrom]    = useState("");
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<TriageResult | null>(null);
  const [error,   setError]   = useState("");
  const [copied,  setCopied]  = useState(false);
  const [history, setHistory] = useState<{ from: string; subject: string; result: TriageResult }[]>([]);

  async function triage() {
    if (!from.trim() || !subject.trim() || !body.trim()) {
      setError("Please fill in From, Subject, and Body.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/email-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Triage failed");
      setResult(data);
      setHistory((prev) => [{ from, subject, result: data }, ...prev].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function loadExample(ex: typeof EXAMPLE_EMAILS[0]) {
    setFrom(ex.from);
    setSubject(ex.subject);
    setBody(ex.body);
    setResult(null);
    setError("");
  }

  async function copyReply() {
    if (!result) return;
    await navigator.clipboard.writeText(result.suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setFrom(""); setSubject(""); setBody(""); setResult(null); setError("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email Triage AI</h1>
        <p className="text-sm text-muted-foreground">
          Paste an inbound email — AI classifies, summarises, and drafts a reply
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Incoming Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="from">From</Label>
                <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="sender@email.com" />
              </div>
              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
              </div>
              <div>
                <Label htmlFor="body">Body</Label>
                <textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  placeholder="Paste the email body here…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={triage} disabled={loading} className="flex-1">
                  {loading ? "Analysing…" : "Triage Email"}
                </Button>
                <Button variant="outline" onClick={reset}>Clear</Button>
              </div>
            </CardContent>
          </Card>

          {/* Examples */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Try an example</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLE_EMAILS.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => loadExample(ex)}
                  className="w-full rounded-lg border p-3 text-left text-sm hover:bg-muted transition-colors"
                >
                  <div className="font-medium">{ex.subject}</div>
                  <div className="text-xs text-muted-foreground">{ex.from}</div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Result panel */}
        <div className="space-y-4">
          {result && (
            <>
              {/* Overview */}
              <Card className={result.escalate ? "border-l-4 border-l-destructive" : ""}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={PRIORITY_VARIANT[result.priority] ?? "outline"} className="uppercase tracking-wide">
                      {result.priority} priority
                    </Badge>
                    <Badge variant="secondary">
                      {CATEGORY_LABELS[result.category] ?? result.category}
                    </Badge>
                    {result.escalate && (
                      <Badge variant="destructive" className="font-bold">
                        ⚠ ESCALATE
                      </Badge>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
                    <p className="text-sm">{result.summary}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">CRM Action</p>
                    <p className="text-sm font-medium text-primary">{result.crmAction}</p>
                  </div>

                  {result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.tags.map((tag) => (
                        <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs">{tag}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Suggested reply */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Suggested Reply</CardTitle>
                    <Button size="sm" variant="outline" onClick={copyReply}>
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
                    {result.suggestedReply}
                  </pre>
                </CardContent>
              </Card>
            </>
          )}

          {!result && !loading && (
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed text-muted-foreground text-sm">
              Triage result will appear here
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-64 rounded-xl border text-muted-foreground text-sm gap-2">
              <span className="animate-spin">⏳</span> Analysing email…
            </div>
          )}

          {/* History */}
          {history.length > 1 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent ({history.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {history.slice(1).map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setResult(h.result)}
                    className="w-full rounded-lg border p-2.5 text-left text-xs hover:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[h.result.priority] ?? "outline"} className="uppercase text-[10px]">
                        {h.result.priority}
                      </Badge>
                      <span className="font-medium truncate">{h.subject}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 truncate">{h.from}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
