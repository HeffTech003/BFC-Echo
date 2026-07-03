-- =============================================================================
-- BFC Command Centre — Phase 4: controlled write actions
--
-- The ONLY write path back into source systems:
--
--   staff request  →  human approval  →  n8n executes via supported APIs  →  result written back
--   (app)             (app, role-gated)   (service role, outside the app)     (audit trail)
--
-- Guardrails enforced in the database:
--   * The app itself never calls Clubworx/GoCardless/Xero/Gmail — it only
--     stores requests. Execution is n8n's job, after approval.
--   * High-risk actions (cancellation, pause, refunds, bulk communications)
--     can only be approved by the Owner/Director.
--   * A request's payload is frozen once it leaves 'requested' — nobody can
--     alter what was approved after the fact.
--   * Status transitions are validated; approvals go through definer RPCs
--     that audit-log every decision (including self-approvals).
--   * Every executed action records: the requested action, approver, target
--     system, exact record changed, timestamp, API response, success/failure
--     and retry state (handoff requirement).
-- =============================================================================

create table public.action_requests (
  id                uuid primary key default gen_random_uuid(),
  action_type       text not null,
  -- update_clubworx_contact | create_xero_invoice | create_gmail_draft |
  -- apply_gmail_label | archive_email | payment_follow_up_task |
  -- membership_pause_request | membership_cancellation_request |
  -- refund_request | bulk_reminder_send
  target_system     text not null,      -- clubworx | xero | gmail | gocardless | internal
  target_record_id  text,               -- the exact record in the target system
  member_id         uuid references public.members (id) on delete set null,
  summary           text not null,      -- human-readable description of the change
  payload           jsonb not null default '{}'::jsonb,  -- exact change to make
  reason            text,
  risk_level        text not null default 'standard',    -- standard | high
  status            text not null default 'requested',
  -- requested -> approved | rejected | cancelled ; approved -> applied | failed
  requested_by      uuid not null references public.profiles (id),
  requested_at      timestamptz not null default now(),
  approved_by       uuid references public.profiles (id),
  approved_at       timestamptz,
  decision_note     text,
  -- execution results (written by n8n via the service role)
  applied_at        timestamptz,
  api_response      jsonb,
  error_message     text,
  attempt_count     integer not null default 0,
  last_attempt_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index action_requests_status_idx on public.action_requests (status, requested_at desc);
create index action_requests_queue_idx on public.action_requests (status) where status = 'approved';

create trigger action_requests_touch before update on public.action_requests
  for each row execute function public.touch_updated_at();

-- High-risk classification lives in SQL so it cannot drift per-caller.
create or replace function public.action_risk(p_action_type text)
returns text
language sql
immutable
as $$
  select case
    when p_action_type in (
      'membership_pause_request',
      'membership_cancellation_request',
      'refund_request',
      'bulk_reminder_send'
    ) then 'high'
    else 'standard'
  end;
$$;

-- Freeze payloads after the request stage; validate transitions.
-- failed -> approved is allowed only so retry_action() can re-queue the SAME
-- approved payload; the payload-freeze clause above it means nothing about
-- the action can change on retry.
create or replace function public.guard_action_request()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'requested'
     and (new.payload is distinct from old.payload
          or new.action_type is distinct from old.action_type
          or new.target_system is distinct from old.target_system
          or new.target_record_id is distinct from old.target_record_id) then
    raise exception 'An action request cannot be modified after it leaves the requested state (guardrail)';
  end if;

  if old.status = 'requested' and new.status not in ('requested','approved','rejected','cancelled') then
    raise exception 'Invalid transition from requested to %', new.status;
  end if;
  if old.status = 'approved' and new.status not in ('approved','applied','failed','cancelled') then
    raise exception 'Invalid transition from approved to %', new.status;
  end if;
  if old.status = 'failed' and new.status not in ('failed','approved') then
    raise exception 'A failed action can only be retried (re-approved) or left failed';
  end if;
  if old.status in ('rejected','cancelled','applied') and new.status is distinct from old.status then
    raise exception 'Action request is final (%). Create a new request instead.', old.status;
  end if;

  return new;
end;
$$;

create trigger action_request_guard before update on public.action_requests
  for each row execute function public.guard_action_request();

-- ---------------------------------------------------------------------------
-- Request / decide / retry RPCs (role checks + audit inside the database)
-- ---------------------------------------------------------------------------
create or replace function public.request_action(
  p_action_type      text,
  p_target_system    text,
  p_summary          text,
  p_payload          jsonb default '{}'::jsonb,
  p_target_record_id text default null,
  p_member_id        uuid default null,
  p_reason           text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.bfc_has_role(array['owner_director','operations_admin','finance']) then
    raise exception 'not authorised';
  end if;

  insert into public.action_requests
    (action_type, target_system, target_record_id, member_id, summary, payload, reason,
     risk_level, requested_by)
  values
    (p_action_type, p_target_system, p_target_record_id, p_member_id, p_summary,
     coalesce(p_payload, '{}'::jsonb), p_reason, public.action_risk(p_action_type), auth.uid())
  returning id into v_id;

  perform public.log_audit('action.request', 'action_requests', v_id::text,
    jsonb_build_object('action_type', p_action_type, 'target_system', p_target_system,
                       'risk_level', public.action_risk(p_action_type)));
  return v_id;
end;
$$;

create or replace function public.decide_action(
  p_id       uuid,
  p_decision text,               -- approved | rejected | cancelled
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.action_requests%rowtype;
begin
  select * into v_req from public.action_requests where id = p_id for update;
  if not found then raise exception 'action request not found'; end if;
  if v_req.status <> 'requested' then raise exception 'action already decided'; end if;
  if p_decision not in ('approved','rejected','cancelled') then raise exception 'invalid decision'; end if;

  if p_decision = 'cancelled' then
    -- Requester may withdraw their own request; admins may cancel any.
    if v_req.requested_by <> auth.uid()
       and not public.bfc_has_role(array['owner_director','operations_admin']) then
      raise exception 'not authorised';
    end if;
  elsif v_req.risk_level = 'high' then
    -- High-risk: Owner/Director only (cancellations, pauses, refunds, bulk sends).
    if not public.bfc_has_role(array['owner_director']) then
      raise exception 'High-risk actions can only be approved by the Owner/Director (guardrail)';
    end if;
  else
    if not public.bfc_has_role(array['owner_director','operations_admin']) then
      raise exception 'not authorised';
    end if;
  end if;

  update public.action_requests
  set status        = p_decision,
      approved_by   = case when p_decision = 'approved' then auth.uid() else approved_by end,
      approved_at   = case when p_decision = 'approved' then now() else approved_at end,
      decision_note = coalesce(p_note, decision_note)
  where id = p_id;

  perform public.log_audit('action.' || p_decision, 'action_requests', p_id::text,
    jsonb_build_object(
      'action_type', v_req.action_type,
      'risk_level', v_req.risk_level,
      'self_approved', p_decision = 'approved' and v_req.requested_by = auth.uid()));
end;
$$;

create or replace function public.retry_action(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.action_requests%rowtype;
begin
  if not public.bfc_has_role(array['owner_director','operations_admin']) then
    raise exception 'not authorised';
  end if;

  select * into v_req from public.action_requests where id = p_id for update;
  if not found or v_req.status <> 'failed' then
    raise exception 'only failed actions can be retried';
  end if;

  -- Bypasses the finality guard deliberately: failed -> approved re-queues
  -- the SAME approved payload; nothing about the action can change.
  update public.action_requests
  set status = 'approved', error_message = null
  where id = p_id;

  perform public.log_audit('action.retry', 'action_requests', p_id::text,
    jsonb_build_object('attempt_count', v_req.attempt_count));
end;
$$;

grant execute on function public.request_action(text, text, text, jsonb, text, uuid, text) to authenticated;
grant execute on function public.decide_action(uuid, text, text) to authenticated;
grant execute on function public.retry_action(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: staff see the queue; ALL mutations flow through the RPCs above or the
-- n8n service role (result write-back). No direct authenticated writes.
-- ---------------------------------------------------------------------------
alter table public.action_requests enable row level security;

create policy actions_select on public.action_requests
  for select using (public.bfc_has_role(array['owner_director','operations_admin','finance']));
