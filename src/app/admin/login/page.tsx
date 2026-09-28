import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-6 text-center text-xl font-bold">招待特典 管理画面</h1>
      {error === "not_staff" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          このアカウントはスタッフとして登録されていません。管理者に登録を依頼してください。
        </p>
      )}
      <LoginForm />
    </main>
  );
}
