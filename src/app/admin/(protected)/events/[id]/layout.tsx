import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { EVENT_STATUS_LABELS } from "@/lib/types";
import { env } from "@/lib/env";
import { EventTabs } from "./tabs";

export default async function EventLayout({ children, params }: LayoutProps<"/admin/events/[id]">) {
  const { id } = await params;
  const { supabase } = await requireStaff();
  const { data: event } = await supabase.from("events").select("id, title, slug, status, event_date").eq("id", id).maybeSingle();
  if (!event) notFound();
  return (
    <div className="space-y-4">
      <div className="no-print space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={event.status === "open" ? "green" : event.status === "draft" ? "amber" : "gray"}>
            {EVENT_STATUS_LABELS[event.status as keyof typeof EVENT_STATUS_LABELS]}
          </Badge>
          <h1 className="text-lg font-bold">{event.title}</h1>
        </div>
        <p className="text-xs text-gray-500">
          {event.event_date ?? "日付未設定"} ・ 受付URL: {env.appUrl}/{event.slug}
        </p>
      </div>
      <EventTabs id={id} />
      {children}
    </div>
  );
}
