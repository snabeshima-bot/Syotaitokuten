# 本番公開の手順

## いまの状況（2026-10-06）

| 作業 | 状態 |
| --- | --- |
| GitHub に `main` ブランチを作成 | 済み |
| Supabase「Syotaitokuten」にテーブル・列・RLS・Storage を作成 | 済み |
| Supabase に関数・Google ログイン用の設定・定期削除・メンバーを入れる | **未**（下の 1） |
| Google ログインの設定 | **未**（下の 2・3） |
| Vercel のプロジェクト作成と公開 | **未**（下の 4） |
| メール送信元 info@cobo.jp | **未**（下の 5。Resend のドメイン数が上限） |
| GitHub の既定ブランチを `main` に | **未**（下の 6） |

コネクタ（Supabase・Vercel）をつなぎ直して新しいセッションで「本番公開の続きをやって」と頼めば、1・4 と 5 の一部は Claude が行えます。
Supabase は https://claude.ai/customize/connectors でつなぎ直し、Vercel はプロジェクトを作れる権限でつないでください。
2・3・6 と DNS の設定は、各サービスの画面で行う必要があります。

---

## 1. Supabase の仕上げ（SQL を1回実行）

1. 長いランダムな文字列を1つ作る（これが `APP_SERVER_KEY`）。例: ターミナルで `openssl rand -base64 48`、またはパスワード管理ツールで48文字以上
2. Supabase → プロジェクト「Syotaitokuten」→ SQL Editor
3. `supabase/deploy/production-finish.sql` の中身を貼り付け、最下部の `<APP_SERVER_KEY>` を 1 の文字列に置き換えて Run
4. 実行は1回だけ（2回目はエラーになります）

## 2. Google Cloud で OAuth クライアントを作る

1. https://console.cloud.google.com/ で focpro.co.jp の組織にプロジェクトを作る（既存でも可）
2. 「APIとサービス → OAuth 同意画面」: ユーザーの種類は **内部**（focpro.co.jp の人しかログインできなくなる）。アプリ名「招待特典 管理」
3. 「認証情報 → 認証情報を作成 → OAuth クライアント ID」: 種類「ウェブアプリケーション」
   - 承認済みのリダイレクト URI: `https://vceupsfsdlhxnxegmtup.supabase.co/auth/v1/callback`
4. 表示されたクライアント ID とクライアントシークレットを控える

## 3. Supabase で Google ログインを有効にする

1. Authentication → Sign In / Providers → Google を有効にし、2 のクライアント ID とシークレットを貼る
2. Authentication → URL Configuration
   - Site URL: 本番の URL（例 `https://syotaitokuten.vercel.app`）
   - Redirect URLs に `https://syotaitokuten.vercel.app/admin/auth/callback` を追加（独自ドメインにする場合はそれも）
3. Authentication → Sign In / Providers → Email の「Allow new users to sign up」はオフでよい（スタッフは Google で入るため）

## 4. Vercel で公開する

1. Vercel → Add New → Project → GitHub の `snabeshima-bot/Syotaitokuten` を Import
2. Framework は Next.js（自動）。Settings → Git の Production Branch は `main`
3. Environment Variables（Production と Preview）に次を入れて Deploy

| 名前 | 値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://vceupsfsdlhxnxegmtup.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys の Publishable key（`sb_publishable_…`） |
| `APP_SERVER_KEY` | 1 で作った文字列 |
| `PII_ENCRYPTION_KEY` | `openssl rand -base64 32` で作った値（**控えておく。なくすと個人情報が読めなくなる**） |
| `PII_HASH_KEY` | `openssl rand -base64 32` で作った別の値 |
| `IP_HASH_SALT` | 任意の長い文字列 |
| `APP_URL` | 本番の URL（例 `https://syotaitokuten.vercel.app`） |
| `STAFF_GOOGLE_DOMAIN` | `focpro.co.jp` |
| `ORGANIZER_NAME` | `SCRAMBLE SMILE 運営事務局`（フォームの「個人情報の取り扱い」に出る） |
| `PRIVACY_CONTACT` | 問い合わせ先（例 `info@cobo.jp`） |
| `RESEND_API_KEY` | 5 で作るキー（なくても受付は動く。メールが送られないだけ） |
| `MAIL_FROM` | `SCRAMBLE SMILE 運営事務局 <info@cobo.jp>` |
| `MAIL_REPLY_TO` | 返信を受けるアドレス（任意） |

Supabase の秘密鍵（service_role / Secret key）は**入れない**でください。アプリは使いません。

4. 公開されたら `https://<URL>/admin` を開き、「Google でログイン」で @focpro.co.jp のアカウントで入れることを確認

## 5. メール送信元（info@cobo.jp）

Resend のプランで登録できるドメイン数の上限（今は heymommy.jp・nrcproduction.jp・nrcmodelagency.jp の3つ）に達しているため、cobo.jp を追加できませんでした。どちらかを選んでください。

- **Resend のプランを上げて cobo.jp を追加する**: Resend → Domains → Add Domain で cobo.jp（リージョン Tokyo）。表示される DNS レコード（MX・TXT（SPF・DKIM））を cobo.jp の DNS に追加し、Verify
- **使っていないドメインを外して cobo.jp を入れる**、または **当面は既存ドメインから送る**（例 `MAIL_FROM="SCRAMBLE SMILE 運営事務局 <noreply@heymommy.jp>"`、`MAIL_REPLY_TO=info@cobo.jp`）

どちらの場合も Resend → API Keys で「Sending access」・送信ドメイン限定のキーを作り、Vercel の `RESEND_API_KEY` に入れる。

## 6. GitHub の既定ブランチ

GitHub → リポジトリ → Settings → General → Default branch を `main` に変更し、作業用ブランチ `claude/intelligent-gauss-x32jni` は不要なら削除。

---

## 公開後の確認

- `/admin` に Google でログイン → 「公演」から公演を作る（前の公演がないので特典とメンバーを設定）→ プレビュー → 受付開始
- スマホで受付 URL を開いて1件テスト送信 → 管理画面の「当日受付」で受付番号から人数確定 → 「回答」で伏せ字・表示を確認
- テスト送信の回答は状態を「無効」にしておく
