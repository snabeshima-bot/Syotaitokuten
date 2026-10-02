// E2E: お客様の入力 → 修正リンク → 管理画面（2段階認証）→ 当日受付で人数確定 → 個人情報の表示ログ → 発送
// 前提: `npx supabase start`（seed 投入済み）、`npm run build && npm start` が BASE_URL で動いていること、
//       E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD のスタッフが登録済み（npm run staff:create）で、まだ認証アプリを登録していないこと
//       DB_URL（省略時はローカル Supabase）に psql で接続できること
import { chromium, devices } from "playwright";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB_URL = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const EMAIL = process.env.E2E_STAFF_EMAIL ?? "staff@example.com";
const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "password1234";
const SHOTS = process.env.E2E_SCREENSHOTS;
const ticket = `E2E-${Date.now()}`;

const sql = (q) => execFileSync("psql", [DB_URL, "-Atc", q], { encoding: "utf8" }).trim();
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/** RFC 6238 の TOTP（認証アプリと同じ6桁のコード） */
function totp(base32) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});

try {
  // ================= お客様（スマホ） =================
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await phone.newPage();
  await page.goto(`${BASE}/2nd-smile`);
  await shot(page, "01-intro");
  await page.getByRole("button", { name: "入力をはじめる" }).click();

  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByText("チケット番号を入力してください").waitFor();
  await page.getByLabel("チケット番号").fill(ticket.toLowerCase());
  await page.getByLabel("お名前（ニックネーム可）").fill("E2Eたろう");
  await page.getByLabel("メールアドレス").fill("e2e@gmial.com");
  // メールの打ち間違い候補
  await page.getByRole("button", { name: "e2e@gmail.com" }).click();
  assert.equal(await page.getByLabel("メールアドレス").inputValue(), "e2e@gmail.com");
  await shot(page, "02-inviter");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByRole("radio", { name: /^10人/ }).click();
  await page.getByText("推しメンの未公開2nd SMILE ライブポスター").waitFor();

  // 途中で再読み込みしても続きから入力できる
  await page.reload();
  await page.getByText("途中まで入力した内容を戻しました").waitFor();
  assert.equal(await page.getByRole("radio", { name: /^10人/ }).getAttribute("aria-checked"), "true", "人数が戻っていない");
  await page.getByRole("button", { name: "次へ" }).click();

  const pick = (tier, member) =>
    page.getByRole("radiogroup", { name: `${tier}の希望メンバー` }).getByRole("radio", { name: member }).click();
  await pick("ぜんぶ君色だよ♡ボイスチェキ", "土居麗菜");
  await pick("推しメンの未公開2nd SMILE ライブポスター", "千浜もあな");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByText("2nd SMILE デコチェキの希望メンバーを選んでください").waitFor();
  await pick("2nd SMILE デコチェキ", "髙橋美海");
  assert.equal(await page.getByText("2nd SMILE デコチェキの希望メンバーを選んでください").count(), 0, "選んだ後もエラーが残っている");
  await shot(page, "04-members");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByLabel("お名前（フルネーム）").fill("山田 太郎");
  await page.getByLabel("電話番号").fill("09012345678");
  await page.getByLabel("郵便番号").fill("1600022");
  await page.getByLabel("住所（都道府県・市区町村・町名）").waitFor();
  await page.waitForFunction(() => document.querySelector("#address1")?.value === "東京都新宿区新宿");
  await page.getByLabel("番地・建物名・部屋番号").fill("3-1-1 スマイルビル101");
  assert.equal(await page.getByLabel("電話番号").inputValue(), "090-1234-5678", "電話番号に自動でハイフンが入っていない");
  await shot(page, "05-address");
  await page.getByRole("button", { name: "次へ" }).click();

  await page.getByText("入力内容の確認").waitFor();
  await page.getByText("個人情報の取り扱いについて").waitFor();
  await page.getByRole("button", { name: "この内容で送信する" }).click();
  await page.getByText("個人情報の取り扱いに同意してください").waitFor();
  await page.getByLabel("上記の個人情報の取り扱いに同意します").check();
  await shot(page, "06-confirm");
  await page.getByRole("button", { name: "この内容で送信する" }).click();
  await page.getByText("受付が完了しました").waitFor();
  const receiptNo = (await page.getByTestId("receipt-no").innerText()).trim();
  await page.getByAltText(`受付番号 ${receiptNo} のQRコード`).waitFor();
  await shot(page, "07-done");
  console.log("受付番号", receiptNo);

  // DB には暗号化されて入っている
  const stored = sql(`select address1 || '|' || phone || '|' || email from submissions where receipt_no = ${Number(receiptNo)}`);
  assert.match(stored, /^v1\.[^|]+\|v1\.[^|]+\|v1\./, "暗号化されていない");
  assert.ok(!stored.includes("新宿") && !stored.includes("5678") && !stored.includes("gmail"), "平文が DB に残っている");
  assert.equal(sql(`select consented_at is not null from submissions where receipt_no = ${Number(receiptNo)}`), "t");

  // ================= 修正リンク =================
  // 本来はメールで届く。テストでは既知のトークンを DB に入れる
  const token = "e2e-" + "x".repeat(48) + Date.now();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  sql(`update submissions set edit_token_hash = '${tokenHash}' where receipt_no = ${Number(receiptNo)}`);
  await page.goto(`${BASE}/2nd-smile/edit?token=${token}`);
  await page.getByText(`受付番号 ${receiptNo}`).waitFor();
  assert.equal(await page.getByLabel("番地・建物名・部屋番号").inputValue(), "3-1-1 スマイルビル101");
  await pick("2nd SMILE デコチェキ", "好田恵芽");
  await page.getByLabel("番地・建物名・部屋番号").fill("3-1-1 スマイルビル202");
  await page.getByRole("button", { name: "修正を保存する" }).click();
  await page.getByText("修正を保存しました").waitFor();
  await shot(page, "08-edit");
  await page.goto(`${BASE}/2nd-smile/edit?token=wrong-token-${"y".repeat(48)}`);
  await page.getByText("このリンクは無効か、有効期限が切れています").waitFor();

  // ================= 管理画面（2段階認証） =================
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const admin = await desk.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(/\/admin\/login/);
  await admin.getByLabel("メールアドレス").fill(EMAIL);
  await admin.getByLabel("パスワード").fill(PASSWORD);
  await admin.getByRole("button", { name: "ログイン" }).click();
  await admin.waitForURL(/\/admin\/mfa/);
  // 2段階認証が済むまで管理画面には入れない
  await admin.goto(`${BASE}/admin`);
  await admin.waitForURL(/\/admin\/mfa/);
  await admin.getByRole("button", { name: "認証アプリを登録する" }).click();
  await admin.getByText("QRコードが読めない場合").click();
  const secret = (await admin.locator("details p.font-mono").innerText()).trim();
  await shot(admin, "09-mfa");
  await admin.getByLabel("6桁のコード").fill("000000");
  await admin.getByRole("button", { name: "確認する" }).click();
  await admin.getByText("コードが正しくないか").waitFor();
  await admin.getByLabel("6桁のコード").fill(totp(secret));
  await admin.getByRole("button", { name: "確認する" }).click();
  await admin.waitForURL(`${BASE}/admin`);

  await admin.getByRole("link", { name: /2nd SMILE/ }).first().click();
  await admin.waitForURL(/\/admin\/events\/[0-9a-f-]+$/);
  const eventUrl = admin.url();

  // 当日受付: 受付番号で呼び出し → 5人で確定 → ポスターが外れる
  await admin.getByRole("link", { name: "当日受付" }).click();
  await admin.getByLabel("受付番号").fill(String(Number(receiptNo)));
  await admin.getByRole("button", { name: "呼び出す" }).click();
  await admin.getByText("E2Eたろう 様").waitFor();
  assert.equal(await admin.getByText("山田").count(), 0, "当日受付に氏名が出ている");
  await admin.getByText("人数を変えて確定する").click();
  await admin.getByRole("button", { name: "5人", exact: true }).click();
  await admin.getByRole("button", { name: "5人で確定" }).click();
  await admin.getByText("5人で確定しました").waitFor();
  assert.equal(await admin.getByText("ライブポスター").count(), 0, "ポスターが外れていない");
  await shot(admin, "10-checkin");

  // 詳細: 個人情報は伏せ字 → 表示すると操作ログに残る
  await admin.goto(eventUrl);
  await admin.getByRole("link", { name: receiptNo }).click();
  await admin.getByText("＊＊＊-＊＊＊＊-5678").waitFor();
  assert.equal(await admin.getByText("スマイルビル").count(), 0, "伏せ字になっていない");
  assert.ok((await admin.content()).includes("好田恵芽"), "修正リンクの変更が反映されていない");
  await shot(admin, "11-detail-masked");
  await admin.getByRole("link", { name: /個人情報を表示・編集する/ }).click();
  assert.equal(await admin.getByLabel("番地・建物名").inputValue(), "3-1-1 スマイルビル202");
  await shot(admin, "12-detail-revealed");
  await admin.goto(`${BASE}/admin/audit?only=pii`);
  await admin.getByText("個人情報を表示").first().waitFor();
  await shot(admin, "13-audit");

  // 設定: チェックリストと特典の表
  await admin.goto(eventUrl + "/settings");
  await admin.getByText("公開までのチェックリスト").waitFor();
  await shot(admin, "14-settings");

  // 発送: CSV（復号されて出る）→ 追跡番号の取り込み
  await admin.goto(eventUrl + "/shipping");
  const [download] = await Promise.all([admin.waitForEvent("download"), admin.getByRole("link", { name: "CSV: 汎用（全項目）" }).click()]);
  const csv = fs.readFileSync(await download.path(), "utf8");
  assert.ok(csv.includes(receiptNo) && csv.includes("スマイルビル202"), "CSV に送付先がない");
  assert.ok(csv.includes("デコチェキ（好田恵芽）"), "CSV に同梱物がない");
  assert.ok(!csv.includes("ライブポスター"), "外れた特典が CSV に出ている");
  const trackingCsv = path.join(os.tmpdir(), `tracking-${Date.now()}.csv`);
  fs.writeFileSync(trackingCsv, `受付番号,お問い合わせ番号\n${receiptNo},1234-5678-9012\n`);
  await admin.locator('input[name="file"]').setInputFiles(trackingCsv);
  await admin.getByPlaceholder("配送方法（CSVにない場合）例: クリックポスト").fill("クリックポスト");
  await admin.getByRole("button", { name: "取り込む" }).click();
  await admin.getByText("1 件を「発送済」にしました").waitFor();

  // セキュリティヘッダー
  const res = await admin.request.get(`${BASE}/admin`);
  assert.match(res.headers()["content-security-policy"] ?? "", /frame-ancestors 'none'/);
  assert.equal(res.headers()["x-frame-options"], "DENY");
  assert.match(res.headers()["cache-control"] ?? "", /no-store/);

  console.log("E2E OK");
} catch (e) {
  // 失敗したときは開いているページのスクリーンショットを残す
  if (SHOTS) {
    for (const [i, p] of browser.contexts().flatMap((c) => c.pages()).entries()) {
      await p.screenshot({ path: path.join(SHOTS, `fail-${i}.png`), fullPage: true }).catch(() => {});
    }
  }
  throw e;
} finally {
  await browser.close();
}
