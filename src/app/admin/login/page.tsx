import { LoginForm } from "./login-form";
import { loginWithGoogle } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { error, reason } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-6 text-center text-xl font-bold">招待特典 管理画面</h1>
      {reason === "timeout" && (
        <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">一定時間操作がなかったため、ログアウトしました。</p>
      )}
      {error === "not_staff" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          このアカウントはスタッフとして登録されていません。会社の Google アカウント（@focpro.co.jp）でログインしてください。
        </p>
      )}
      {error === "oauth" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Google ログインに失敗しました。もう一度お試しください。</p>
      )}
      <form action={loginWithGoogle}>
        <button className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-gray-50">
          <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-8 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Google でログイン
        </button>
      </form>
      <p className="mt-2 text-center text-xs text-gray-500">会社の Google アカウント（@focpro.co.jp）は自動でスタッフになります</p>
      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-center text-gray-500">メールアドレスとパスワードでログイン</summary>
        <div className="mt-3">
          <LoginForm />
        </div>
      </details>
    </main>
  );
}
