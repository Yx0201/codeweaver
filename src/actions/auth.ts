"use server";

import { hash } from "bcryptjs";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";

export type AuthFormState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
  };
  message?: string;
};

const credentialsSchema = z.object({
  email: z.email({ error: "请输入有效的邮箱地址" }).trim(),
  password: z
    .string()
    .min(8, { error: "密码至少 8 位" })
    .regex(/[a-zA-Z]/, { error: "密码需包含至少一个字母" })
    .regex(/[0-9]/, { error: "密码需包含至少一个数字" })
    .trim(),
});

const registerSchema = credentialsSchema.extend({
  name: z.string().min(2, { error: "昵称至少 2 个字符" }).trim(),
});

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { name, email, password } = validated.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { message: "该邮箱已被注册" };
  }

  const passwordHash = await hash(password, 12);
  await prisma.user.create({
    data: { name, email, passwordHash },
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/chat",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "注册成功，但自动登录失败，请手动登录" };
    }
    throw error;
  }

  return {};
}

export async function githubLoginAction() {
  await signIn("github", { redirectTo: "/chat" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const validated = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/chat",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { message: "邮箱或密码错误" };
        default:
          return { message: "登录失败，请重试" };
      }
    }
    throw error;
  }

  return {};
}
