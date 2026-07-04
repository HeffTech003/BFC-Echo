-- =============================================================================
-- BFC Command Centre — Phase 3 completion pass
--
-- Closes the gaps between the detailed Phase 3 spec and the Phase 3 that
-- shipped in migration 0004. Adds:
--   * members.has_medical_note — a coach-safe flag (boolean only; the medical
--     record contents stay RLS-locked to Owner/Director + Child Safety Lead).
--   * medical_forms.consent_given + privacy_notice_text — explicit consent and
--     the exact privacy-notice text shown, stored with the submission.
--   * incident_reports.evidence_refs + notifications_made — richer capture.
--   * bfc_privacy_notice() — the canonical, versioned privacy notice.
--   * get_form_link_info()/submit_member_form() updated for explicit consent.
--
-- Nothing here weakens the medical/incident RLS locks from migration 0001.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coach-safe "medical note on file" flag
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists has_medical_note boolean not null default false;

-- Maintained from medical_forms so coaches never need to read that table.
-- SECURITY DEFINER so it can update members regardless of who submitted the
-- form (the public form runs as the anon role via a definer RPC).
create or replace function public.sync_member_medical_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members
  set has_medical_note = exists (
    select 1 from public.medical_forms
    where member_id = new.member_id and status = 'submitted'
  )
  where id = new.member_id;
  return new;
end;
$$;

drop trigger if exists medical_forms_flag on public.medical_forms;
create trigger medical_forms_flag
  after insert or update on public.medical_forms
  for each row execute function public.sync_member_medical_flag();

-- Backfill for any forms already submitted.
update public.members m
set has_medical_note = exists (
  select 1 from public.medical_forms f
  where f.member_id = m.id and f.status = 'submitted'
);

-- ---------------------------------------------------------------------------
-- 2. Explicit consent + stored privacy notice on medical forms
-- ---------------------------------------------------------------------------
alter table public.medical_forms
  add column if not exists consent_given boolean not null default false,
  add column if not exists privacy_notice_text text;

-- Canonical, versioned privacy notice. Update the text and bump 'version'
-- here; the exact text is copied onto each submission for an audit trail.
create or replace function public.bfc_privacy_notice()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'version', 'v1',
    'text',
    'Bendigo Fight Centre collects the health and emergency information on this ' ||
    'form solely to keep you safe during training and to respond appropriately in ' ||
    'an emergency. We collect only what is relevant to safe participation. Your ' ||
    'information is stored securely, access is restricted to authorised staff ' ||
    '(the Owner/Director and Child Safety Lead), and every access is logged. We do ' ||
    'not share it except where required to respond to a medical emergency or as ' ||
    'required by law. You can ask us to review or correct your information at any ' ||
    'time. Handled in line with the Australian Privacy Act 1988 (Cth).'
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Richer incident capture
-- ---------------------------------------------------------------------------
alter table public.incident_reports
  add column if not exists evidence_refs jsonb not null default '[]'::jsonb,
  add column if not exists notifications_made text;

-- ---------------------------------------------------------------------------
-- 4. Public form flow: return the privacy notice; require explicit consent
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
    'policies', v_policies,
    'privacy_notice', public.bfc_privacy_notice()
  );
end;
$$;

-- Replace the 4-arg version with a 5-arg version that requires consent.
drop function if exists public.submit_member_form(text, jsonb, text, text);

create or replace function public.submit_member_form(
  p_token         text,
  p_data          jsonb,
  p_signed_name   text,
  p_guardian_name text default null,
  p_consent       boolean default false
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
  v_notice jsonb := public.bfc_privacy_notice();
begin
  select * into v_link from public.form_links where token = p_token for update;

  if not found or v_link.used_at is not null or v_link.expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'This link is no longer valid.');
  end if;

  if coalesce(trim(p_signed_name), '') = '' then
    return jsonb_build_object('success', false, 'error', 'A signature name is required.');
  end if;

  if p_consent is not true then
    return jsonb_build_object('success', false, 'error', 'Consent is required to submit this form.');
  end if;

  insert into public.medical_forms
    (member_id, form_type, status, data, guardian_consent, consent_given,
     privacy_notice_version, privacy_notice_text, submitted_at, expires_at)
  values
    (v_link.member_id, v_link.form_type, 'submitted', coalesce(p_data, '{}'::jsonb),
     p_guardian_name is not null and trim(p_guardian_name) <> '', true,
     v_notice ->> 'version', v_notice ->> 'text', now(), now() + interval '12 months')
  returning id into v_form_id;

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
      (v_policy.id, v_link.member_id, trim(p_signed_name),
       nullif(trim(coalesce(p_guardian_name, '')), ''), 'electronic');
  end loop;

  update public.form_links set used_at = now() where id = v_link.id;

  insert into public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, details)
  values (null, 'public_form', 'medical_form.submit', 'medical_forms', v_form_id::text,
          jsonb_build_object('form_link_id', v_link.id, 'form_type', v_link.form_type,
                             'consent', true, 'privacy_notice_version', v_notice ->> 'version'));

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.bfc_privacy_notice() to anon, authenticated;
grant execute on function public.get_form_link_info(text) to anon, authenticated;
grant execute on function public.submit_member_form(text, jsonb, text, text, boolean) to anon, authenticated;
