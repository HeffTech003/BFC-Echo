export const metadata = { title: "Welcome to BFC!" };
export default function JoinSuccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-4xl">
          🥊
        </div>
        <h1 className="text-2xl font-bold">Welcome to Bendigo Fight Centre!</h1>
        <p className="text-muted-foreground">
          Your membership is confirmed. We&apos;ll send you a welcome email shortly with everything
          you need to get started.
        </p>
        <p className="text-sm text-muted-foreground">
          Questions? Call us or drop in — we&apos;re excited to have you.
        </p>
        <a href="/portal"
          className="inline-block mt-4 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Go to your member portal →
        </a>
      </div>
    </main>
  );
}
