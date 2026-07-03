import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Dashboard — BFC Command Centre" };

// Phase 1 will wire these tiles to live queries. In Phase 0 they exist so the
// layout, auth and role plumbing can be verified end-to-end.
const TILES: { label: string; hint: string }[] = [
  { label: "Active members", hint: "Clubworx sync" },
  { label: "Legacy payment members", hint: "GoCardless / legacy" },
  { label: "Failed payments to action", hint: "payment_events" },
  { label: "Open cancellations & pauses", hint: "cancellation intake" },
  { label: "New leads & trials", hint: "leads pipeline" },
  { label: "Incomplete compliance", hint: "policy acknowledgements" },
  { label: "Open safety incidents", hint: "restricted" },
  { label: "Supplier invoices due", hint: "invoice scanner" },
  { label: "Tasks due today", hint: "tasks" },
  { label: "System sync issues", hint: "sync_runs" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const profile = await requireProfile();
  const { denied } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">BFC Command Centre</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {profile.full_name || "unnamed"}{" "}
            <Badge variant="secondary" className="ml-1">
              {ROLE_LABELS[profile.role]}
            </Badge>
          </p>
        </div>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      {denied && (
        <p className="bg-destructive/10 text-destructive mb-6 rounded-md p-3 text-sm">
          You don&apos;t have access to that area. This attempt has been noted.
        </p>
      )}

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Phase 0 — Foundation</CardTitle>
          <CardDescription>
            Auth, roles, row-level security, audit logging and the canonical data
            model are in place. Dashboard tiles activate in Phase 1 once the
            read-only syncs land.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {TILES.map((tile) => (
          <Card key={tile.label} className="gap-2 py-4">
            <CardContent className="px-4">
              <div className="text-muted-foreground text-2xl font-semibold">—</div>
              <div className="mt-1 text-sm font-medium">{tile.label}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {tile.hint} · Phase 1
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
