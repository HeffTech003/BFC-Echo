-- =============================================================================
-- Migration 0010 — Member relationship linking
--
-- Stores named relationships between members (including NAC contacts).
-- Relationship types from the first member's perspective:
--   parent          → A is parent/guardian of B
--   child           → A is child/dependent of B
--   spouse          → symmetric
--   partner         → symmetric
--   sibling         → symmetric
--   emergency_contact → A is emergency contact for B
-- =============================================================================

create table public.member_relationships (
  id                uuid        primary key default gen_random_uuid(),
  member_id         uuid        not null references public.members(id) on delete cascade,
  related_member_id uuid        not null references public.members(id) on delete cascade,
  relationship_type text        not null,
  notes             text,
  created_by        uuid        references auth.users(id),
  created_at        timestamptz not null default now(),

  constraint member_relationships_type_check check (
    relationship_type in ('parent', 'child', 'spouse', 'partner', 'sibling', 'emergency_contact')
  ),
  constraint member_relationships_no_self check (member_id <> related_member_id),
  constraint member_relationships_unique unique (member_id, related_member_id)
);

create index member_relationships_member_id_idx         on public.member_relationships(member_id);
create index member_relationships_related_member_id_idx on public.member_relationships(related_member_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.member_relationships enable row level security;

-- All authenticated staff can read
create policy "member_relationships_select"
  on public.member_relationships for select
  using (public.bfc_has_role(array['owner_director','operations_admin','coach','child_safety_lead','finance','general_staff']));

-- Only admins can insert
create policy "member_relationships_insert"
  on public.member_relationships for insert
  with check (public.bfc_has_role(array['owner_director','operations_admin']));

-- Only admins can delete
create policy "member_relationships_delete"
  on public.member_relationships for delete
  using (public.bfc_has_role(array['owner_director','operations_admin']));
