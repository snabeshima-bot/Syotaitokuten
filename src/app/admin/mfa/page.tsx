import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { MfaForm } from "./mfa-form";

export default async function MfaPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/admin/login");
  if (claims.claims.aal === "aal2") redirect("/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-xl font-bold">2段階認証</h1>
      <p className="text-center text-sm text-gray-600">
        {verified
          ? "認証アプリ（Google Authenticator など）に表示されている6桁のコードを入力してください。"
          : "管理画面には個人情報があるため、2段階認証の登録が必要です。スマホの認証アプリ（Google Authenticator、Microsoft Authenticator など）を用意してください。"}
      </p>
      <MfaForm factorId={verified?.id ?? null} />
      <form action={logout} className="text-center">
        <button className="text-sm text-gray-500 hover:underline">ログアウト</button>
      </form>
    </main>
  );
}
