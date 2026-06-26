import { auth } from "@/auth";

/**
 * 在 API Route / Server Action 顶部调用,返回当前登录用户 id,未登录返回 null。
 * 调用方负责返回 401 或抛错。
 */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
