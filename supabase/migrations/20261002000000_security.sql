-- セキュリティ強化
-- 1. 氏名・電話・郵便番号・住所・メールはアプリ側で暗号化した値を保存する（列はそのまま text）
--    重複チェックは暗号化とは別の鍵で作ったハッシュ（email_hash / phone_hash）で行う
-- 2. 個人情報の取り扱いへの同意日時を保存する
-- 3. お客様が送信後に内容を直すための修正トークン（ハッシュのみ保存）
-- 4. スタッフの権限は 2段階認証（aal2）済みのセッションに限る

alter table public.submissions
  add column email_hash text,
  add column phone_hash text,
  add column consented_at timestamptz,
  add column edit_token_hash text unique,
  add column edit_token_expires_at timestamptz,
  add column confirmed_at timestamptz,
  add column confirmed_by uuid;

create index submissions_email_hash_idx on public.submissions (event_id, email_hash);
create index submissions_phone_hash_idx on public.submissions (event_id, phone_hash);

comment on column public.submissions.email is '暗号化済み（アプリの PII_ENCRYPTION_KEY）';
comment on column public.submissions.full_name is '暗号化済み';
comment on column public.submissions.phone is '暗号化済み';
comment on column public.submissions.postal_code is '暗号化済み';
comment on column public.submissions.address1 is '暗号化済み';
comment on column public.submissions.address2 is '暗号化済み';

-- ============================================================
-- スタッフ判定: 2段階認証を済ませたセッションだけを通す
-- ============================================================

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- 2段階認証の前でも「自分がスタッフか」だけは確認できるようにする
create policy staff_self on public.staff for select to authenticated using (user_id = auth.uid());

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
