import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/** 保存期間を過ぎた公演の個人情報を削除する（Vercel Cron から毎日呼ぶ） */
export async function GET(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("purge_personal_data");
  if (error) {
    console.error("[purge]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await supabase.from("audit_logs").insert({ action: "purge_personal_data", target_type: "system", detail: { rows: data } });
  return NextResponse.json({ purged: data });
}
