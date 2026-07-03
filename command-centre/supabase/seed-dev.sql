-- =============================================================================
-- DEV/STAGING SEED DATA ONLY — never run against production.
-- Fictional members so the Phase 1 UI can be verified before real syncs land.
-- Safe to re-run (fixed UUIDs, upserts).
-- =============================================================================

insert into public.members (id, full_name, primary_email, primary_phone, member_status, is_youth)
values
  ('11111111-1111-4111-8111-111111111111', 'Alex Demo', 'alex.demo@example.com', '0400111222', 'active', false),
  ('22222222-2222-4222-8222-222222222222', 'Sam Sample', 'sam.sample@example.com', '0400333444', 'active', false),
  ('33333333-3333-4333-8333-333333333333', 'Riley Junior', 'parent.demo@example.com', '0400555666', 'active', true)
on conflict (id) do nothing;

insert into public.member_source_records
  (id, member_id, source_system, source_record_id, source_record_type, display_name, email, phone, match_status, last_synced_at)
values
  -- linked records
  ('aaaa1111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'clubworx', 'cw-1001', 'member', 'Alex Demo', 'alex.demo@example.com', '0400111222', 'matched', now()),
  ('aaaa1111-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'gocardless', 'CU000DEMO1', 'customer', 'Alex Demo', 'alex.demo@example.com', null, 'matched', now()),
  ('aaaa1111-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'clubworx', 'cw-1002', 'member', 'Sam Sample', 'sam.sample@example.com', '0400333444', 'matched', now()),
  -- unmatched fragments for the match queue (same email as Alex -> matcher suggests)
  ('aaaa1111-0000-4000-8000-000000000004', null, 'woocommerce', 'woo-501', 'customer', 'A. Demo', 'alex.demo@example.com', null, 'unmatched', now()),
  ('aaaa1111-0000-4000-8000-000000000005', null, 'xero', 'xero-c-77', 'contact', 'Alexander Demo', null, '0400 111 222', 'unmatched', now()),
  ('aaaa1111-0000-4000-8000-000000000006', null, 'square', 'sq-cust-9', 'customer', 'Legacy Person', 'legacy@example.com', null, 'unmatched', now())
on conflict (source_system, source_record_id) do nothing;

insert into public.memberships
  (id, member_id, source_system, source_record_id, source_customer_id, membership_type, status, billing_provider, amount, billing_interval, start_date, last_synced_at)
values
  ('bbbb1111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'clubworx', 'cw-mem-1', 'cw-1001', 'Adult Weekly', 'active', 'ezidebit', 44.99, 'weekly', '2024-02-01', now()),
  ('bbbb1111-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'gocardless', 'SB000DEMO1', 'CU000DEMO2', 'Monthly Direct Debit', 'active', 'gocardless', 229.99, 'monthly', '2022-06-01', now()),
  ('bbbb1111-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'clubworx', 'cw-mem-3', 'cw-1003', 'Youth Weekly', 'active', 'ezidebit', 39.99, 'weekly', '2025-01-15', now())
on conflict (source_system, source_record_id) do nothing;

insert into public.payment_events
  (id, member_id, source_system, source_record_id, source_customer_id, event_type, status, amount, occurred_at, description, last_synced_at)
values
  ('cccc1111-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'gocardless', 'PM-demo-1', 'CU000DEMO1', 'payment_paid', 'confirmed', 44.99, now() - interval '3 days', 'Weekly membership', now()),
  ('cccc1111-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'gocardless', 'PM-demo-2', 'CU000DEMO2', 'payment_failed', 'failed', 229.99, now() - interval '5 days', 'Monthly membership — insufficient funds', now()),
  ('cccc1111-0000-4000-8000-000000000003', null, 'square', 'sq-pay-77', 'sq-cust-9', 'payment_paid', 'completed', 25.00, now() - interval '10 days', 'Casual class', now()),
  ('cccc1111-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'woocommerce', 'woo-ord-88', 'woo-501', 'order', 'completed', 59.95, now() - interval '20 days', 'BFC hoodie', now())
on conflict (source_system, source_record_id) do nothing;

insert into public.leads (id, member_id, source, full_name, email, stage, interested_class, trial_date)
values
  ('dddd1111-0000-4000-8000-000000000001', null, 'website_chatbot', 'New Prospect', 'prospect@example.com', 'trial_booked', 'Boxing', current_date + 3),
  ('dddd1111-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'website_chatbot', 'Sam Sample', 'sam.sample@example.com', 'joined', 'Muay Thai', current_date - 200)
on conflict (id) do nothing;

insert into public.tasks (id, title, status, priority, due_date, related_member_id)
values
  ('eeee1111-0000-4000-8000-000000000001', 'Follow up failed payment — Sam Sample', 'open', 'high', current_date, '22222222-2222-4222-8222-222222222222'),
  ('eeee1111-0000-4000-8000-000000000002', 'Confirm trial booking — New Prospect', 'open', 'normal', current_date + 1, null)
on conflict (id) do nothing;

insert into public.sync_runs (id, source_system, run_type, status, started_at, finished_at, records_processed, records_created, records_updated)
values
  ('ffff1111-0000-4000-8000-000000000001', 'clubworx', 'manual', 'success', now() - interval '2 hours', now() - interval '2 hours' + interval '40 seconds', 120, 3, 117),
  ('ffff1111-0000-4000-8000-000000000002', 'gocardless', 'webhook', 'success', now() - interval '1 hour', now() - interval '59 minutes', 4, 2, 2),
  ('ffff1111-0000-4000-8000-000000000003', 'xero', 'scheduled', 'error', now() - interval '30 minutes', now() - interval '29 minutes', 0, 0, 0)
on conflict (id) do nothing;

update public.sync_runs
set error_message = 'Rate limited by Xero API (429) — retry scheduled'
where id = 'ffff1111-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- Phase 2 seed rows
-- ---------------------------------------------------------------------------
insert into public.email_review_queue
  (id, gmail_message_id, from_address, subject, snippet, received_at, category, protected, suggested_label, suggested_action, ai_summary, confidence, status)
values
  ('99991111-0000-4000-8000-000000000001', 'gm-demo-1', 'billing@supplier.example', 'Invoice INV-2041 due 14 July', 'Please find attached tax invoice...', now() - interval '4 hours', 'supplier_invoice', false, 'BFC/Finance/Supplier-Invoices', 'label', 'Supplier invoice from Example Pty, $412.50 due 14 July.', 'high', 'pending'),
  ('99991111-0000-4000-8000-000000000002', 'gm-demo-2', 'upset.member@example.com', 'Very disappointed with my last class', 'I want to talk to someone about what happened...', now() - interval '2 hours', 'complaint', true, 'BFC/Action-Required', 'label', 'Member complaint about a class experience. Needs a human reply.', 'high', 'pending'),
  ('99991111-0000-4000-8000-000000000003', 'gm-demo-3', 'newsletter@vendor.example', 'July gear catalogue', 'Check out our new range...', now() - interval '1 day', 'routine', false, null, 'archive', 'Marketing newsletter, no action needed.', 'medium', 'pending')
on conflict (gmail_message_id) do nothing;

insert into public.cancellation_requests
  (id, request_type, full_name, email, membership_type, reason, preferred_last_date, intake_source, status, source_system, source_record_id, last_synced_at)
values
  ('88881111-0000-4000-8000-000000000001', 'cancellation', 'Sam Sample', 'sam.sample@example.com', 'Monthly Direct Debit', 'moving away', current_date + 14, 'chatbot', 'new', 'n8n_cancellation_intake', 'conv-demo-1', now()),
  ('88881111-0000-4000-8000-000000000002', 'pause', 'Alex Demo', 'alex.demo@example.com', 'Adult Weekly', 'injury', current_date + 7, 'staff_phone', 'in_progress', 'n8n_cancellation_intake', 'staff-demo-2', now())
on conflict (source_system, source_record_id) do nothing;

update public.cancellation_requests set member_id = '22222222-2222-4222-8222-222222222222' where id = '88881111-0000-4000-8000-000000000001';
update public.cancellation_requests set member_id = '11111111-1111-4111-8111-111111111111' where id = '88881111-0000-4000-8000-000000000002';

insert into public.supplier_invoices
  (id, supplier, amount, gst, invoice_reference, due_date, description, status, source_system, source_record_id, last_synced_at)
values
  ('77771111-0000-4000-8000-000000000001', 'Example Gear Pty Ltd', 412.50, 37.50, 'INV-2041', current_date + 5, 'Gloves and pads restock', 'pending_review', 'gmail_invoice_scanner', 'gm-demo-1', now()),
  ('77771111-0000-4000-8000-000000000002', 'CleanCo Services', 180.00, 16.36, 'CC-889', current_date - 2, 'Monthly gym cleaning', 'reviewed', 'gmail_invoice_scanner', 'gm-demo-4', now())
on conflict (source_system, source_record_id) do nothing;
