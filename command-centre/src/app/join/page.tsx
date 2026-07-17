/**
 * /join — Public member sign-up flow
 * Correct BFC pricing as of 2026:
 *   Adult Weekly 6-month lock-in: $44.99/wk
 *   Adult Monthly no lock-in:     $229.99/mo
 *   Youth Weekly 6-month lock-in: $39.99/wk
 *   Youth Monthly no lock-in:     $199.99/mo
 *   Casual walk-in:               $25/session
 *   Family discounts handled via contact — not automated
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submitJoinForm } from "./actions";

export const metadata = { title: "Join Bendigo Fight Centre" };

const PLANS = [
  {
    id: "adult_weekly",
    label: "Adult — Weekly",
    price: "$44.99/week",
    badge: "6-month lock-in",
    description: "Unlimited classes, all disciplines. Billed weekly.",
  },
  {
    id: "adult_monthly",
    label: "Adult — Monthly",
    price: "$229.99/month",
    badge: "No lock-in",
    description: "Unlimited classes, all disciplines. Cancel anytime.",
  },
  {
    id: "youth_weekly",
    label: "Youth — Weekly",
    price: "$39.99/week",
    badge: "6-month lock-in",
    description: "Under 18. Billed weekly. Guardian required.",
  },
  {
    id: "youth_monthly",
    label: "Youth — Monthly",
    price: "$199.99/month",
    badge: "No lock-in",
    description: "Under 18. Cancel anytime. Guardian required.",
  },
  {
    id: "casual",
    label: "Casual Pass",
    price: "$25/session",
    badge: "Walk-in",
    description: "Any class, any discipline. No commitment.",
  },
] as const;

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string }>;
}) {
  const { error, plan: defaultPlan } = await searchParams;

  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white font-black text-lg">
            BFC
          </div>
          <h1 className="text-3xl font-bold">Join Bendigo Fight Centre</h1>
          <p className="mt-2 text-muted-foreground">
            Muay Thai · BJJ · Boxing · MMA · Wrestling — all in one gym.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <form action={submitJoinForm} className="space-y-6">
          {/* Personal details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">First name *</label>
                <input name="first_name" required placeholder="First name"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Last name *</label>
                <input name="last_name" required placeholder="Last name"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Email *</label>
                <input name="email" type="email" required placeholder="your@email.com"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Phone</label>
                <input name="phone" type="tel" placeholder="04xx xxx xxx"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Date of birth</label>
                <input name="date_of_birth" type="date"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">How did you hear about us?</label>
                <select name="source" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="referral">Friend / referral</option>
                  <option value="social_media">Social media</option>
                  <option value="google">Google search</option>
                  <option value="walk_in">Walked past</option>
                  <option value="website_chatbot">Website chatbot</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Plan selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose your membership</CardTitle>
              <CardDescription>All memberships include access to every class and discipline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PLANS.map(plan => (
                <label key={plan.id}
                  className="relative flex cursor-pointer items-start gap-4 rounded-lg border p-4 hover:border-primary [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary/5">
                  <input type="radio" name="plan" value={plan.id}
                    defaultChecked={plan.id === (defaultPlan ?? "adult_weekly")}
                    className="mt-1 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{plan.label}</span>
                      <Badge variant="outline" className="text-xs">{plan.badge}</Badge>
                      <span className="ml-auto font-semibold text-sm">{plan.price}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                  </div>
                </label>
              ))}

              {/* Family pricing callout */}
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Family pricing available</p>
                <p>2 youth — 15% off · 3 youth — 20% off · 4 youth — 25% off</p>
                <p className="mt-1">
                  Contact us to set up family billing:{" "}
                  <a href="mailto:bendigofightcentre@gmail.com" className="text-primary underline">
                    bendigofightcentre@gmail.com
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Waiver consent */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Waiver & consent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Participation waiver</p>
                <p>
                  Martial arts and combat sports carry inherent risks including injury. By joining,
                  you acknowledge these risks and agree to train safely, follow coach instructions,
                  and not train while injured without medical clearance. Bendigo Fight Centre is not
                  liable for injuries sustained during training unless caused by gross negligence.
                </p>
                <p className="mt-2">
                  Your personal data is stored securely per our Privacy Policy (available on request)
                  and Australian Privacy Act 1988 obligations.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="waiver_accepted" required className="mt-1 shrink-0" />
                <span>I have read and accept the participation waiver and privacy notice. *</span>
              </label>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Electronic signature (type your full name) *</label>
                <input name="signed_name" required placeholder="Your full legal name"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
              </div>
            </CardContent>
          </Card>

          <button type="submit"
            className="w-full h-12 rounded-lg bg-red-600 text-white font-semibold text-base hover:bg-red-700 transition-colors">
            Continue to payment →
          </button>
          <p className="text-center text-xs text-muted-foreground">
            Secure payment via Stripe. Your card details never touch our servers.
          </p>
        </form>
      </div>
    </main>
  );
}
