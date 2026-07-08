import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavItem {
  href: string;
  label: string;
  roles?: Role[]; // undefined = all roles
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/tasks", label: "Tasks" },
  {
    href: "/leads",
    label: "Leads",
    roles: ["owner_director", "operations_admin"],
  },
  {
    href: "/email-review",
    label: "Email Review",
    roles: ["owner_director", "operations_admin"],
  },
  {
    href: "/cancellations",
    label: "Cancellations",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/invoices",
    label: "Invoices",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/financial",
    label: "Financial",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/match-queue",
    label: "Match Queue",
    roles: ["owner_director", "operations_admin"],
  },
  {
    href: "/payments",
    label: "Payments",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/sync",
    label: "Sync",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/actions-queue",
    label: "Actions",
    roles: ["owner_director", "operations_admin", "finance"],
  },
  {
    href: "/compliance",
    label: "Compliance",
    roles: ["owner_director", "operations_admin", "child_safety_lead", "coach"],
  },
  {
    href: "/audit",
    label: "Audit",
    roles: ["owner_director"],
  },
];

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const items = NAV.filter((n) => !n.roles || n.roles.includes(profile.role));

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/dashboard" className="font-semibold whitespace-nowrap">
            BFC Command Centre
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-accent rounded-md px-3 py-1.5"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {profile.full_name || "unnamed"}
            </span>
            <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  );
}
