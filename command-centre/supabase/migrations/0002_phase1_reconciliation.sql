-- =============================================================================
-- BFC Command Centre — Phase 1: read-only member reconciliation
--
-- Adds:
--   * suggested_member_id on member_source_records (the match queue)
--   * source_customer_id on memberships / payment_events so financial rows
--     can be linked to a member when their source record is matched
--   * run_member_matcher()      — rule-based suggestions with confidence
--   * approve_match()           — human approval links the record (audited)
--   * reject_match()            — human rejection (audited)
--   * create_member_from_source() — promote an unmatched record to a new
--                                   canonical member (audited)
--
-- Matching is transparent and rule-based (no black-box AI): exact email
-- match 0.95, phone match 0.85, exact full-name match 0.60. Uncertain
-- matches are never merged automatically — a human approves every link.
-- =============================================================================

alter table public.member_source_records
  add column if not exists suggested_member_id uuid references public.members (id);

create index if not exists msr_suggested_member_idx
  on public.member_source_records (suggested_member_id);

-- Which customer/contact/member the financial row belongs to in the source
-- system (e.g. GoCardless customer id, Xero contact id, Clubworx member id).
-- Connectors must populate this; approve_match() uses it to attach rows.
alter table public.memberships
  add column if not exists source_customer_id text;
alter table public.payment_events
  add column if not exists source_customer_id text;

create index if not exists memberships_source_customer_idx
  on public.memberships (source_system, source_customer_id);
create index if not exists payment_events_source_customer_idx
  on public.payment_events (source_system, source_customer_id);

-- ---------------------------------------------------------------------------
-- Rule-based matcher. Only Owner/Director and Operations Admin may run it.
-- Processes records currently 'unmatched'; leaves 'rejected' ones alone.
-- Returns the number of new suggestions.
-- ---------------------------------------------------------------------------
create or replace function public.run_member_matcher()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.bfc_has_role(array['owner_director','operations_admin']) then
    raise exception 'not authorised';
  end if;

  with best as (
    select distinct on (msr.id)
      msr.id as msr_id,
      m.id   as member_id,
      case
        when msr.email is not null and msr.email <> ''
             and lower(msr.email) = lower(m.primary_email) then 0.950
        when length(regexp_replace(coalesce(msr.phone, ''), '\D', '', 'g')) >= 8
             and regexp_replace(msr.phone, '\D', '', 'g')
               = regexp_replace(coalesce(m.primary_phone, ''), '\D', '', 'g') then 0.850
        when msr.display_name is not null and msr.display_name <> ''
             and lower(msr.display_name) = lower(m.full_name) then 0.600
      end as confidence
    from public.member_source_records msr
    join public.members m on m.merged_into is null and (
      (msr.email is not null and msr.email <> '' and lower(msr.email) = lower(m.primary_email))
      or (length(regexp_replace(coalesce(msr.phone, ''), '\D', '', 'g')) >= 8
          and regexp_replace(msr.phone, '\D', '', 'g')
            = regexp_replace(coalesce(m.primary_phone, ''), '\D', '', 'g'))
      or (msr.display_name is not null and msr.display_name <> ''
          and lower(msr.display_name) = lower(m.full_name))
    )
    where msr.match_status = 'unmatched' and msr.member_id is null
    order by msr.id,
      case
        when msr.email is not null and msr.email <> ''
             and lower(msr.email) = lower(m.primary_email) then 0.950
        when length(regexp_replace(coalesce(msr.phone, ''), '\D', '', 'g')) >= 8
             and regexp_replace(msr.phone, '\D', '', 'g')
               = regexp_replace(coalesce(m.primary_phone, ''), '\D', '', 'g') then 0.850
        else 0.600
      end desc
  )
  update public.member_source_records msr
  set suggested_member_id = best.member_id,
      match_confidence    = best.confidence,
      match_status        = 'suggested'
  from best
  where msr.id = best.msr_id;

  get diagnostics v_count = row_count;

  perform public.log_audit('match_queue.run_matcher', 'member_source_records', null,
    jsonb_build_object('suggestions', v_count));

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Human approval: link a source record to a canonical member and attach any
-- financial rows that belong to the same source customer.
-- ---------------------------------------------------------------------------
create or replace function public.approve_match(p_source_record_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.member_source_records%rowtype;
begin
  if not public.bfc_has_role(array['owner_director','operations_admin']) then
    raise exception 'not authorised';
  end if;

  select * into v_rec from public.member_source_records where id = p_source_record_id;
  if not found then raise exception 'source record not found'; end if;

  update public.member_source_records
  set member_id           = p_member_id,
      match_status        = 'matched',
      suggested_member_id = null,
      matched_by          = auth.uid(),
      matched_at          = now()
  where id = p_source_record_id;

  -- Attach financial rows carrying the same source customer id.
  update public.memberships
  set member_id = p_member_id
  where member_id is null
    and source_system = v_rec.source_system
    and source_customer_id = v_rec.source_record_id;

  update public.payment_events
  set member_id = p_member_id
  where member_id is null
    and source_system = v_rec.source_system
    and source_customer_id = v_rec.source_record_id;

  perform public.log_audit('match_queue.approve', 'member_source_records',
    p_source_record_id::text,
    jsonb_build_object('member_id', p_member_id, 'source_system', v_rec.source_system,
                       'source_record_id', v_rec.source_record_id));
end;
$$;

create or replace function public.reject_match(p_source_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.bfc_has_role(array['owner_director','operations_admin']) then
    raise exception 'not authorised';
  end if;

  update public.member_source_records
  set match_status = 'rejected', suggested_member_id = null, match_confidence = null
  where id = p_source_record_id;

  perform public.log_audit('match_queue.reject', 'member_source_records',
    p_source_record_id::text, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Promote an unmatched source record to a brand-new canonical member.
-- ---------------------------------------------------------------------------
create or replace function public.create_member_from_source(p_source_record_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.member_source_records%rowtype;
  v_member_id uuid;
begin
  if not public.bfc_has_role(array['owner_director','operations_admin']) then
    raise exception 'not authorised';
  end if;

  select * into v_rec from public.member_source_records where id = p_source_record_id;
  if not found then raise exception 'source record not found'; end if;
  if v_rec.member_id is not null then raise exception 'record already matched'; end if;

  insert into public.members (full_name, primary_email, primary_phone, member_status)
  values (coalesce(nullif(v_rec.display_name, ''), 'Unknown (' || v_rec.source_system || ')'),
          nullif(v_rec.email, ''), nullif(v_rec.phone, ''),
          case when v_rec.source_system in ('gocardless','xero') then 'legacy' else 'unknown' end)
  returning id into v_member_id;

  perform public.approve_match(p_source_record_id, v_member_id);

  perform public.log_audit('match_queue.create_member', 'members', v_member_id::text,
    jsonb_build_object('from_source_record', p_source_record_id));

  return v_member_id;
end;
$$;

grant execute on function public.run_member_matcher() to authenticated;
grant execute on function public.approve_match(uuid, uuid) to authenticated;
grant execute on function public.reject_match(uuid) to authenticated;
grant execute on function public.create_member_from_source(uuid) to authenticated;
