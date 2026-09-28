import { requireStaff } from "@/lib/auth";
import { Badge, Card, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { Member } from "@/lib/types";
import { saveMember } from "../actions";

export default async function MembersPage() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.from("members").select("*").order("group_name").order("sort_order");
  const members = (data ?? []) as Member[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">メンバー</h1>
      <p className="text-sm text-gray-600">公演ごとに選べるメンバーは、公演の「設定」で選びます。</p>
      <Card className="space-y-3 overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[1fr_1fr_90px_90px_110px] gap-2 text-xs font-semibold text-gray-500">
          <span>名前</span>
          <span>グループ</span>
          <span>並び順</span>
          <span>在籍中</span>
          <span />
        </div>
        {[...members, null].map((m) => (
          <MemberRow key={m?.id ?? "new"} member={m} />
        ))}
      </Card>
    </div>
  );
}

function MemberRow({ member }: { member: Member | null }) {
  return (
    <ActionForm action={saveMember}>
      <div className="grid min-w-[640px] grid-cols-[1fr_1fr_90px_90px_110px] items-center gap-2">
        <input type="hidden" name="id" value={member?.id ?? ""} />
        <Input name="name" defaultValue={member?.name} placeholder={member ? "" : "新しいメンバー"} required />
        <Input name="group_name" defaultValue={member?.group_name ?? "SCRAMBLE SMILE"} />
        <Input name="sort_order" type="number" defaultValue={member?.sort_order ?? 0} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={member?.active ?? true} />
          {member && !member.active && <Badge>卒業</Badge>}
        </label>
        <SubmitButton variant={member ? "secondary" : "primary"}>{member ? "保存" : "追加"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
