"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, cx } from "./ui";

type Result = { ok: boolean; message: string } | null;

/** サーバーアクションを呼び、結果のメッセージを横に出すフォーム */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state && (
        <p className={cx("mt-2 text-sm", state.ok ? "text-emerald-700" : "text-red-600")} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** フォーム送信中は押せなくなるボタン */
export function SubmitButton(props: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" {...props} disabled={pending || props.disabled} />;
}
