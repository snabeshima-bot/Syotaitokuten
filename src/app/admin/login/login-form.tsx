"use client";

import { useActionState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <Card>
      <form action={action} className="space-y-4">
        <Field label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="パスワード" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "ログイン中…" : "ログイン"}
        </Button>
      </form>
    </Card>
  );
}
