import { requireProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import AdvisorClient from "./advisor-client";

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const profile = await requireProfile();
  return (
    <AppShell profile={profile}>
      <AdvisorClient />
    </AppShell>
  );
}
