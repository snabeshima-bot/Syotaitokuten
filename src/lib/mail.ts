import "server-only";
import { env } from "./env";
import { formatReceiptNo } from "./normalize";

type Mail = { to: string; subject: string; text: string };

/**
 * Resend でメールを送る。RESEND_API_KEY / MAIL_FROM が未設定のときは送らずにログだけ出す。
 * 送信に失敗しても受付処理は止めないので、結果を boolean で返す。
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!env.resendApiKey || !env.mailFrom) {
    console.info("[mail] RESEND_API_KEY/MAIL_FROM 未設定のため送信をスキップ:", mail.to, mail.subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.mailFrom,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(env.mailReplyTo ? { reply_to: env.mailReplyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[mail] 送信に失敗:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[mail] 送信に失敗:", e);
    return false;
  }
}

const FOOTER = "\n\n※このメールは送信専用です。お心当たりのない場合は破棄してください。";

export function receiptMail(p: {
  to: string;
  eventTitle: string;
  receiptNo: number;
  nickname: string;
  count: number;
  items: string[];
  shipping: boolean;
}): Mail {
  return {
    to: p.to,
    subject: `【受付完了】${p.eventTitle}`,
    text:
      `${p.nickname} 様\n\n招待特典のお申し込みを受け付けました。\n\n` +
      `受付番号: ${formatReceiptNo(p.receiptNo)}\n` +
      `招待した人数（申告）: ${p.count}人\n\n` +
      `■ 特典\n${p.items.map((i) => `・${i}`).join("\n")}\n\n` +
      `招待人数はスタッフが確認いたします。確認の結果、特典の内容が変わる場合があります。` +
      (p.shipping ? "\n発送が完了しましたら、改めてメールでお知らせいたします。" : "") +
      FOOTER,
  };
}

export function shippedMail(p: {
  to: string;
  eventTitle: string;
  receiptNo: number;
  nickname: string;
  carrier: string;
  trackingNumber: string;
  items: string[];
}): Mail {
  return {
    to: p.to,
    subject: `【発送完了】${p.eventTitle} 招待特典`,
    text:
      `${p.nickname} 様\n\n招待特典を発送いたしました。\n\n` +
      `受付番号: ${formatReceiptNo(p.receiptNo)}\n` +
      (p.carrier ? `配送方法: ${p.carrier}\n` : "") +
      (p.trackingNumber ? `追跡番号: ${p.trackingNumber}\n` : "") +
      `\n■ 同梱物\n${p.items.map((i) => `・${i}`).join("\n")}\n\n` +
      `到着まで今しばらくお待ちください。` +
      FOOTER,
  };
}
