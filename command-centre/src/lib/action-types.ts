// Catalogue of controlled write actions (Phase 4). Risk classification is
// duplicated in SQL (action_risk()) — that version is authoritative; this one
// only drives the UI.
export const ACTION_TYPES: Record<
  string,
  { label: string; targetSystem: string; high?: boolean }
> = {
  update_clubworx_contact: { label: "Update Clubworx contact details", targetSystem: "clubworx" },
  create_xero_invoice: { label: "Create Xero invoice", targetSystem: "xero" },
  create_gmail_draft: { label: "Create Gmail draft", targetSystem: "gmail" },
  apply_gmail_label: { label: "Apply Gmail label", targetSystem: "gmail" },
  archive_email: { label: "Archive routine email", targetSystem: "gmail" },
  payment_follow_up_task: { label: "Create payment follow-up task", targetSystem: "internal" },
  membership_pause_request: {
    label: "Submit membership PAUSE to source system",
    targetSystem: "clubworx",
    high: true,
  },
  membership_cancellation_request: {
    label: "Submit membership CANCELLATION to source system",
    targetSystem: "clubworx",
    high: true,
  },
  refund_request: { label: "Trigger refund workflow", targetSystem: "gocardless", high: true },
  bulk_reminder_send: { label: "Send approved bulk reminders", targetSystem: "gmail", high: true },
};
