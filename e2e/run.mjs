// E2E: 公開フォームで送信 → 管理画面で人数確認 → 発送CSV → 追跡番号取込 まで通す
// 前提: `supabase start` 済み・seed 投入済み、`npm run dev`（または start）が BASE_URL で動いていること、
//       E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD のスタッフが登録済み（npm run staff:create）
import { chromium, devices } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_STAFF_EMAIL ?? "staff@example.com";
const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "password1234";
const SHOTS = process.env.E2E_SCREENSHOTS;
const ticket = `E2E-${Date.now()}`;

// 環境に入っている Chromium を使う場合は E2E_CHROMIUM に実行ファイルのパスを指定する
const browser = await chromium.launch(
  process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
);
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

try {
  // ---- 公開フォーム（スマホ幅）----
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await phone.newPage();
  await page.goto(`${BASE}/2nd-smile`);
  await shot(page, "01-intro");
  await page.getByRole("button", { name: "入力をはじめる" }).click();

  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByText("チケット番号を入力してください").waitFor();
  await page.getByLabel("チケット番号").fill(ticket.toLowerCase());
  await page.getByLabel("お名前（ニックネーム可）").fill("E2Eたろう");
  await page.getByLabel("メールアドレス").fill("e2e@example.com");
  await shot(page, "02-inviter");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByRole("radio", { name: /^10人/ }).click();
  await page.getByText("推しメンの未公開2nd SMILE ライブポスター").waitFor();
  await shot(page, "03-count");
  await page.getByRole("button", { name: "次へ" }).click();

  // 3つの特典それぞれで希望メンバーを選ぶ（1つ目だけ選ばずに進もうとしてエラーを確認）
  await page.getByRole("radiogroup", { name: "ぜんぶ君色だよ♡ボイスチェキの希望メンバー" }).getByRole("radio", { name: "土居麗菜" }).click();
  await page.getByRole("radiogroup", { name: "推しメンの未公開2nd SMILE ライブポスターの希望メンバー" }).getByRole("radio", { name: "千浜もあな" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByText("2nd SMILE デコチェキの希望メンバーを選んでください").waitFor();
  await page.getByRole("radiogroup", { name: "2nd SMILE デコチェキの希望メンバー" }).getByRole("radio", { name: "髙橋美海" }).click();
  await shot(page, "04-members");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByLabel("お名前（フルネーム）").fill("山田 太郎");
  await page.getByLabel("電話番号（ハイフンあり）").fill("090-1234-5678");
  await page.getByLabel("郵便番号").fill("1600022");
  const addr = page.getByLabel("住所（都道府県・市区町村・町名）");
  await addr.fill("東京都新宿区新宿");
  await page.getByLabel("番地・建物名・部屋番号").fill("3-1-1 スマイルビル101");
  await shot(page, "05-address");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByText("入力内容の確認").waitFor();
  await shot(page, "06-confirm");
  await page.getByRole("button", { name: "この内容で送信する" }).click();
  await page.getByText("受付が完了しました").waitFor();
  const receiptNo = (await page.locator("p.text-4xl").innerText()).trim();
  await shot(page, "07-done");
  console.log("受付番号", receiptNo);

  // 同じチケット番号の再送信は拒否される
  await page.goto(`${BASE}/2nd-smile`);
  await page.getByRole("button", { name: "入力をはじめる" }).click();
  await page.getByLabel("チケット番号").fill(ticket);
  await page.getByLabel("お名前（ニックネーム可）").fill("dup");
  await page.getByLabel("メールアドレス").fill("dup@example.com");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("radio", { name: /^1人/ }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByLabel("お名前（フルネーム）").fill("重複");
  await page.getByLabel("電話番号（ハイフンあり）").fill("090-0000-0000");
  await page.getByLabel("郵便番号").fill("1600022");
  await page.getByLabel("住所（都道府県・市区町村・町名）").fill("東京都新宿区新宿");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "この内容で送信する" }).click();
  await page.getByText("このチケット番号はすでに受付済みです").waitFor();

  // ---- 管理画面 ----
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const admin = await desk.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(/\/admin\/login/);
  await admin.getByLabel("メールアドレス").fill(EMAIL);
  await admin.getByLabel("パスワード").fill(PASSWORD);
  await admin.getByRole("button", { name: "ログイン" }).click();
  await admin.waitForURL(`${BASE}/admin`);
  await admin.getByRole("link", { name: /2nd SMILE/ }).first().click();
  await admin.getByRole("link", { name: receiptNo }).click();
  await admin.getByText("招待人数の確認").waitFor();
  await shot(admin, "10-detail");

  // 確定人数を5人に → ポスターが外れる
  await admin.getByLabel("確定人数").fill("5");
  await admin.getByRole("button", { name: "確定する" }).click();
  await admin.getByText("確定人数を 5 人にしました").waitFor();
  await admin.reload();
  assert.equal(await admin.getByText("推しメンの未公開2nd SMILE ライブポスター").count(), 0, "ポスターが外れていない");
  await admin.getByText("人数確認済").first().waitFor();

  // 回答一覧・集計
  await admin.getByRole("link", { name: "回答", exact: true }).click();
  await shot(admin, "11-list");
  await admin.getByRole("link", { name: "集計" }).click();
  await admin.getByText("特典の必要数").waitFor();
  await shot(admin, "12-summary");

  // 発送: CSV 出力
  await admin.getByRole("link", { name: "発送" }).click();
  await shot(admin, "13-shipping");
  const [download] = await Promise.all([
    admin.waitForEvent("download"),
    admin.getByRole("link", { name: "CSV: 汎用（全項目）" }).click(),
  ]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.ok(csv.includes(receiptNo), "CSV に受付番号がない");
  assert.ok(csv.includes("デコチェキ（髙橋美海）"), "CSV に同梱物がない");
  assert.ok(!csv.includes("ライブポスター"), "外れた特典が CSV に出ている");

  // 追跡番号の取り込み → 発送済
  const trackingCsv = path.join(os.tmpdir(), `tracking-${Date.now()}.csv`);
  fs.writeFileSync(trackingCsv, `受付番号,お問い合わせ番号\n${receiptNo},1234-5678-9012\n`);
  await admin.locator('input[name="file"]').setInputFiles(trackingCsv);
  await admin.getByPlaceholder("配送方法（CSVにない場合）例: クリックポスト").fill("クリックポスト");
  await admin.getByRole("button", { name: "取り込む" }).click();
  await admin.getByText("1 件を「発送済」にしました").waitFor();

  await admin.goto(`${BASE}/admin`);
  await admin.getByRole("link", { name: /2nd SMILE/ }).first().click();
  await admin.getByRole("link", { name: receiptNo }).click();
  await admin.getByText("123456789012").waitFor();
  await shot(admin, "14-shipped");

  // 印刷用ページ
  await admin.goto(admin.url().replace(/submissions\/.*/, "shipping/print?mode=labels"));
  await shot(admin, "15-labels");

  console.log("E2E OK");
} finally {
  await browser.close();
}
