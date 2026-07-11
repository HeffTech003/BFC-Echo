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
  "/dashboard":     "M3 12L12 3l9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9",
  "/members":       "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  "/tasks":         "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4",
  "/leads":         "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7M12 18v-6M9 15h6",
  "/email-review":  "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  "/cancellations": "M18 6L6 18M6 6l12 12",
  "/invoices":      "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  "/financial":     "M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  "/match-queue":   "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  "/payments":      "M2 5h20v14H2zM2 10h20",
  "/sync":          "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  "/actions-queue": "M13 10V3L4 14h7v7l9-11h-7",
  "/compliance":    "M9 12l2 2 4-4M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "/audit":         "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

// ── Nav config ────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard",     label: "Dashboard" },
  { href: "/members",       label: "Members" },
  { href: "/tasks",         label: "Tasks" },
  { href: "/leads",         label: "Leads",        roles: ["owner_director", "operations_admin"] },
  { href: "/email-review",  label: "Email Review", roles: ["owner_director", "operations_admin"] },
  { href: "/cancellations", label: "Cancellations",roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/invoices",      label: "Invoices",     roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/financial",     label: "Financial",    roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/match-queue",   label: "Match Queue",  roles: ["owner_director", "operations_admin"] },
  { href: "/payments",      label: "Payments",     roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/sync",          label: "Sync",         roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/actions-queue", label: "Actions",      roles: ["owner_director", "operations_admin", "finance"] },
  { href: "/compliance",    label: "Compliance",   roles: ["owner_director", "operations_admin", "child_safety_lead", "coach"] },
  { href: "/audit",         label: "Audit",        roles: ["owner_director"] },
];

// Visual groupings with section labels
const NAV_GROUPS: { label?: string; hrefs: string[] }[] = [
  { hrefs: ["/dashboard"] },
  { label: "People",  hrefs: ["/members", "/tasks", "/leads"] },
  { label: "Comms",   hrefs: ["/email-review", "/cancellations"] },
  { label: "Finance", hrefs: ["/invoices", "/financial", "/payments"] },
  { label: "Ops",     hrefs: ["/match-queue", "/sync", "/actions-queue", "/compliance", "/audit"] },
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
          Command Centre
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
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Mobile top bar (hamburger only) */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-zinc-950 border-zinc-800 px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
            aria-label="Open navigation"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-red-600 text-white font-black text-[10px] leading-none">BFC</div>
            <span className="text-sm font-semibold text-white">Command Centre</span>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
