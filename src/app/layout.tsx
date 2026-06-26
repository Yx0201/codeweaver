import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { ChatScrollProvider } from "@/components/settings/chat-scroll-provider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { auth } from "@/auth";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "CodeWeaver — knowledge graph chat",
  description:
    "Retrieval-augmented chat over your documents, with an interactive knowledge graph.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 登录态决定外壳:已登录渲染 sidebar 应用壳;未登录(middleware 已将
  // 未登录用户导向 /login、/register)渲染全屏,供 auth 页面居中布局。
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        "font-sans",
        geist.variable,
        geistMono.variable
      )}
    >
      <body className="h-full flex flex-col overflow-hidden bg-sidebar">
        {/*
          Theme init must run before paint to avoid a flash. next/script with
          `beforeInteractive` is hoisted into <head> by Next during SSR and is
          treated as an HTML element (not a React-rendered <script>), which
          silences React 19's "script tag inside component" warning.
        */}
        <Script id="codeweaver-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {/* Fine grain overlay breaks digital flatness; never intercepts input. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 opacity-[0.018] mix-blend-soft-light"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <ThemeProvider>
          <ChatScrollProvider>
            {isAuthed ? (
              <TooltipProvider>
                {/* open={false} locks the sidebar in its icon-only collapsed state;
                    with no trigger it can never expand — hover reveals the label
                    via each item's tooltip. */}
                <SidebarProvider open={false}>
                  <AppSidebar
                    user={{
                      name: session.user.name,
                      email: session.user.email,
                      image: session.user.image,
                    }}
                  />
                  <SidebarInset className="mt-2 mr-2 mb-2 border rounded-xl border-border bg-popover shadow-(--shadow-ambient)">
                    <main className="flex-1 overflow-auto flex flex-col">
                      {children}
                    </main>
                  </SidebarInset>
                </SidebarProvider>
              </TooltipProvider>
            ) : (
              <main className="flex-1 overflow-auto">{children}</main>
            )}
          </ChatScrollProvider>
        </ThemeProvider>
        {/* Vercel Analytics — 自动上报 page view,仅在 Vercel 环境生效 */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
