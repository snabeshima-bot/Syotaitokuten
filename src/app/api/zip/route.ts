import { NextResponse, type NextRequest } from "next/server";

/** 郵便番号 → 住所（zipcloud）。ブラウザから直接呼べないのでサーバー経由にする */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").replace(/[^0-9]/g, "");
  if (code.length !== 7) return NextResponse.json({ address: null }, { status: 400 });
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${code}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    const json = (await res.json()) as {
      results: { address1: string; address2: string; address3: string }[] | null;
    };
    const r = json.results?.[0];
    return NextResponse.json({ address: r ? `${r.address1}${r.address2}${r.address3}` : null });
  } catch {
    return NextResponse.json({ address: null }, { status: 502 });
  }
}
