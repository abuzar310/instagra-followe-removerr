"use client";

import { ChevronRight, LayoutDashboard, Users, SlidersHorizontal, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/review", label: "Review", icon: Users },
  { href: "/rules", label: "Rules", icon: SlidersHorizontal },
];

export default function Sidebar({ collapsed }: { collapsed: boolean; onToggle: () => void }) {
  const path = usePathname();

  return (
    <aside className={`${collapsed ? "w-16" : "w-56"} transition-all duration-300 shrink-0 border-r border-white/5 flex flex-col`}>
      <div className="h-14 flex items-center px-4 border-b border-white/5">
        {!collapsed && <span className="text-sm font-bold tracking-tight text-white/90">IFR</span>}
      </div>
      <nav className="flex-1 py-3 space-y-1 px-2">
        {NAV.map((n) => {
          const active = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/5"
              }`}
            >
              <n.icon size={18} strokeWidth={1.5} />
              {!collapsed && <span>{n.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
