import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import EmailTriageClient from "./email-triage-client";

export const dynamic = "force-dynamic";

export default async function EmailTriagePage() {
  const profile = await requireRole(["owner_director", "operations_admin"]);
  return (
    <AppShell profile={profile}>
      <EmailTriageClient />
    </AppShell>
  );
}
