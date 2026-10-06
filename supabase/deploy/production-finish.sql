-- 本番 Supabase（Syotaitokuten）の仕上げ用 SQL
-- 2026-10-03 時点で init_tables と security_columns_and_staff（テーブル・列・RLS・Storage）は適用済み。
-- 残り（関数・Google ログイン・サーバーキー・定期削除・メンバー）をまとめて入れる。
--
-- 使い方: Supabase の SQL Editor に貼り付け、最下部の <APP_SERVER_KEY> を Vercel に設定する値に置き換えて実行する。
-- 一度だけ実行すること（create policy / create table を含むため、2回目はエラーになる）。

begin;

-- ============================================================
-- 受付（暗号化・同意・修正トークンに対応）
-- p: { event_id, ticket_number, nickname, email, email_hash, claimed_count, full_name, phone, phone_hash,
--      postal_code, address1, address2, ip_hash, consented: true, edit_token_hash, edit_token_expires_at,
--      members: { <tier_id>: <member_id> } }
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
  if coalesce((p->>'consented')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = 'P0001';
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
      event_id, ticket_number, nickname, email, email_hash, claimed_count,
      full_name, phone, phone_hash, postal_code, address1, address2, ip_hash,
      consented_at, edit_token_hash, edit_token_expires_at, duplicate_suspected
    ) values (
      ev.id, p->>'ticket_number', p->>'nickname', nullif(p->>'email', ''), nullif(p->>'email_hash', ''), v_count,
      nullif(p->>'full_name', ''), nullif(p->>'phone', ''), nullif(p->>'phone_hash', ''),
      nullif(p->>'postal_code', ''), nullif(p->>'address1', ''), nullif(p->>'address2', ''),
      nullif(p->>'ip_hash', ''), now(),
      nullif(p->>'edit_token_hash', ''), nullif(p->>'edit_token_expires_at', '')::timestamptz,
      exists (
        select 1 from public.submissions s
        where s.event_id = ev.id and (
          (nullif(p->>'email_hash', '') is not null and s.email_hash = p->>'email_hash')
          or (nullif(p->>'phone_hash', '') is not null and s.phone_hash = p->>'phone_hash')
        )
      )
    ) returning * into v_sub;
  exception when unique_violation then
    raise exception 'duplicate_ticket' using errcode = 'P0001';
  end;

  if v_sub.duplicate_suspected then
    update public.submissions s set duplicate_suspected = true
    where s.event_id = ev.id and s.id <> v_sub.id and (
      (v_sub.email_hash is not null and s.email_hash = v_sub.email_hash)
      or (v_sub.phone_hash is not null and s.phone_hash = v_sub.phone_hash)
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
-- お客様による修正（修正リンクから）
-- 直せるのは希望メンバーと送付先だけ。チケット番号・人数は直せない
-- p: { edit_token_hash, members: {<tier_id>: <member_id>}, full_name, phone, phone_hash, postal_code, address1, address2 }
-- ============================================================

create or replace function public.update_invitation_by_token(p jsonb)
returns uuid
language plpgsql as $$
declare
  v_sub public.submissions;
  ev public.events;
  r record;
  v_member uuid;
  v_needs_ship boolean;
begin
  select * into v_sub from public.submissions
  where edit_token_hash = p->>'edit_token_hash' and edit_token_hash is not null
  for update;
  if not found or v_sub.edit_token_expires_at < now() or v_sub.purged_at is not null then
    raise exception 'edit_link_invalid' using errcode = 'P0001';
  end if;
  if v_sub.status not in ('received', 'verified') then
    raise exception 'edit_locked' using errcode = 'P0001';
  end if;
  select * into ev from public.events where id = v_sub.event_id;
  if ev.status <> 'open' or (ev.closes_at is not null and now() > ev.closes_at) then
    raise exception 'edit_locked' using errcode = 'P0001';
  end if;

  for r in
    select sr.id, t.id as tier_id from public.submission_rewards sr
    join public.reward_tiers t on t.id = sr.tier_id
    where sr.submission_id = v_sub.id and t.requires_member
  loop
    v_member := nullif(p->'members'->>(r.tier_id::text), '')::uuid;
    if v_member is null or not exists (
      select 1 from public.event_members em where em.event_id = v_sub.event_id and em.member_id = v_member
    ) then
      raise exception 'member_required' using errcode = 'P0001';
    end if;
    update public.submission_rewards set member_id = v_member where id = r.id;
  end loop;

  select bool_or(t.delivery = 'ship') into v_needs_ship
  from public.submission_rewards sr join public.reward_tiers t on t.id = sr.tier_id
  where sr.submission_id = v_sub.id;

  if coalesce(v_needs_ship, false) then
    if nullif(p->>'full_name', '') is null or nullif(p->>'phone', '') is null
       or nullif(p->>'postal_code', '') is null or nullif(p->>'address1', '') is null then
      raise exception 'address_required' using errcode = 'P0001';
    end if;
    update public.submissions set
      full_name = p->>'full_name', phone = p->>'phone', phone_hash = nullif(p->>'phone_hash', ''),
      postal_code = p->>'postal_code', address1 = p->>'address1', address2 = nullif(p->>'address2', '')
    where id = v_sub.id;
  end if;

  return v_sub.id;
end;
$$;

-- ============================================================
-- 人数確定: 誰がいつ確定したかを残す
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

  update public.submissions set
    confirmed_count = p_count,
    confirmed_at = case when p_count is null then null else now() end,
    confirmed_by = case when p_count is null then null else auth.uid() end
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
-- 個人情報の削除: ハッシュと修正トークンも消す
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
      email = null, email_hash = null, full_name = null, phone = null, phone_hash = null,
      postal_code = null, address1 = null, address2 = null,
      ip_hash = null, edit_token_hash = null, edit_token_expires_at = null, purged_at = now()
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

revoke execute on function public.update_invitation_by_token(jsonb) from public, anon, authenticated;
grant execute on function public.update_invitation_by_token(jsonb) to service_role;

-- Google ログインとアプリの権限の見直し
-- 1. 社内ドメイン（staff_email_domains）の Google アカウントでログインすると自動でスタッフになる
-- 2. Google ログイン（OAuth）のセッションもスタッフとして通す。パスワードログインは従来どおり2段階認証が必要
-- 3. アプリは Supabase の秘密鍵（service_role）を持たない。
--    公開フォームの送信・修正は「サーバーキー」を確認する関数だけを anon に開け、キーは DB にハッシュで保存する
-- 4. 公開中の公演・特典・メンバーは anon でも読める（公開フォームの表示用）
-- 5. 個人情報の自動削除を DB の定期実行（pg_cron）で行う

-- ============================================================
-- 外から見えない内部スキーマ
-- ============================================================

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.server_keys (
  name text primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);

-- サーバーキーを確認する。キーはアプリの環境変数 APP_SERVER_KEY と同じ値を sha256 で保存しておく
create or replace function app_private.assert_server_key(p_key text) returns void
language plpgsql stable security definer set search_path = app_private, public as $$
begin
  if p_key is null or not exists (
    select 1 from app_private.server_keys
    where name = 'app' and key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- ============================================================
-- 公開フォーム用の入口（サーバーキー必須）
-- ============================================================

create or replace function public.public_submit_invitation(p_key text, p jsonb)
returns table (submission_id uuid, receipt_no bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform app_private.assert_server_key(p_key);
  return query select * from public.submit_invitation(p);
end;
$$;

create or replace function public.public_update_invitation_by_token(p_key text, p jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform app_private.assert_server_key(p_key);
  return public.update_invitation_by_token(p);
end;
$$;

-- 修正ページの表示用。送付先などは暗号化されたまま返し、アプリのサーバーで復号する
create or replace function public.public_get_invitation_by_token(p_key text, p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform app_private.assert_server_key(p_key);
  select jsonb_build_object(
    'id', s.id, 'event_id', s.event_id, 'receipt_no', s.receipt_no, 'nickname', s.nickname,
    'status', s.status, 'purged_at', s.purged_at, 'edit_token_expires_at', s.edit_token_expires_at,
    'email', s.email, 'full_name', s.full_name, 'phone', s.phone, 'postal_code', s.postal_code,
    'address1', s.address1, 'address2', s.address2,
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', sr.id, 'tier_id', sr.tier_id, 'member_id', sr.member_id))
      from public.submission_rewards sr where sr.submission_id = s.id
    ), '[]'::jsonb)
  ) into v
  from public.submissions s
  where s.edit_token_hash = p_token_hash and p_token_hash is not null;
  return v;
end;
$$;

revoke execute on function public.public_submit_invitation(text, jsonb) from public;
revoke execute on function public.public_update_invitation_by_token(text, jsonb) from public;
revoke execute on function public.public_get_invitation_by_token(text, text) from public;
grant execute on function public.public_submit_invitation(text, jsonb) to anon, authenticated;
grant execute on function public.public_update_invitation_by_token(text, jsonb) to anon, authenticated;
grant execute on function public.public_get_invitation_by_token(text, text) to anon, authenticated;

-- ============================================================
-- 公開中の公演・特典・メンバーは誰でも読める（準備中は除く）
-- ============================================================

create or replace function public.is_public_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events where id = p_event_id and status <> 'draft');
$$;

create policy public_read on public.events for select to anon, authenticated using (status <> 'draft');
create policy public_read on public.reward_tiers for select to anon, authenticated using (public.is_public_event(event_id));
create policy public_read on public.event_members for select to anon, authenticated using (public.is_public_event(event_id));
create policy public_read on public.members for select to anon, authenticated using (
  exists (select 1 from public.event_members em where em.member_id = members.id and public.is_public_event(em.event_id))
);

-- ============================================================
-- スタッフ判定: 2段階認証済み、または Google ログイン
-- ============================================================

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or exists (
      select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
      where a ->> 'method' = 'oauth'
    )
  ) and exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ============================================================
-- 社内ドメインの Google アカウントを自動でスタッフにする
-- ============================================================

create table public.staff_email_domains (
  domain text primary key check (domain = lower(domain)),
  created_at timestamptz not null default now()
);
alter table public.staff_email_domains enable row level security;
create policy staff_all on public.staff_email_domains for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into public.staff_email_domains (domain) values ('focpro.co.jp') on conflict do nothing;

create or replace function public.grant_staff_by_domain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null
     and new.email_confirmed_at is not null
     and (
       new.raw_app_meta_data ->> 'provider' = 'google'
       or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
     )
     and exists (select 1 from public.staff_email_domains d where d.domain = lower(split_part(new.email, '@', 2)))
  then
    insert into public.staff (user_id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_grant_staff
  after insert or update of email_confirmed_at, raw_app_meta_data on auth.users
  for each row execute function public.grant_staff_by_domain();

-- ============================================================
-- 個人情報の自動削除: 削除したら操作ログに残す
-- ============================================================

create or replace function public.purge_personal_data()
returns int
language plpgsql security definer set search_path = public as $$
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
      email = null, email_hash = null, full_name = null, phone = null, phone_hash = null,
      postal_code = null, address1 = null, address2 = null,
      ip_hash = null, edit_token_hash = null, edit_token_expires_at = null, purged_at = now()
    where s.event_id in (select id from targets) and s.purged_at is null
    returning 1
  ), marked as (
    update public.events e set personal_data_purged_at = now()
    where e.id in (select id from targets)
    returning 1
  )
  select count(*) into v_rows from purged;
  if v_rows > 0 then
    insert into public.audit_logs (action, target_type, detail)
    values ('purge_personal_data', 'system', jsonb_build_object('rows', v_rows));
  end if;
  return v_rows;
end;
$$;
revoke execute on function public.purge_personal_data() from public, anon, authenticated;

-- 毎日 3:00（日本時間）に実行。pg_cron がない環境（素の Postgres でのテスト）では飛ばす
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-personal-data', '0 18 * * *', 'select public.purge_personal_data()');
  end if;
end;
$$;

-- ============================================================
-- メンバー（SCRAMBLE SMILE）
-- ============================================================
insert into public.members (name, group_name, sort_order) values
  ('髙橋美海', 'SCRAMBLE SMILE', 1),
  ('土居麗菜', 'SCRAMBLE SMILE', 2),
  ('好田恵芽', 'SCRAMBLE SMILE', 3),
  ('桜木果奈', 'SCRAMBLE SMILE', 4),
  ('千浜もあな', 'SCRAMBLE SMILE', 5);

-- ============================================================
-- マイグレーション履歴をリポジトリのファイル名に合わせる（以後 npx supabase db push が使えるように）
-- ============================================================
delete from supabase_migrations.schema_migrations where name in ('init_tables', 'security_columns_and_staff');
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20260928000000', 'init', '{}'),
  ('20261002000000', 'security', '{}'),
  ('20261003000000', 'google_login_server_key', '{}')
on conflict (version) do nothing;

-- ============================================================
-- サーバーキー（Vercel の APP_SERVER_KEY と同じ値に置き換える）
-- ============================================================
insert into app_private.server_keys (name, key_hash)
values ('app', encode(sha256(convert_to('<APP_SERVER_KEY>', 'UTF8')), 'hex'))
on conflict (name) do update set key_hash = excluded.key_hash;

commit;
