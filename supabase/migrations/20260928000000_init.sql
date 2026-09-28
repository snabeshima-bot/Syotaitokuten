-- 招待特典 発送先収集システム 初期スキーマ

create extension if not exists pgcrypto;

-- ============================================================
-- テーブル
-- ============================================================

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  title text not null,
  description text not null default '',
  image_url text,
  event_date date,
  opens_at timestamptz,
  closes_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  retention_days int not null default 90 check (retention_days >= 0),
  personal_data_purged_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete restrict,
  sort_order int not null default 0,
  primary key (event_id, member_id)
);

create table public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  min_count int not null check (min_count >= 1),
  name text not null,
  description text not null default '',
  requires_member boolean not null default false,
  delivery text not null default 'ship' check (delivery in ('ship', 'hand')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index reward_tiers_event_idx on public.reward_tiers (event_id, min_count);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint generated always as identity unique,
  event_id uuid not null references public.events (id) on delete cascade,
  ticket_number text not null,
  nickname text not null,
  email text,
  claimed_count int not null check (claimed_count >= 1),
  confirmed_count int check (confirmed_count >= 0),
  full_name text,
  phone text,
  postal_code text,
  address1 text,
  address2 text,
  status text not null default 'received'
    check (status in ('received', 'verified', 'preparing', 'shipped', 'on_hold', 'invalid')),
  duplicate_suspected boolean not null default false,
  staff_note text not null default '',
  ip_hash text,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, ticket_number)
);
create index submissions_event_idx on public.submissions (event_id, created_at desc);
create index submissions_ip_idx on public.submissions (ip_hash, created_at desc);

create table public.submission_rewards (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  tier_id uuid not null references public.reward_tiers (id) on delete cascade,
  member_id uuid references public.members (id) on delete restrict,
  unique (submission_id, tier_id)
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  carrier text not null default '',
  tracking_number text not null default '',
  shipped_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  staff_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger submissions_touch before update on public.submissions
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS: 閲覧・更新はスタッフのみ。公開フォームはサーバーから service_role で submit_invitation を呼ぶ
-- ============================================================

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.reward_tiers enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_rewards enable row level security;
alter table public.shipments enable row level security;
alter table public.staff enable row level security;
alter table public.audit_logs enable row level security;

create policy staff_all on public.members for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.events for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.event_members for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.reward_tiers for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.submissions for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.submission_rewards for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_all on public.shipments for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy staff_read on public.staff for select to authenticated using (public.is_staff());
create policy staff_read on public.audit_logs for select to authenticated using (public.is_staff());
create policy staff_insert on public.audit_logs for insert to authenticated
  with check (public.is_staff() and staff_user_id = auth.uid());

-- ============================================================
-- 受付: 公開フォームからの送信を1トランザクションで登録する
-- p: { event_id, ticket_number, nickname, email, claimed_count, full_name, phone,
--      postal_code, address1, address2, ip_hash, members: { <tier_id>: <member_id> } }
-- ============================================================

create or replace function public.submit_invitation(p jsonb)
returns table (submission_id uuid, receipt_no bigint)
language plpgsql as $$
declare
  ev public.events;
  v_count int := (p->>'claimed_count')::int;
  v_sub public.submissions;
  t record;
  v_member uuid;
  v_needs_ship boolean := false;
begin
  select * into ev from public.events where id = (p->>'event_id')::uuid for share;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;
  if ev.status <> 'open'
     or (ev.opens_at is not null and now() < ev.opens_at)
     or (ev.closes_at is not null and now() > ev.closes_at) then
    raise exception 'event_closed' using errcode = 'P0001';
  end if;
  if v_count is null or v_count < 1 then
    raise exception 'invalid_count' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.reward_tiers where event_id = ev.id and min_count <= v_count) then
    raise exception 'invalid_count' using errcode = 'P0001';
  end if;

  if nullif(p->>'ip_hash', '') is not null and (
    select count(*) from public.submissions s
    where s.ip_hash = p->>'ip_hash' and s.created_at > now() - interval '10 minutes'
  ) >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select bool_or(delivery = 'ship') into v_needs_ship
  from public.reward_tiers where event_id = ev.id and min_count <= v_count;

  if coalesce(v_needs_ship, false) and (
    nullif(p->>'full_name', '') is null or nullif(p->>'phone', '') is null
    or nullif(p->>'postal_code', '') is null or nullif(p->>'address1', '') is null
  ) then
    raise exception 'address_required' using errcode = 'P0001';
  end if;

  begin
    insert into public.submissions (
      event_id, ticket_number, nickname, email, claimed_count,
      full_name, phone, postal_code, address1, address2, ip_hash, duplicate_suspected
    ) values (
      ev.id, p->>'ticket_number', p->>'nickname', nullif(p->>'email', ''), v_count,
      nullif(p->>'full_name', ''), nullif(p->>'phone', ''), nullif(p->>'postal_code', ''),
      nullif(p->>'address1', ''), nullif(p->>'address2', ''), nullif(p->>'ip_hash', ''),
      exists (
        select 1 from public.submissions s
        where s.event_id = ev.id and (
          (nullif(p->>'email', '') is not null and lower(s.email) = lower(p->>'email'))
          or (nullif(p->>'phone', '') is not null and s.phone = p->>'phone')
        )
      )
    ) returning * into v_sub;
  exception when unique_violation then
    raise exception 'duplicate_ticket' using errcode = 'P0001';
  end;

  -- 同じメール・電話の既存回答にも重複候補の印をつける
  if v_sub.duplicate_suspected then
    update public.submissions s set duplicate_suspected = true
    where s.event_id = ev.id and s.id <> v_sub.id and (
      (v_sub.email is not null and lower(s.email) = lower(v_sub.email))
      or (v_sub.phone is not null and s.phone = v_sub.phone)
    );
  end if;

  for t in
    select * from public.reward_tiers where event_id = ev.id and min_count <= v_count
  loop
    v_member := null;
    if t.requires_member then
      v_member := nullif(p->'members'->>(t.id::text), '')::uuid;
      if v_member is null or not exists (
        select 1 from public.event_members em where em.event_id = ev.id and em.member_id = v_member
      ) then
        raise exception 'member_required' using errcode = 'P0001';
      end if;
    end if;
    insert into public.submission_rewards (submission_id, tier_id, member_id)
    values (v_sub.id, t.id, v_member);
  end loop;

  return query select v_sub.id, v_sub.receipt_no;
end;
$$;

-- ============================================================
-- スタッフによる人数確定: 特典の明細を組み直す
-- 残る特典の希望メンバーは保持し、新しく届いた特典は「未選択」(member_id = null) で追加する
-- ============================================================

create or replace function public.set_confirmed_count(p_submission_id uuid, p_count int)
returns void
language plpgsql as $$
declare
  v_sub public.submissions;
begin
  if p_count is not null and p_count < 0 then
    raise exception 'invalid_count' using errcode = 'P0001';
  end if;

  update public.submissions set confirmed_count = p_count
  where id = p_submission_id returning * into v_sub;
  if not found then
    raise exception 'submission_not_found' using errcode = 'P0001';
  end if;

  delete from public.submission_rewards sr
  using public.reward_tiers t
  where sr.submission_id = v_sub.id and t.id = sr.tier_id
    and t.min_count > coalesce(v_sub.confirmed_count, v_sub.claimed_count);

  insert into public.submission_rewards (submission_id, tier_id, member_id)
  select v_sub.id, t.id, null
  from public.reward_tiers t
  where t.event_id = v_sub.event_id
    and t.min_count <= coalesce(v_sub.confirmed_count, v_sub.claimed_count)
  on conflict (submission_id, tier_id) do nothing;
end;
$$;

-- ============================================================
-- 集計: 特典 × メンバーごとの必要数（無効の回答は除く）
-- ============================================================

create or replace view public.reward_summary with (security_invoker = true) as
select
  t.event_id,
  t.id as tier_id,
  t.min_count,
  t.name as tier_name,
  t.delivery,
  sr.member_id,
  m.name as member_name,
  count(*)::int as quantity
from public.submission_rewards sr
join public.submissions s on s.id = sr.submission_id
join public.reward_tiers t on t.id = sr.tier_id
left join public.members m on m.id = sr.member_id
where s.status <> 'invalid'
group by t.event_id, t.id, t.min_count, t.name, t.delivery, sr.member_id, m.name;

-- ============================================================
-- 個人情報の削除: 公演日 + 保存期間 を過ぎた公演の送付先・連絡先を消す
-- ============================================================

create or replace function public.purge_personal_data()
returns int
language plpgsql as $$
declare
  v_rows int;
begin
  with targets as (
    select id from public.events
    where event_date is not null
      and personal_data_purged_at is null
      and event_date + retention_days < current_date
  ), purged as (
    update public.submissions s set
      email = null, full_name = null, phone = null,
      postal_code = null, address1 = null, address2 = null,
      ip_hash = null, purged_at = now()
    where s.event_id in (select id from targets) and s.purged_at is null
    returning 1
  ), marked as (
    update public.events e set personal_data_purged_at = now()
    where e.id in (select id from targets)
    returning 1
  )
  select count(*) into v_rows from purged;
  return v_rows;
end;
$$;

-- 公開側（anon）からは直接呼ばせない
revoke execute on function public.submit_invitation(jsonb) from public, anon, authenticated;
revoke execute on function public.purge_personal_data() from public, anon, authenticated;
grant execute on function public.submit_invitation(jsonb) to service_role;
grant execute on function public.purge_personal_data() to service_role;
revoke execute on function public.set_confirmed_count(uuid, int) from public, anon;
grant execute on function public.set_confirmed_count(uuid, int) to authenticated, service_role;

-- ============================================================
-- 告知画像用の Storage バケット（公開読み取り、書き込みはスタッフのみ）
-- ============================================================

insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy event_images_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.is_staff());
create policy event_images_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and public.is_staff());
create policy event_images_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.is_staff());
