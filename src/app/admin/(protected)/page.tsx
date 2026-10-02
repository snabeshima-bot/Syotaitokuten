import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EVENT_STATUS_LABELS, type EventRow } from "@/lib/types";
import { createEvent } from "./actions";

export default async function AdminHome() {
  const { supabase } = await requireStaff();
  const [{ data: events }, { data: counts }] = await Promise.all([
    supabase.from("events").select("*").order("event_date", { ascending: false, nullsFirst: true }),
    supabase.from("submissions").select("event_id"),
  ]);
  const countBy = new Map<string, number>();
  (counts ?? []).forEach((r) => countBy.set(r.event_id, (countBy.get(r.event_id) ?? 0) + 1));
  const list = (events ?? []) as EventRow[];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-3">
        <h1 className="text-lg font-bold">公演</h1>
        {list.length === 0 && <p className="text-sm text-gray-500">まだ公演がありません。右のフォームから作成してください。</p>}
        <ul className="space-y-2">
          {list.map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/events/${e.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-brand-300"
              >
                <Badge tone={e.status === "open" ? "green" : e.status === "draft" ? "amber" : "gray"}>
                  {EVENT_STATUS_LABELS[e.status]}
                </Badge>
                <span className="font-semibold">{e.title}</span>
                <span className="text-sm text-gray-500">{e.event_date ?? "日付未設定"}</span>
                <span className="ml-auto text-sm text-gray-600">{countBy.get(e.id) ?? 0} 件</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card className="h-fit">
        <h2 className="mb-4 font-bold">公演を作成</h2>
        <ActionForm action={createEvent} className="space-y-4">
              <Field label="公演名" required htmlFor="title">
                <Input id="title" name="title" required placeholder="SCRAMBLE SMILE 2nd SMILE 招待特典" />
              </Field>
              <Field label="URL名（任意）" hint="空欄なら推測されにくい名前を自動で付けます。例: 2nd-smile → https://…/2nd-smile" htmlFor="slug">
                <Input id="slug" name="slug" pattern="[a-z0-9][a-z0-9\-]{1,62}" />
              </Field>
              <Field label="公演日" htmlFor="event_date">
                <Input id="event_date" name="event_date" type="date" />
              </Field>
              <Field label="特典とメンバーを複製する公演" htmlFor="copy_from" hint="選ばないと、在籍中のメンバー全員が選べる状態で作成します">
                <Select id="copy_from" name="copy_from" defaultValue="">
                  <option value="">複製しない</option>
                  {list.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <input type="hidden" name="status" value="draft" />
              <SubmitButton className="w-full">作成する</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
