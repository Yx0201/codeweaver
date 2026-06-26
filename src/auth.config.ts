import type { NextAuthConfig } from "next-auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Edge-safe Auth.js 配置。
 *
 * 关键:这里**不**导入 Prisma 适配器、也**不**放 Credentials provider
 * (它的 authorize 会查库)。proxy(middleware)运行在 Edge Runtime,只能用
 * JWT cookie 校验登录态,不需要数据库。providers 留空数组——真正的
 * GitHub/Credentials provider 在 `auth.ts`(Node 运行时)里覆盖。
 *
 * jwt/session 回调放在这里,让 proxy 和 Node 侧共享同一份逻辑。
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
