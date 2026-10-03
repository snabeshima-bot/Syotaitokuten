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
