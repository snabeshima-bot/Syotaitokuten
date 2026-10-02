import Link from "next/link";
import { audit, requireStaff } from "@/lib/auth";
import { shippingItems } from "@/lib/admin-data";
import { formatPostalCode, formatReceiptNo } from "@/lib/normalize";
import { loadShippingTargets } from "../targets";
import { PrintButton } from "./print-button";

const PER_SHEET = 12;

export default async function PrintPage({ params, searchParams }: PageProps<"/admin/events/[id]/shipping/print">) {
  const { id } = await params;
  const { mode } = await searchParams;
  const ctx = await requireStaff();
  const targets = await loadShippingTargets(ctx.supabase, id);
  await audit(ctx, mode === "labels" ? "shipping.print_labels" : "shipping.print_picking", "event", id, { count: targets.length });
  const sheets = Array.from({ length: Math.ceil(targets.length / PER_SHEET) }, (_, i) => targets.slice(i * PER_SHEET, (i + 1) * PER_SHEET));

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/admin/events/${id}/shipping`} className="text-sm text-gray-600 hover:underline">
          ← 発送
        </Link>
        <span className="text-sm">{targets.length} 件</span>
        <PrintButton />
        {mode === "labels" && <span className="text-xs text-gray-500">印刷設定は「余白なし」「倍率100%」にしてください（86.4×42.3mm の12面ラベル用）</span>}
      </div>

      {mode === "labels" ? (
        <>
          <style>{`
            @page { size: A4; margin: 0; }
            .sheet { width: 210mm; height: 297mm; padding: 21.5mm 18.6mm; box-sizing: border-box; display: grid;
                     grid-template-columns: repeat(2, 86.4mm); grid-auto-rows: 42.3mm; column-gap: 0; background: white;
                     break-after: page; margin: 0 auto 8mm; box-shadow: 0 0 0 1px #ddd; }
            .label { padding: 4mm 5mm; box-sizing: border-box; overflow: hidden; font-size: 10pt; line-height: 1.35; }
            @media print { .sheet { box-shadow: none; margin: 0; } main { padding: 0 !important; max-width: none !important; } }
          `}</style>
          {sheets.map((sheet, i) => (
            <div key={i} className="sheet">
              {sheet.map((s) => (
                <div key={s.id} className="label">
                  <div>〒{formatPostalCode(s.postal_code)}</div>
                  <div>{s.address1}</div>
                  {s.address2 && <div>{s.address2}</div>}
                  <div className="mt-1 text-[12pt] font-bold">{s.full_name} 様</div>
                  <div className="text-[7pt] text-gray-500">No.{formatReceiptNo(s.receipt_no)}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="p-2">✓</th>
              <th className="p-2">受付番号</th>
              <th className="p-2">お名前</th>
              <th className="p-2">同梱物</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((s) => (
              <tr key={s.id} className="border-b border-gray-300 align-top" style={{ breakInside: "avoid" }}>
                <td className="p-2">□</td>
                <td className="p-2 font-mono">{formatReceiptNo(s.receipt_no)}</td>
                <td className="p-2">{s.full_name}</td>
                <td className="p-2">
                  <ul>
                    {shippingItems(s).map((item) => (
                      <li key={item}>□ {item}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
