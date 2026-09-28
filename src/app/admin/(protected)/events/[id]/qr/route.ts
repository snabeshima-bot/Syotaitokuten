import QRCode from "qrcode";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";

export async function GET(_: Request, { params }: RouteContext<"/admin/events/[id]/qr">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const { data: event } = await supabase.from("events").select("slug").eq("id", id).maybeSingle();
  if (!event) return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(`${env.appUrl}/${event.slug}`, { width: 1024, margin: 2 });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${event.slug}.png"`,
    },
  });
}
