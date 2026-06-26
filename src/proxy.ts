import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Next 16 的 proxy(原 middleware)运行在 Edge Runtime,只能用 Edge 安全的
 * authConfig(无 Prisma)。`auth()` 仅从 JWT cookie 读取登录态。
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_PREFIXES = ["/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  return NextResponse.next();
});

export const config = {
  // 排除静态资源与 /api/* —— API 路由自带 requireUserId() 守卫,会返回
  // 401 JSON;若 proxy 拦截 API 会返回 307 重定向到 /login,对 API 调用方
  // 不友好。/api/auth 同理走 route handler 自行处理。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
