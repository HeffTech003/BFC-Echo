import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mx-auto text-2xl">
          🥊
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded bg-red-600 text-white font-black text-xs mx-auto">
          BFC
        </div>
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
