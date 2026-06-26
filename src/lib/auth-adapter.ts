import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 极简 Auth.js Prisma 适配器。
 *
 * 不用官方 @auth/prisma-adapter 的原因:它的 peerDeps 不含 Prisma 7,
 * 且本项目 prisma.ts 已用 Neon serverless 驱动做精细适配。这里只实现
 * JWT session 策略下真正会被调用的方法(createUser、getUser 系列、
 * updateUser、linkAccount、unlinkAccount),session 相关方法在 JWT 策略
 * 下不会被触发。
 *
 * Account 列名是 snake_case(refresh_token 等),AdapterAccount 是 camelCase,
 * 需手动映射。
 */
export function buildPrismaAdapter(prisma: PrismaClient): Adapter {
  return {
    createUser: async (data: AdapterUser) => {
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          emailVerified: data.emailVerified,
          image: data.image,
        },
      });
      return { ...user, emailVerified: user.emailVerified ?? null } as AdapterUser;
    },

    getUser: async (id) => {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return null;
      return { ...user, emailVerified: user.emailVerified ?? null } as AdapterUser;
    },

    getUserByEmail: async (email) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return null;
      return { ...user, emailVerified: user.emailVerified ?? null } as AdapterUser;
    },

    getUserByAccount: async ({ provider, providerAccountId }) => {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        include: { user: true },
      });
      if (!account) return null;
      const u = account.user;
      return { ...u, emailVerified: u.emailVerified ?? null } as AdapterUser;
    },

    updateUser: async (data) => {
      const user = await prisma.user.update({
        where: { id: data.id },
        data: {
          name: data.name,
          email: data.email,
          emailVerified: data.emailVerified,
          image: data.image,
        },
      });
      return { ...user, emailVerified: user.emailVerified ?? null } as AdapterUser;
    },

    linkAccount: async (account: AdapterAccount) => {
      // AdapterAccount 的 token 相关字段(refresh_token、session_state 等)
      // 来自 index signature,TS 推断为 JsonValue,但运行时是字符串。这里统一
      // 当作 string | null | undefined 处理。
      const a = account as AdapterAccount & Record<string, string | null | undefined>;
      await prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          refresh_token: a.refresh_token ?? null,
          access_token: a.access_token ?? null,
          expires_at: account.expires_at,
          token_type: a.token_type ?? null,
          scope: a.scope ?? null,
          id_token: a.id_token ?? null,
          session_state: a.session_state ?? null,
        },
      });
    },

    unlinkAccount: async ({ provider, providerAccountId }) => {
      await prisma.account.delete({
        where: { provider_providerAccountId: { provider, providerAccountId } },
      });
    },
  };
}
