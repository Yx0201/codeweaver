import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // @node-rs/jieba ships a Rust/N-API native binary (.node file) that webpack
  // cannot bundle. Listing it here makes Next.js require() it at runtime
  // instead of trying to inline it, which is required for server actions and
  // route handlers that (transitively) import the tokenizer module.
  serverExternalPackages: ["@node-rs/jieba"],
};

export default nextConfig;
