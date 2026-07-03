/** ISO timestamp n days in the past (for sync/report cutoffs). */
export function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

/** Today's date as YYYY-MM-DD. */
export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function formatMoney(amount: number | null | undefined, currency = "AUD") {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amount);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export const SOURCE_LABELS: Record<string, string> = {
  clubworx: "Clubworx",
  gocardless: "GoCardless",
  xero: "Xero",
  woocommerce: "WooCommerce",
  square: "Square",
  gmail: "Gmail",
  chatbot: "Chatbot",
};

export function sourceLabel(system: string | null | undefined) {
  if (!system) return "—";
  return SOURCE_LABELS[system] ?? system;
}
