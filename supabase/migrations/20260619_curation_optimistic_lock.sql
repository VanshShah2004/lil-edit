-- =============================================================================
-- Migration: optimistic concurrency for curation section saves
-- Created:   2026-06-19 (sorts after 20260618_curated_sections.sql)
--
-- Problem: curation_set_section_items is a full delete-and-replace, so two admin
-- tabs (or two admins) editing the same section are last-write-wins — whoever
-- saves second silently wipes the first's items.
--
-- Fix: the editor sends the section's updated_at as it was when the tab loaded
-- (p_expected_updated_at). If the section has been modified since, the save is
-- rejected with custom SQLSTATE 'P0409' and the backend surfaces HTTP 409; the
-- editor then refreshes its base version so a deliberate re-save overwrites.
-- NULL expected (older clients) skips the check — fully backward compatible.
--
-- The function now RETURNS the new updated_at so the client can save again
-- without refetching. SELECT ... FOR UPDATE serializes concurrent saves on the
-- same section row.
--
-- NOTE: drop-and-recreate (not CREATE OR REPLACE) because the signature changes;
-- replacing would leave the old 2-arg overload behind with default PUBLIC
-- execute. The revoke/grant must be re-applied to the new signature.
-- =============================================================================

drop function if exists public.curation_set_section_items(text, jsonb);

create function public.curation_set_section_items(
  p_section_key         text,
  p_items               jsonb,
  p_expected_updated_at timestamptz default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section_id uuid;
  v_updated_at timestamptz;
  v_item       jsonb;
  v_idx        integer := 0;
  v_now        timestamptz := now();
begin
  select id, updated_at into v_section_id, v_updated_at
    from public.curated_sections
   where section_key = p_section_key
     for update;

  if v_section_id is null then
    raise exception 'Unknown section_key: %', p_section_key;
  end if;

  if p_expected_updated_at is not null
     and v_updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = 'P0409',
      message = format(
        'Section %s was modified at %s, but this save is based on %s',
        p_section_key, v_updated_at, p_expected_updated_at
      );
  end if;

  delete from public.curated_section_items where section_id = v_section_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as t(value)
  loop
    insert into public.curated_section_items (
      section_id, sort_order, kind, product_base_sku,
      custom_title, custom_subtitle, custom_image_url, link_url, badge, meta, is_active
    ) values (
      v_section_id,
      v_idx,
      coalesce(nullif(v_item->>'kind', ''), 'product'),
      nullif(v_item->>'product_base_sku', ''),
      nullif(v_item->>'custom_title', ''),
      nullif(v_item->>'custom_subtitle', ''),
      nullif(v_item->>'custom_image_url', ''),
      nullif(v_item->>'link_url', ''),
      nullif(v_item->>'badge', ''),
      coalesce(v_item->'meta', '{}'::jsonb),
      coalesce((v_item->>'is_active')::boolean, true)
    );
    v_idx := v_idx + 1;
  end loop;

  -- The touch trigger also fires on this update; now() is transaction-stable,
  -- so the trigger's value equals v_now and the returned timestamp is exact.
  update public.curated_sections set updated_at = v_now where id = v_section_id;
  return v_now;
end;
$$;

-- Same lockdown as the 2-arg version (see 20260618 migration): SECURITY DEFINER
-- bypasses RLS and PostgREST exposes public functions to anon by default.
revoke execute on function public.curation_set_section_items(text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.curation_set_section_items(text, jsonb, timestamptz)
  to service_role;

-- Verify after applying:
--   select proname, pg_get_function_identity_arguments(oid)
--     from pg_proc where proname = 'curation_set_section_items';  -- one row, 3 args
