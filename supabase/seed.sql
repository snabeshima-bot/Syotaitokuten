-- 開発用の初期データ（SCRAMBLE SMILE / 2nd SMILE）

insert into public.members (id, name, group_name, sort_order) values
  ('00000000-0000-4000-8000-000000000001', '髙橋美海', 'SCRAMBLE SMILE', 1),
  ('00000000-0000-4000-8000-000000000002', '土居麗菜', 'SCRAMBLE SMILE', 2),
  ('00000000-0000-4000-8000-000000000003', '好田恵芽', 'SCRAMBLE SMILE', 3),
  ('00000000-0000-4000-8000-000000000004', '桜木果奈', 'SCRAMBLE SMILE', 4),
  ('00000000-0000-4000-8000-000000000005', '千浜もあな', 'SCRAMBLE SMILE', 5)
on conflict (id) do nothing;

insert into public.events (id, slug, title, description, event_date, status) values
  ('00000000-0000-4000-8000-0000000000e1', '2nd-smile',
   'SCRAMBLE SMILE 2nd SMILE 招待特典アンケートフォーム',
   '入力が完了いたしましたら、スタッフにお声がけください。',
   '2026-09-29', 'open')
on conflict (id) do nothing;

insert into public.event_members (event_id, member_id, sort_order)
select '00000000-0000-4000-8000-0000000000e1', id, sort_order from public.members
on conflict do nothing;

-- 15人・20人・40人の特典は管理画面から追加する
insert into public.reward_tiers (id, event_id, min_count, name, description, requires_member, delivery, sort_order) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 1, '2nd SMILE限定ポストカード', '', false, 'ship', 1),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e1', 3, '2nd SMILE デコチェキ', '', true, 'ship', 2),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000e1', 5, 'ぜんぶ君色だよ♡ボイスチェキ', '推しメンのボイスつきチェキ', true, 'ship', 3),
  ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000e1', 10, '推しメンの未公開2nd SMILE ライブポスター', 'A3サイズ/サイン/宛名', true, 'ship', 4)
on conflict (id) do nothing;

-- ローカル開発用のサーバーキー（.env.local の APP_SERVER_KEY=local-dev-server-key と対応）。本番では別の値を入れる
insert into app_private.server_keys (name, key_hash)
values ('app', encode(sha256(convert_to('local-dev-server-key', 'UTF8')), 'hex'))
on conflict (name) do update set key_hash = excluded.key_hash;
