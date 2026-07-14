"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <html lang="en">
      <body className="bg-[#0a0a0b] text-white/80 antialiased min-h-dvh flex">
        {mobileOpen && (
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}
        <div className="hidden lg:flex">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        </div>
        <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
        </div>
        <div className="flex-1 flex flex-col min-h-dvh">
          <header className="h-14 flex items-center gap-3 px-4 border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-lg sticky top-0 z-30">
            <button className="lg:hidden p-1.5 text-white/40 hover:text-white/70" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <span className="text-sm font-medium text-white/30">Instagram Follower Review</span>
          </header>
          <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
