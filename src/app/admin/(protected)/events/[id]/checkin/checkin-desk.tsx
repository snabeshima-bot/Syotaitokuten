"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";
import { Badge, Button, Card, Input, cx } from "@/components/ui";
import { STATUS_TONES, SUBMISSION_STATUS_LABELS } from "@/lib/types";
import { confirmAtDesk, lookupReceipt, type CheckinCard } from "./actions";

export function CheckinDesk({ eventId, choices }: { eventId: string; choices: number[] }) {
  const [input, setInput] = useState("");
  const [card, setCard] = useState<CheckinCard | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CheckinCard[]>([]);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function lookup(value: string) {
    setError(null);
    setJustConfirmed(false);
    startTransition(async () => {
      const r = await lookupReceipt(eventId, value);
      if ("error" in r) {
        setError(r.error);
        setCard(null);
      } else {
        setCard(r.card);
        setCount(r.card.confirmed ?? r.card.claimed);
      }
    });
  }

  function confirm(n: number) {
    if (!card) return;
    startTransition(async () => {
      const r = await confirmAtDesk(eventId, card.id, n);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setCard(r.card);
      setJustConfirmed(true);
      setDone((d) => [r.card, ...d.filter((c) => c.id !== r.card.id)].slice(0, 20));
    });
  }

  function nextPerson() {
    setCard(null);
    setInput("");
    setError(null);
    setJustConfirmed(false);
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">当日受付（人数の確認）</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup(input);
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            placeholder="受付番号"
            aria-label="受付番号"
            className="text-center font-mono text-2xl tracking-widest"
            autoFocus
          />
          <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={pending || !input}>
            呼び出す
          </Button>
        </form>
        <Button variant="secondary" className="w-full" onClick={() => setScanning((s) => !s)}>
          {scanning ? "カメラを閉じる" : "お客様の画面のQRを読み取る"}
        </Button>
        {scanning && (
          <QrScanner
            onResult={(text) => {
              setScanning(false);
              setInput(text.replace(/^receipt:/, ""));
              lookup(text);
            }}
            onError={(msg) => {
              setScanning(false);
              setError(msg);
            }}
          />
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </Card>

      {card && (
        <Card className={cx("space-y-4", justConfirmed && "ring-2 ring-emerald-400")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xl font-bold">{card.receiptNo}</span>
            <Badge tone={STATUS_TONES[card.status]}>{SUBMISSION_STATUS_LABELS[card.status]}</Badge>
            {card.duplicate && <Badge tone="red">重複の疑い</Badge>}
          </div>
          <p className="text-lg font-semibold">{card.nickname} 様</p>
          <p className="font-mono text-sm text-gray-600">チケット番号 {card.ticketNumber}</p>
          <p className="text-sm">
            申告 <b className="text-lg">{card.claimed}人</b>
            {card.confirmed !== null && (
              <>
                {" "}
                ／ 確定 <b className="text-lg">{card.confirmed}人</b>
              </>
            )}
          </p>

          {justConfirmed ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-emerald-50 p-3 text-center font-semibold text-emerald-800">{card.confirmed}人で確定しました</p>
              <ul className="space-y-1 text-sm">
                {card.rewards.map((r) => (
                  <li key={r} className="rounded-md bg-gray-50 px-3 py-2">
                    {r}
                  </li>
                ))}
              </ul>
              <Button className="w-full py-3.5 text-base" onClick={nextPerson}>
                次の人へ
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button className="w-full py-4 text-lg" disabled={pending} onClick={() => confirm(card.claimed)}>
                申告どおり {card.claimed}人で確定
              </Button>
              <details className="rounded-lg border border-gray-200 p-3" open={card.confirmed !== null && card.confirmed !== card.claimed}>
                <summary className="cursor-pointer text-sm font-semibold">人数を変えて確定する</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="secondary" className="size-12 text-xl" onClick={() => setCount((c) => Math.max(0, c - 1))} aria-label="1人減らす">
                      −
                    </Button>
                    <span className="w-20 text-center text-3xl font-bold tabular-nums" aria-live="polite">
                      {count}人
                    </span>
                    <Button variant="secondary" className="size-12 text-xl" onClick={() => setCount((c) => c + 1)} aria-label="1人増やす">
                      ＋
                    </Button>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1">
                    {choices.map((c) => (
                      <button key={c} type="button" onClick={() => setCount(c)} className={cx("rounded-full border px-3 py-1 text-sm", count === c ? "border-brand-500 bg-brand-50" : "border-gray-300")}>
                        {c}人
                      </button>
                    ))}
                  </div>
                  <Button variant="secondary" className="w-full" disabled={pending} onClick={() => confirm(count)}>
                    {count}人で確定
                  </Button>
                </div>
              </details>
              <ul className="space-y-1 text-xs text-gray-600">
                {card.rewards.map((r) => (
                  <li key={r}>・{r}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {done.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-sm font-bold">この端末で確定した回答</h3>
          <ul className="divide-y divide-gray-100 text-sm">
            {done.map((c) => (
              <li key={c.id} className="flex justify-between py-1.5">
                <span className="font-mono">{c.receiptNo}</span>
                <span>{c.nickname}</span>
                <span className="font-semibold">{c.confirmed}人</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** カメラでQRを読む（iPhone の Safari でも動くよう jsQR で読む） */
function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (message: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 親が再描画されてもカメラを開き直さないよう、コールバックは ref で持つ
  const callbacks = useRef({ onResult, onError });
  useEffect(() => {
    callbacks.current = { onResult, onError };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const g = canvas.getContext("2d", { willReadFrequently: true });
        if (g) {
          g.drawImage(video, 0, 0);
          const image = g.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            callbacks.current.onResult(code.data);
            return;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        frame = requestAnimationFrame(tick);
      })
      .catch(() => callbacks.current.onError("カメラを使えませんでした。ブラウザのカメラの許可を確認するか、受付番号を入力してください。"));

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
