"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, requireStaff } from "@/lib/auth";
import { jstInputToIso } from "@/lib/datetime";

export type ActionResult = { ok: boolean; message: string } | null;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// ---------- メンバー ----------

export async function saveMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name"),
    group_name: str(fd, "group_name"),
    sort_order: Number(str(fd, "sort_order") || 0),
    active: fd.get("active") === "on",
  };
  if (!row.name) return { ok: false, message: "名前を入力してください" };
  const { error } = id
    ? await ctx.supabase.from("members").update(row).eq("id", id)
    : await ctx.supabase.from("members").insert(row);
  if (error) return { ok: false, message: error.message };
  await audit(ctx, id ? "member.update" : "member.create", "member", id || null, row);
  revalidatePath("/admin/members");
  return { ok: true, message: "保存しました" };
}

// ---------- 公演 ----------

const eventSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "URL名は半角英小文字・数字・ハイフン（2〜63文字）で入力してください"),
  title: z.string().min(1, "公演名を入力してください"),
  description: z.string(),
  event_date: z.string().nullable(),
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  status: z.enum(["draft", "open", "closed"]),
  retention_days: z.coerce.number().int().min(0),
});

function readEvent(fd: FormData) {
  return eventSchema.safeParse({
    slug: str(fd, "slug"),
    title: str(fd, "title"),
    description: String(fd.get("description") ?? ""),
    event_date: str(fd, "event_date") || null,
    opens_at: jstInputToIso(str(fd, "opens_at")),
    closes_at: jstInputToIso(str(fd, "closes_at")),
    status: str(fd, "status") || "draft",
    retention_days: str(fd, "retention_days") || "90",
  });
}

export async function createEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const parsed = readEvent(fd);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { data, error } = await ctx.supabase.from("events").insert(parsed.data).select("id").single();
  if (error) return { ok: false, message: error.code === "23505" ? "このURL名はすでに使われています" : error.message };

  // 複製元があれば、選べるメンバーと段をコピーする
  const copyFrom = str(fd, "copy_from");
  if (copyFrom) {
    const [{ data: em }, { data: tiers }] = await Promise.all([
      ctx.supabase.from("event_members").select("member_id, sort_order").eq("event_id", copyFrom),
      ctx.supabase.from("reward_tiers").select("min_count, name, description, requires_member, delivery, sort_order").eq("event_id", copyFrom),
    ]);
    if (em?.length) await ctx.supabase.from("event_members").insert(em.map((r) => ({ ...r, event_id: data.id })));
    if (tiers?.length) await ctx.supabase.from("reward_tiers").insert(tiers.map((r) => ({ ...r, event_id: data.id })));
  } else {
    const { data: members } = await ctx.supabase.from("members").select("id, sort_order").eq("active", true);
    if (members?.length) {
      await ctx.supabase
        .from("event_members")
        .insert(members.map((m) => ({ event_id: data.id, member_id: m.id, sort_order: m.sort_order })));
    }
  }
  await audit(ctx, "event.create", "event", data.id, { ...parsed.data, copy_from: copyFrom || null });
  redirect(`/admin/events/${data.id}/settings`);
}

export async function updateEvent(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const id = str(fd, "id");
  const parsed = readEvent(fd);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("events").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: error.code === "23505" ? "このURL名はすでに使われています" : error.message };
  await audit(ctx, "event.update", "event", id, parsed.data);
  revalidatePath(`/admin/events/${id}`, "layout");
  return { ok: true, message: "保存しました" };
}

export async function uploadEventImage(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const id = str(fd, "id");
  const file = fd.get("image");
  if (fd.get("remove") === "1") {
    await ctx.supabase.from("events").update({ image_url: null }).eq("id", id);
    revalidatePath(`/admin/events/${id}`, "layout");
    return { ok: true, message: "画像を外しました" };
  }
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "画像を選んでください" };
  if (!file.type.startsWith("image/")) return { ok: false, message: "画像ファイルを選んでください" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "5MB 以下の画像にしてください" };
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${id}/${Date.now()}.${ext}`;
  const { error } = await ctx.supabase.storage.from("event-images").upload(path, file, { contentType: file.type });
  if (error) return { ok: false, message: error.message };
  const { data } = ctx.supabase.storage.from("event-images").getPublicUrl(path);
  await ctx.supabase.from("events").update({ image_url: data.publicUrl }).eq("id", id);
  await audit(ctx, "event.image", "event", id, { path });
  revalidatePath(`/admin/events/${id}`, "layout");
  return { ok: true, message: "画像を登録しました" };
}

export async function setEventMembers(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const id = str(fd, "id");
  const selected = fd.getAll("member_id").map(String);
  const { error: delError } = await ctx.supabase.from("event_members").delete().eq("event_id", id);
  if (delError) return { ok: false, message: delError.message };
  if (selected.length) {
    const { data: members } = await ctx.supabase.from("members").select("id, sort_order").in("id", selected);
    const { error } = await ctx.supabase
      .from("event_members")
      .insert((members ?? []).map((m) => ({ event_id: id, member_id: m.id, sort_order: m.sort_order })));
    if (error) return { ok: false, message: error.message };
  }
  await audit(ctx, "event.members", "event", id, { members: selected });
  revalidatePath(`/admin/events/${id}`, "layout");
  return { ok: true, message: "保存しました" };
}

// ---------- 段（特典） ----------

const tierSchema = z.object({
  min_count: z.coerce.number().int().min(1, "必要人数は1以上にしてください"),
  name: z.string().min(1, "特典名を入力してください"),
  description: z.string(),
  requires_member: z.boolean(),
  delivery: z.enum(["ship", "hand"]),
  sort_order: z.coerce.number().int(),
});

export async function saveTier(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const id = str(fd, "id");
  const parsed = tierSchema.safeParse({
    min_count: str(fd, "min_count"),
    name: str(fd, "name"),
    description: str(fd, "description"),
    requires_member: fd.get("requires_member") === "on",
    delivery: str(fd, "delivery") || "ship",
    sort_order: str(fd, "sort_order") || "0",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { error } = id
    ? await ctx.supabase.from("reward_tiers").update(parsed.data).eq("id", id).eq("event_id", eventId)
    : await ctx.supabase.from("reward_tiers").insert({ ...parsed.data, event_id: eventId });
  if (error) return { ok: false, message: error.message };
  await audit(ctx, id ? "tier.update" : "tier.create", "reward_tier", id || null, { event_id: eventId, ...parsed.data });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: "保存しました" };
}

export async function deleteTier(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireStaff();
  const eventId = str(fd, "event_id");
  const id = str(fd, "id");
  const { count } = await ctx.supabase
    .from("submission_rewards")
    .select("id", { count: "exact", head: true })
    .eq("tier_id", id);
  if (count) return { ok: false, message: `この特典はすでに ${count} 件の回答で使われているため削除できません` };
  const { error } = await ctx.supabase.from("reward_tiers").delete().eq("id", id).eq("event_id", eventId);
  if (error) return { ok: false, message: error.message };
  await audit(ctx, "tier.delete", "reward_tier", id, { event_id: eventId });
  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true, message: "削除しました" };
}
