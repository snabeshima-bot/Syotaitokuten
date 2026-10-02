"use client";

import { useEffect } from "react";
import { logout } from "./login/actions";

/** 画面を開いたまま離れても個人情報が出たままにならないよう、操作がなければログイン画面へ移る */
export function IdleLogout({ timeoutMs }: { timeoutMs: number }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void logout("timeout");
      }, timeoutMs);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);
  return null;
}
