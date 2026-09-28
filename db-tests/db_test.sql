-- submit_invitation / set_confirmed_count / RLS / purge のテスト
\set ON_ERROR_STOP on

create or replace function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % but succeeded: %', expected, sql;
exception when others then
  if sqlerrm <> expected then
    raise exception 'expected error % but got %', expected, sqlerrm;
  end if;
end $$;

create or replace function pg_temp.assert(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'assertion failed: %', msg; end if;
end $$;

-- 10人で送信 → 1/3/5/10 の4特典
select * from public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1',
  'ticket_number', 'A001', 'nickname', 'たろう', 'email', 'taro@example.com',
  'claimed_count', 10, 'full_name', '山田太郎', 'phone', '090-1111-2222',
  'postal_code', '1600022', 'address1', '東京都新宿区新宿', 'address2', '1-1-1',
  'ip_hash', 'ip1',
  'members', jsonb_build_object(
    '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000005')));

select pg_temp.assert((select count(*) from public.submission_rewards sr join public.submissions s on s.id = sr.submission_id where s.ticket_number = 'A001') = 4, '10人は4特典');

-- 同じチケット番号は拒否
select pg_temp.expect_error($q$select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'A001', 'nickname', 'x',
  'claimed_count', 1, 'full_name', 'x', 'phone', '1', 'postal_code', '1', 'address1', 'x'))$q$, 'duplicate_ticket');

-- メンバー未選択は拒否
select pg_temp.expect_error($q$select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'A002', 'nickname', 'x',
  'claimed_count', 3, 'full_name', 'x', 'phone', '1', 'postal_code', '1', 'address1', 'x'))$q$, 'member_required');

-- 発送特典があるのに住所なしは拒否
select pg_temp.expect_error($q$select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'A003', 'nickname', 'x',
  'claimed_count', 1))$q$, 'address_required');

-- 同じメールは重複候補（既存側にも印がつく）
select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'A004', 'nickname', 'じろう',
  'email', 'TARO@example.com', 'claimed_count', 1, 'full_name', '山田次郎', 'phone', '090-3333-4444',
  'postal_code', '1600022', 'address1', '東京都新宿区新宿'));
select pg_temp.assert((select bool_and(duplicate_suspected) from public.submissions where ticket_number in ('A001', 'A004')), '重複候補の印');

-- 確定人数を5に → ポスターが外れ、残りの希望メンバーは保持
select public.set_confirmed_count((select id from public.submissions where ticket_number = 'A001'), 5);
select pg_temp.assert((select count(*) from public.submission_rewards sr join public.submissions s on s.id = sr.submission_id where s.ticket_number = 'A001') = 3, '5人は3特典');
select pg_temp.assert((select member_id from public.submission_rewards where tier_id = '00000000-0000-4000-8000-0000000000a5'
  and submission_id = (select id from public.submissions where ticket_number = 'A001')) = '00000000-0000-4000-8000-000000000002', 'メンバー保持');

-- 確定人数を10に戻す → ポスターは未選択で戻る
select public.set_confirmed_count((select id from public.submissions where ticket_number = 'A001'), 10);
select pg_temp.assert((select member_id is null from public.submission_rewards where tier_id = '00000000-0000-4000-8000-0000000000aa'
  and submission_id = (select id from public.submissions where ticket_number = 'A001')), 'ポスターは未選択で追加');

-- 集計ビュー
select pg_temp.assert((select quantity from public.reward_summary where tier_id = '00000000-0000-4000-8000-0000000000a1' and member_id is null) = 2, 'ポストカード2枚');

-- 送信回数の制限（同じ ip_hash で 10 分に 5 件まで）
do $$
declare i int;
begin
  for i in 1..4 loop
    perform public.submit_invitation(jsonb_build_object(
      'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'R' || i, 'nickname', 'r',
      'claimed_count', 1, 'full_name', 'r', 'phone', '0' || i, 'postal_code', '1', 'address1', 'x', 'ip_hash', 'ip1'));
  end loop;
end $$;
select pg_temp.expect_error($q$select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'R9', 'nickname', 'r',
  'claimed_count', 1, 'full_name', 'r', 'phone', '09', 'postal_code', '1', 'address1', 'x', 'ip_hash', 'ip1'))$q$, 'rate_limited');

-- 受付終了の公演は拒否
update public.events set status = 'closed' where slug = '2nd-smile';
select pg_temp.expect_error($q$select public.submit_invitation(jsonb_build_object(
  'event_id', '00000000-0000-4000-8000-0000000000e1', 'ticket_number', 'C1', 'nickname', 'x',
  'claimed_count', 1, 'full_name', 'x', 'phone', '1', 'postal_code', '1', 'address1', 'x'))$q$, 'event_closed');

-- RLS: anon は読めない・関数も呼べない
set role anon;
select pg_temp.assert((select count(*) from public.submissions) = 0, 'anon は回答を読めない');
select pg_temp.expect_error($q$select public.submit_invitation('{}'::jsonb)$q$, 'permission denied for function submit_invitation');
reset role;

-- RLS: スタッフでない authenticated は読めない、スタッフは読める
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.staff (user_id) values ('11111111-1111-4111-8111-111111111111');
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select pg_temp.assert((select count(*) from public.submissions) = 0, '非スタッフは読めない');
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
select pg_temp.assert((select count(*) from public.submissions) > 0, 'スタッフは読める');
reset role;

-- 保存期間を過ぎた公演の個人情報を削除
update public.events set event_date = current_date - 100, retention_days = 90 where slug = '2nd-smile';
select pg_temp.assert(public.purge_personal_data() > 0, 'purge 件数');
select pg_temp.assert((select count(*) from public.submissions where address1 is not null or phone is not null or email is not null) = 0, '住所・電話・メールが消える');
select pg_temp.assert((select count(*) from public.submission_rewards) > 0, '特典の明細は残る');

\echo 'ALL DB TESTS PASSED'
