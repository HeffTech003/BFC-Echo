import { signIn } from "./actions";
import { LoginAuthHandler } from "./login-auth-handler";
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

export const metadata = { title: "Sign in — Bendigo Fight Centre" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deactivated?: string }>;
}) {
  const { error, deactivated } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <LoginAuthHandler />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Bendigo Fight Centre</CardTitle>
          <CardDescription>
            Staff sign-in. Access is role-based and audited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signIn} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error === "invalid" && (
              <p className="text-destructive text-sm">Invalid email or password.</p>
            )}
            {error === "missing" && (
              <p className="text-destructive text-sm">Enter your email and password.</p>
            )}
            {deactivated && (
              <p className="text-destructive text-sm">
                This account has been deactivated. Contact the Owner/Director.
              </p>
            )}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
