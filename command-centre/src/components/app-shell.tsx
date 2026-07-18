"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Inline SVG icon ───────────────────────────────────────────────────────────

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 shrink-0", className)}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  "/dashboard":       "M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9",
  "/members":         "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  "/tasks":           "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4",
  "/leads":           "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7M12 18v-6M9 15h6",
  "/retention":       "M22 12h-4l-3 9L9 3l-3 9H2",
  "/trial-funnel":    "M22 3H2l8 9.46V19l4 2v-8.54L22 3",
  "/email-review":    "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  "/cancellations":   "M18 6L6 18M6 6l12 12",
  "/communications":  "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  "/invoices":        "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  "/financial":       "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  "/subscriptions":   "M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
  "/expenses":        "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  "/match-queue":     "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "/payments":        "M2 5h20v14H2zM2 10h20",
  "/sync":            "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  "/actions-queue":   "M13 10V3L4 14h7v7l9-11h-7",
  "/compliance":      "M9 12l2 2 4-4M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "/audit":           "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  "/hours":           "M12 6v6l4 2M12 2a10 10 0 100 20A10 10 0 0012 2z",
  "/payroll":         "M9 8h6m-5 4h4m-6 4h8M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  "/timetable":       "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  "/attendance":      "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  "/grading":         "M12 15l-2 5L9 9l11 3-5 2zm0 0l5-5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122",
  "/merch":           "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  "/settings":        "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  "/advisor":         "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  "/email-triage":    "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  "/bank-feed":        "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  "/campaigns":        "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
};

// ── Nav config ────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard",      label: "Dashboard" },
  { href: "/members",        label: "Members" },
  { href: "/tasks",          label: "Tasks" },
  { href: "/timetable",      label: "Timetable",      roles: ["owner_director", "operations_admin", "finance", "coach"] },
  { href: "/attendance",     label: "Attendance",     roles: ["owner_director", "operations_admin", "coach"] },
  { href: "/grading",        label: "Gradings",       roles: ["owner_director", "operations_admin", "coach"] },
  { href: "/leads",          label: "Leads",          roles: ["owner_director", "operations_admin"] },
  { href: "/retention",      label: "Retention",      roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/trial-funnel",   label: "Trial Funnel",   roles: ["owner_director", "operations_admin"] },
  { href: "/email-review",   label: "Email Review",   roles: ["owner_director", "operations_admin"] },
  { href: "/cancellations",  label: "Cancellations",  roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/communications", label: "Communications", roles: ["owner_director", "operations_admin"] },
  { href: "/campaigns",      label: "Campaigns",      roles: ["owner_director", "operations_admin"] },
  { href: "/invoices",       label: "Invoices",       roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/financial",      label: "Financial",      roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/subscriptions",  label: "Subscriptions",  roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/expenses",       label: "Expenses",       roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/payments",       label: "Payments",       roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/bank-feed",      label: "Bank Feed",      roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/match-queue",    label: "Match Queue",    roles: ["owner_director", "operations_admin"] },
  { href: "/sync",           label: "Sync",           roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/actions-queue",  label: "Actions",        roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/hours",          label: "Hours",          roles: ["owner_director", "operations_admin", "finance", "coach"] },
  { href: "/payroll",        label: "Payroll",        roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/compliance",     label: "Compliance",     roles: ["owner_director", "operations_admin", "child_safety_lead", "coach"] },
  { href: "/audit",          label: "Audit",          roles: ["owner_director"] },
  { href: "/merch",          label: "Merch Shop" },
  { href: "/advisor",        label: "AI Advisor" },
  { href: "/settings",       label: "Integrations",   roles: ["owner_director"] },
  { href: "/email-triage",   label: "Email Triage AI", roles: ["owner_director", "operations_admin"] },
];

// Visual groupings with section labels
const NAV_GROUPS: { label?: string; hrefs: string[] }[] = [
  { hrefs: ["/dashboard"] },
  { label: "People",  hrefs: ["/members", "/tasks", "/timetable", "/attendance", "/grading", "/leads", "/retention", "/trial-funnel"] },
  { label: "Comms",   hrefs: ["/email-review", "/cancellations", "/communications", "/campaigns"] },
  { label: "Finance", hrefs: ["/invoices", "/financial", "/subscriptions", "/expenses", "/payments", "/bank-feed"] },
  { label: "Ops",     hrefs: ["/match-queue", "/sync", "/actions-queue", "/hours", "/payroll", "/compliance", "/audit"] },
  { label: "Shop",    hrefs: ["/merch"] },
  { label: "AI",      hrefs: ["/advisor", "/email-triage", "/settings"] },
];

// ── Sidebar content (shared between desktop + mobile) ─────────────────────────

function SidebarContent({
  profile,
  items,
  onNavClick,
}: {
  profile: Profile;
  items: NavItem[];
  onNavClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-800 px-4 gap-2">
        {/* BFC logo mark */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-600 text-white font-black text-xs leading-none select-none">
          BFC
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold tracking-tight text-white hover:text-red-400 transition-colors"
          onClick={onNavClick}
        >
          Bendigo Fight Centre
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_GROUPS.map((group, gi) => {
          const groupItems = items.filter((i) => group.hrefs.includes(i.href));
          if (groupItems.length === 0) return null;
          return (
            <div key={gi} className={gi > 0 ? "pt-4" : ""}>
              {group.label && (
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {groupItems.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavClick}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-red-600 text-white font-medium"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      )}
                    >
                      <Icon d={ICONS[item.href] ?? ""} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-zinc-800 p-3">
        <div className="mb-2.5 flex items-center gap-2 px-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-none text-zinc-100">
              {profile.full_name || "unnamed"}
            </p>
            <div className="mt-1.5">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-normal bg-zinc-800 text-zinc-400 border-zinc-700">
                {ROLE_LABELS[profile.role]}
              </Badge>
            </div>
          </div>
        </div>
        <form action={signOut}>
          <Button variant="outline" size="sm" className="w-full text-xs h-8 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 bg-transparent" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV.filter((n) => !n.roles || n.roles.includes(profile.role));

  return (
    <div className="flex min-h-svh bg-background">
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col border-r border-zinc-800 bg-zinc-950 z-30">
        <SidebarContent profile={profile} items={items} />
      </aside>

      {/* ── Mobile: backdrop ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile: slide-out sidebar ─────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-zinc-800 bg-zinc-950 shadow-xl",
          "transition-transform duration-200 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SidebarContent
          profile={profile}
          items={items}
          onNavClick={() => setMobileOpen(false)}
        />
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Mobile top bar */}
        <header className="flex h-14 shrink-0 items-center border-b bg-background px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="mr-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold">Bendigo Fight Centre</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
