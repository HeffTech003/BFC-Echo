-- =============================================================================
-- BFC Command Centre — Phase 3: compliance & safety
--
-- Adds:
--   * form_links — secure, expiring, member-specific links for medical /
--     youth-onboarding forms, completed by the member/guardian WITHOUT a
--     staff account (token-gated via security-definer RPCs).
--   * get_form_link_info() / submit_member_form() — the public form flow.
--   * Incident close guard — an incident can only be closed with outcome
--     notes (enforced by trigger, not just the UI).
--
-- Reminder (from the project guardrails): get legal/privacy review before
-- production launch of health and child-safety data collection.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Secure expiring form links
-- ---------------------------------------------------------------------------
create table public.form_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  member_id    uuid not null references public.members (id),
  form_type    text not null default 'medical_participation',  -- medical_participation | youth_onboarding
  created_by   uuid references public.profiles (id),
  expires_at   timestamptz not null default now() + interval '14 days',
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index form_links_member_idx on public.form_links (member_id);

alter table public.form_links enable row level security;

create policy form_links_select on public.form_links
  for select using (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy form_links_insert on public.form_links
  for insert with check (public.bfc_has_role(array['owner_director','child_safety_lead']));
create policy form_links_update on public.form_links
  for update using (public.bfc_has_role(array['owner_director','child_safety_lead']));

-- ---------------------------------------------------------------------------
-- Public form flow (anon role). The token is the only credential; RPCs
-- validate expiry and single-use, and expose the minimum necessary data.
-- ---------------------------------------------------------------------------
create or replace function public.get_form_link_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link public.form_links%rowtype;
  v_first_name text;
  v_is_youth boolean;
  v_policies jsonb;
begin
  select * into v_link from public.form_links where token = p_token;

  if not found or v_link.used_at is not null or v_link.expires_at < now() then
    return jsonb_build_object('valid', false);
  end if;

  select split_part(full_name, ' ', 1), is_youth
  into v_first_name, v_is_youth
  from public.members where id = v_link.member_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'policy_name', policy_name, 'version', version)), '[]'::jsonb)
  into v_policies
  from public.policy_versions
  where is_current
    and required_audience && (case
      when v_link.form_type = 'youth_onboarding' then array['youth_guardians','members']
      else array['members'] end);

  return jsonb_build_object(
    'valid', true,
    'form_type', v_link.form_type,
    'member_first_name', v_first_name,
    'is_youth', v_is_youth,
    'policies', v_policies
  );
end;
$$;

create or replace function public.submit_member_form(
  p_token        text,
  p_data         jsonb,
  p_signed_name  text,
  p_guardian_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.form_links%rowtype;
  v_form_id uuid;
  v_policy record;
begin
  select * into v_link from public.form_links where token = p_token for update;

  if not found or v_link.used_at is not null or v_link.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'This link is no longer valid.');
  end if;

  if coalesce(trim(p_signed_name), '') = '' then
    return jsonb_build_object('success', false, 'error', 'A signature name is required.');
  end if;

  insert into public.medical_forms
    (member_id, form_type, status, data, guardian_consent, privacy_notice_version, submitted_at, expires_at)
  values
    (v_link.member_id, v_link.form_type, 'submitted', coalesce(p_data, '{}'::jsonb),
     p_guardian_name is not null and trim(p_guardian_name) <> '',
     'v1', now(), now() + interval '12 months')
  returning id into v_form_id;

  -- Record acknowledgements for every current policy required for this form.
  for v_policy in
    select id from public.policy_versions
    where is_current
      and required_audience && (case
        when v_link.form_type = 'youth_onboarding' then array['youth_guardians','members']
        else array['members'] end)
  loop
    insert into public.policy_acknowledgements
      (policy_version_id, member_id, acknowledged_by_name, guardian_name, signature_method)
    values
      (v_policy.id, v_link.member_id, trim(p_signed_name), nullif(trim(coalesce(p_guardian_name, '')), ''), 'electronic');
  end loop;

  update public.form_links set used_at = now() where id = v_link.id;

  insert into public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, details)
  values (null, 'public_form', 'medical_form.submit', 'medical_forms', v_form_id::text,
          jsonb_build_object('form_link_id', v_link.id, 'form_type', v_link.form_type));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.get_form_link_info(text) to anon, authenticated;
grant execute on function public.submit_member_form(text, jsonb, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Incident close guard: outcome notes are mandatory to close a case.
-- ---------------------------------------------------------------------------
create or replace function public.guard_incident_close()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'closed' then
    if coalesce(trim(new.outcome_notes), '') = '' then
      raise exception 'An incident can only be closed with outcome notes (guardrail)';
    end if;
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end;
$$;

create trigger incident_close_guard before update on public.incident_reports
  for each row execute function public.guard_incident_close();
