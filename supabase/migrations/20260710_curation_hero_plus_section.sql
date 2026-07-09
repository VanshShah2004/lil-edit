-- HeroSection+ : the full-bleed swipe slides that follow the Home Collage grid
-- page become their own curated section (up to 4 slides, per-breakpoint images,
-- imageless tiles valid — the storefront pads with bundled defaults up to a
-- 2-slide floor). Home Collage itself now holds exactly its 4 grid photos.

insert into public.curated_sections (section_key, title, subtitle, item_type, max_items) values
  ('home_hero_plus', 'HeroSection+', null, 'editorial', 4)
on conflict (section_key) do nothing;

update public.curated_sections
   set max_items = 4
 where section_key = 'home_collage';

-- Any 5th+ tile already curated on Home Collage belongs to the new section now —
-- move it (sort_order renumbered from 0, per the RPC's array-position convention)
-- instead of letting the read-time max_items slice silently drop it.
with collage as (
  select id from public.curated_sections where section_key = 'home_collage'
), hero as (
  select id from public.curated_sections where section_key = 'home_hero_plus'
), ranked as (
  select i.id, row_number() over (order by i.sort_order, i.created_at) as rn
  from public.curated_section_items i
  join collage c on i.section_id = c.id
)
update public.curated_section_items i
   set section_id = (select id from hero),
       sort_order = r.rn - 5
  from ranked r
 where i.id = r.id
   and r.rn > 4;
