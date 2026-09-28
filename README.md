# 招待特典 受付・発送システム

招待チケットで人を呼んでくれたお客様（招待者）から、特典の送付先を集めて発送まで管理するシステムです。
公演ごとに作っていた Google フォーム（人数で分岐するセクション形式）の置き換えです。

- **公開フォーム** `/{公演のURL名}`: スマホ向けのステップ形式。招待者情報 → 招待した人数 → 特典ごとの希望メンバー → 送付先 → 確認 → 受付番号の表示
- **管理画面** `/admin`: 公演・特典（段）・メンバーの設定、QRコード、回答一覧と人数確認、集計、発送（CSV・宛名ラベル・ピッキングリスト・追跡番号の取り込み・発送完了メール）

## 特典のしくみ

- 公演ごとに「段」（必要人数・特典名・希望メンバーを選ぶか・発送か当日手渡しか）を管理画面で登録します
- **累積**: 上の段に届くと下の段の特典もすべてもらえます（例: 10人なら 1・3・5・10人の特典）
- フォームの「招待した人数」の選択肢は、登録した段の必要人数です
- 人数はお客様が申告し、スタッフが管理画面で**確定人数**を入れます。確定人数を変えると特典が組み直されます
  - 届かなくなった特典は外れ、残る特典の希望メンバーはそのまま残ります
  - 新しく届いた特典は「メンバー未選択」で追加されるので、詳細画面で選びます
- 同じ公演で同じチケット番号は1回しか受け付けません。メールか電話番号が同じ回答には「重複の疑い」の印がつきます

## 回答の状態

| 状態 | 意味 |
| --- | --- |
| 受付 | お客様が送信した直後。人数は未確認 |
| 人数確認済 | スタッフが人数を確認した。発送対象になる |
| 発送準備 | 発送作業中（宛名を出力した） |
| 発送済 | 発送した（追跡番号の取り込みなど） |
| 保留 / 無効 | 発送対象から外す。無効は集計からも外す |

## 当日と発送の流れ

1. 管理画面で公演を作り（前の公演の特典とメンバーを複製できます）、特典・告知画像を設定して状態を「受付中」にする
2. 「設定」タブの QR コード（PNG）を印刷して会場で案内する
3. お客様が入力 → 完了画面の受付番号をスタッフに見せる
4. スタッフが「回答」から受付番号を開き、招待人数を確認して「確定する」
5. 「集計」で特典×メンバーの必要数を確認して制作する
6. 「発送」タブで
   1. 発送対象を「発送準備」にする
   2. CSV（汎用 / クリックポスト）を出力、または宛名ラベル（A4 12面）とピッキングリストを印刷
   3. 追跡番号の CSV を取り込む（受付番号・追跡番号の2列）→「発送済」になる
   4. 発送完了メールを送る

公演日から「個人情報の保存期間」（初期値90日）が過ぎると、送付先・電話・メールは毎日の定期処理で自動削除されます。

## 構成

- Next.js 16（App Router）/ TypeScript / Tailwind CSS
- Supabase（Postgres・Auth・Storage）。RLS で、データの閲覧と更新は `staff` に登録したユーザーだけに限定
  - 公開フォームはブラウザから DB に触らず、サーバー側から `submit_invitation` 関数を呼んで1トランザクションで登録
- Vercel（ホスティング・Cron）/ Resend（メール）/ Cloudflare Turnstile（ボット対策）/ zipcloud（郵便番号検索）

```
supabase/migrations/   テーブル・RLS・DB関数（submit_invitation, set_confirmed_count, purge_personal_data）
supabase/seed.sql      開発用データ（SCRAMBLE SMILE のメンバーと 2nd SMILE の特典）
src/app/[slug]/        公開フォーム
src/app/admin/         管理画面
src/app/api/           郵便番号検索・個人情報削除の Cron
src/lib/               特典の計算・入力チェック・CSV・メールなど
db-tests/              素の Postgres で動く DB テスト
e2e/run.mjs            Playwright の E2E
```

## 開発

```bash
npm install
npx supabase start          # ローカルの Supabase（Docker が必要）。migrations と seed.sql が入る
cp .env.example .env.local  # `npx supabase status` の URL / Publishable key / Secret key を書く
npm run staff:create -- staff@example.com password1234 "鍋島"
npm run dev                 # http://localhost:3000/2nd-smile と http://localhost:3000/admin
```

テスト:

```bash
npm test            # ユニットテスト（特典の計算・入力チェック・CSV）
npm run test:db     # DB テスト（ローカルの Postgres。DATABASE_URL で接続先を変えられる）
npm run test:e2e    # E2E（supabase start と npm run dev が動いている状態で）
npm run typecheck && npm run lint
```

## 本番の準備

1. Supabase のプロジェクトを作り、`npx supabase link` → `npx supabase db push` でマイグレーションを流す
   （seed.sql は本番には流さず、メンバーと公演は管理画面から登録する）
2. Vercel にこのリポジトリをつなぎ、`.env.example` の環境変数を設定する
   - `CRON_SECRET` を設定すると、`vercel.json` の Cron（毎日 3:00 JST）が個人情報の削除を実行します
3. Resend で送信元ドメインを認証し、`RESEND_API_KEY` と `MAIL_FROM` を設定する
4. Cloudflare Turnstile のサイトを作り、2つのキーを設定する
5. `npm run staff:create` でスタッフのアカウントを作る

## 未対応・要確認

- 15人・20人・40人の特典は内容が未定のため seed に入れていません。管理画面の「設定 → 特典（段）」から追加してください
- 1人以上の「限定ポストカード」は seed では「発送」にしています。会場で手渡しする場合は「当日手渡し」に変えてください
- クリックポストの CSV は「まとめ申込」の列構成（郵便番号・氏名・敬称・住所4行・内容品）に合わせていますが、実際の取り込み画面で一度確認してください
- ヤマト B2 クラウド・ゆうパックプリントの取込形式は、汎用 CSV を各サービスの取込設定で割り当てて使ってください
