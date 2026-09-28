import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { logout } from "../login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { staff } = await requireStaff();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="no-print border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-bold text-brand-700">
            招待特典 管理
          </Link>
          <nav className="flex gap-4 text-sm text-gray-700">
            <Link href="/admin" className="hover:text-brand-700">公演</Link>
            <Link href="/admin/members" className="hover:text-brand-700">メンバー</Link>
          </nav>
          <form action={logout} className="ml-auto flex items-center gap-3 text-sm text-gray-500">
            <span>{staff.display_name || "スタッフ"}</span>
            <button className="hover:text-gray-900">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
