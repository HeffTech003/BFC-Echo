/**
 * /join — Public member sign-up flow
 * Step 1: Personal details + membership plan selection
 * Step 2: Waiver acceptance (reuses form_links system)
 * Step 3: Payment setup (Stripe Checkout or GoCardless)
 *
 * This is a server-rendered public page (no auth required).
 * On submission it creates: member record → Stripe customer → Checkout session
 */
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submitJoinForm } from "./actions";

export const metadata = { title: "Join Bendigo Fight Centre" };

const PLANS = [
  { id: "gym_monthly",   label: "Gym Membership",    price: "$89/month",  description: "Unlimited classes, all disciplines" },
  { id: "nac_monthly",   label: "NAC Membership",    price: "$69/month",  description: "National Accreditation Centre — competition focus" },
  { id: "casual",        label: "Casual Pass",        price: "$25/session", description: "No lock-in, pay per session" },
  { id: "online",        label: "Online Membership",  price: "$39/month",  description: "Video tutorials + programming, train from anywhere" },
] as const;

export default function JoinPage({ searchParams }: { searchParams: { error?: string; plan?: string } }) {
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

        {searchParams.error && (
          <div className="mb-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            {searchParams.error}
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
              <CardDescription>You can change or cancel anytime.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {PLANS.map(plan => (
                <label key={plan.id}
                  className="relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 hover:border-primary [&:has(input:checked)]:border-primary [&:has(input:checked)]:bg-primary/5">
                  <input type="radio" name="plan" value={plan.id}
                    defaultChecked={plan.id === (searchParams.plan ?? "gym_monthly")}
                    className="sr-only" />
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{plan.label}</span>
                    <Badge variant="secondary" className="text-xs">{plan.price}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{plan.description}</span>
                </label>
              ))}
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
