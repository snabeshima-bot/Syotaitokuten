"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { startEnroll, verifyCode, type EnrollState } from "./actions";

export function MfaForm({ factorId }: { factorId: string | null }) {
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [starting, startTransition] = useTransition();
  const [error, action, pending] = useActionState(verifyCode, null);
  const activeFactor = factorId ?? (enroll && "factorId" in enroll ? enroll.factorId : null);

  return (
    <Card className="space-y-4">
      {!factorId && !activeFactor && (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>下のボタンを押すとQRコードが出ます</li>
            <li>認証アプリでQRコードを読み取ります</li>
            <li>アプリに出た6桁のコードを入力します</li>
          </ol>
          <Button className="w-full" disabled={starting} onClick={() => startTransition(async () => setEnroll(await startEnroll()))}>
            認証アプリを登録する
          </Button>
          {enroll && "error" in enroll && <p className="text-sm text-red-600">{enroll.error}</p>}
        </>
      )}
      {enroll && "qr" in enroll && (
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="認証アプリ登録用のQRコード" className="mx-auto size-48" />
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer">QRコードが読めない場合</summary>
            <p className="mt-1 font-mono break-all select-all">{enroll.secret}</p>
          </details>
        </div>
      )}
      {activeFactor && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="factor_id" value={activeFactor} />
          <Field label="6桁のコード" htmlFor="code">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
              className="text-center font-mono text-2xl tracking-[0.4em]"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "確認中…" : "確認する"}
          </Button>
        </form>
      )}
    </Card>
  );
}
