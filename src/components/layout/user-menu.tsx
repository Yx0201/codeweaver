"use client";

import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { signOutAction } from "@/actions/auth";

export type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

function initialOf(name?: string | null, email?: string | null) {
  const src = (name?.trim() || email?.trim()) ?? "?";
  return src.charAt(0).toUpperCase();
}

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              tooltip={user.name ?? user.email ?? "账户"}
              className="transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-1 ring-primary/20">
                {initialOf(user.name, user.email)}
              </span>
              <span className="truncate">{user.name ?? user.email}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="min-w-56"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate font-medium">
                {user.name ?? "未命名用户"}
              </span>
              {user.email && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full cursor-pointer">
                  <LogOut />
                  <span>退出登录</span>
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
