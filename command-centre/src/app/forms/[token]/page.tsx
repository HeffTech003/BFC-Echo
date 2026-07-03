import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitForm } from "./actions";

export const metadata = { title: "BFC Member Form — Bendigo Fight Centre" };

interface LinkInfo {
  valid: boolean;
  form_type?: string;
  member_first_name?: string;
  is_youth?: boolean;
  policies?: { id: string; policy_name: string; version: string }[];
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const { done, error } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_form_link_info", { p_token: token });
  const info = (data ?? { valid: false }) as LinkInfo;

  if (done) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Thank you! ✅</CardTitle>
            <CardDescription>
              Your form has been submitted securely to Bendigo Fight Centre. The team
              will be in touch if anything else is needed.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!info.valid) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link not available</CardTitle>
            <CardDescription>
              This form link has expired or was already used. Please contact Bendigo
              Fight Centre on 0408 311 470 for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const isYouthFlow = info.form_type === "youth_onboarding";

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isYouthFlow ? "Youth Onboarding & Medical Form" : "Medical & Participation Form"}
          </CardTitle>
          <CardDescription>
            For {info.member_first_name ?? "the member"} — Bendigo Fight Centre. We only
            collect information relevant to safe training. It is stored securely, access
            is restricted to authorised staff, and every access is logged. (Privacy
            notice v1.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="bg-destructive/10 text-destructive mb-4 rounded-md p-3 text-sm">
              {error}
            </p>
          )}
          <form action={submitForm} className="grid gap-4">
            <input type="hidden" name="token" value={token} />

            <div className="grid gap-2">
              <Label htmlFor="medical_conditions">
                Medical conditions relevant to training (or &ldquo;none&rdquo;)
              </Label>
              <Input id="medical_conditions" name="medical_conditions" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="medications">
                Medication we should know about in an emergency (optional)
              </Label>
              <Input id="medications" name="medications" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accessibility_needs">Accessibility needs (optional)</Label>
              <Input id="accessibility_needs" name="accessibility_needs" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="injury_history">
                Recent or recurring injuries coaches should know about (optional)
              </Label>
              <Input id="injury_history" name="injury_history" />
            </div>

            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="emergency_contact_name">Emergency contact name</Label>
                <Input id="emergency_contact_name" name="emergency_contact_name" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emergency_contact_phone">Emergency contact phone</Label>
                <Input id="emergency_contact_phone" name="emergency_contact_phone" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emergency_contact_relationship">Relationship</Label>
                <Input
                  id="emergency_contact_relationship"
                  name="emergency_contact_relationship"
                  required
                />
              </div>
            </div>

            {(info.policies?.length ?? 0) > 0 && (
              <div className="bg-muted mt-2 rounded-md p-4 text-sm">
                <p className="mb-2 font-medium">
                  By signing below {isYouthFlow ? "as parent/guardian " : ""}you acknowledge:
                </p>
                <ul className="list-disc pl-5">
                  {info.policies!.map((p) => (
                    <li key={p.id}>
                      {p.policy_name} (v{p.version})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isYouthFlow && (
              <div className="grid gap-2">
                <Label htmlFor="guardian_name">Parent / guardian full name</Label>
                <Input id="guardian_name" name="guardian_name" required />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="signed_name">
                {isYouthFlow
                  ? "Electronic signature (guardian types full name)"
                  : "Electronic signature (type your full name)"}
              </Label>
              <Input id="signed_name" name="signed_name" required />
            </div>

            <Button type="submit" className="mt-2">
              Submit securely
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
