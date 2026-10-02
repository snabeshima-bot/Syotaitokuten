"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function EventTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/admin/events/${id}`;
  const tabs = [
    { href: `${base}/checkin`, label: "当日受付" },
    { href: base, label: "回答" },
    { href: `${base}/summary`, label: "集計" },
    { href: `${base}/shipping`, label: "発送" },
    { href: `${base}/settings`, label: "設定" },
  ];
  return (
    <nav className="no-print flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base || pathname.startsWith(`${base}/submissions`) : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
