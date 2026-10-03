// ローカル開発用: パスワードでログインするスタッフを作る（本番は会社の Google アカウントで自動登録）
// node --env-file=.env.local scripts/create-staff.mjs <email> <password> [表示名]  ※ SUPABASE_SECRET_KEY が必要
import { createClient } from "@supabase/supabase-js";

const [email, password, displayName = ""] = process.argv.slice(2);
if (!email || !password) {
  console.error("使い方: node --env-file=.env.local scripts/create-staff.mjs <email> <password> [表示名]");
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

let userId;
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  // 既にいるユーザーならスタッフ登録だけ行う
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  userId = list?.users.find((u) => u.email === email)?.id;
  if (!userId) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  userId = data.user.id;
}
const { error: staffError } = await supabase.from("staff").upsert({ user_id: userId, display_name: displayName });
if (staffError) {
  console.error(staffError.message);
  process.exit(1);
}
console.log(`スタッフを登録しました: ${email}`);
