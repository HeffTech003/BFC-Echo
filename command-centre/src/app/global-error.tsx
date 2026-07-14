"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="flex min-h-screen flex-col items-center justify-center p-6 bg-white dark:bg-zinc-950">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded bg-red-600 text-white font-black text-sm">
            BFC
          </div>
          <h1 className="text-xl font-bold">Critical error</h1>
          <p className="text-sm text-gray-500">
            The application encountered an unexpected error.
            {error.digest && ` (${error.digest})`}
          </p>
          <button
            onClick={reset}
            className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
