"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageSquare, BookOpen, Plus, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserMenu, type SessionUser } from "@/components/layout/user-menu";

const menuItems = [
  {
    name: "首页",
    href: "/",
    icon: Home,
  },
  {
    name: "对话",
    href: "/chat",
    icon: MessageSquare,
  },
  {
    name: "知识库",
    href: "/knowledge",
    icon: BookOpen,
  },
];

/** Custom woven-threads brand mark — avoids the generic default logo icon. */
function WeaveMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M4 7c5.5 0 5.5 10 11 10M9 7c5.5 0 5.5 10 11 10" stroke="currentColor" opacity="0.55" />
      <path d="M4 17c5.5 0 5.5-10 11-10M9 17c5.5 0 5.5-10 11-10" stroke="currentColor" />
    </svg>
  );
}

export function AppSidebar({ user }: { user?: SessionUser }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-none">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Brand mark — the sidebar is permanently icon-only, so the button
                is simply a fixed, centered gradient tile holding the icon. */}
            <SidebarMenuButton
              asChild
              tooltip="CodeWeaver"
              className="justify-center bg-gradient-to-br from-primary to-primary/70 text-primary-foreground ring-1 ring-primary/30 hover:text-primary-foreground"
            >
              <Link href="/">
                <WeaveMark />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="新建对话"
              className="mt-1 min-w-8 bg-primary text-primary-foreground font-medium transition-[transform,background-color] duration-200 ease-out hover:bg-primary/90 hover:text-primary-foreground active:scale-[0.98] active:bg-primary/90 active:text-primary-foreground"
            >
              <Link href="/chat">
                <Plus className="size-4" />
                <span>新建对话</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.18em]">
            导航
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.name}
                      className="transition-colors data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {user && <UserMenu user={user} />}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip="系统设置"
              className="transition-colors data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"
            >
              <Link href="/settings">
                <Settings />
                <span>系统设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="truncate font-mono tracking-tight group-data-[collapsible=icon]:hidden">
            服务在线 · v0.1
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
