import NextAuth, { customFetch } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { buildPrismaAdapter } from "@/lib/auth-adapter";
import { authConfig } from "@/auth.config";

/**
 * 让服务端 fetch 走 HTTP 代理,并容忍代理不可用。
 *
 * Node 内置 fetch(undici)默认**不读** http_proxy/https_proxy 环境变量,
 * 因此即便本机挂了代理(Clash/Mihomo 等),dev server 直连 github.com 仍会
 * 被 GFW 超时,导致 OAuth 回调失败并显示笼统的 Configuration 错误页。
 *
 * 策略:
 *  - 有 HTTPS_PROXY/HTTP_PROXY 环境变量时,用 undici ProxyAgent 走代理。
 *  - 若代理本身连不上(端口关了 / Clash 没开,但环境变量还在),自动回退直连,
 *    避免「关了代理程序就登录不了」。
 *  - 无代理环境变量时(Vercel 生产)直接直连,并对瞬时网络错误重试一次。
 *
 * 注意:必须用 undici 包自己的 fetch(而非 Node 全局 fetch),因为全局 fetch
 * 用的是 Node 内置 undici,与外装 undici 的 ProxyAgent 版本不匹配会静默失败。
 */
function buildAuthFetch(): typeof fetch {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  const dispatcher: Dispatcher | undefined = proxyUrl
    ? new ProxyAgent(proxyUrl)
    : undefined;

  // undici 的 Response 与 DOM Response 在 TS 里类型不同(运行时兼容),
  // 这里统一断言为 typeof fetch,避免类型不匹配。
  const doFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const viaProxy = () => undiciFetch(input as never, { ...init, dispatcher } as never);
    const direct = () => undiciFetch(input as never, { ...init } as never);

    try {
      return await viaProxy();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (dispatcher) {
        // 配了代理却失败:大概率代理程序没开(端口关)。回退直连试一次,
        // 让「关代理后仍能用」成立(github 国内通常可直连)。
        return await direct();
      }
      // 没配代理:对瞬时网络错误重试一次。
      const isTransient =
        code === "UND_ERR_CONNECT_TIMEOUT" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "EAI_AGAIN";
      if (!isTransient) throw err;
      return await direct();
    }
  };

  return doFetch as unknown as typeof fetch;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: buildPrismaAdapter(prisma),
  // 覆盖 authConfig 的空 providers:这里才放真正需要查库/带密钥的 provider,
  // 仅在 Node 运行时(route handler、server action)使用,不进入 Edge proxy。
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      [customFetch]: buildAuthFetch(),
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
});
