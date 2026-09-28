import { type NextRequest } from "next/server";
import { audit, requireStaff } from "@/lib/auth";
import { toShippingRow } from "@/lib/admin-data";
import { buildShippingCsv, EXPORT_FORMATS, type ExportFormat } from "@/lib/shipping";
import { loadShippingTargets } from "../targets";

export async function GET(request: NextRequest, { params }: RouteContext<"/admin/events/[id]/shipping/export">) {
  const { id } = await params;
  const ctx = await requireStaff();
  const format = (request.nextUrl.searchParams.get("format") ?? "generic") as ExportFormat;
  if (!(format in EXPORT_FORMATS)) return new Response("Bad format", { status: 400 });
  const targets = await loadShippingTargets(ctx.supabase, id);
  const csv = buildShippingCsv(format, targets.map(toShippingRow));
  await audit(ctx, "shipping.export", "event", id, { format, count: targets.length });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shipping-${format}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
