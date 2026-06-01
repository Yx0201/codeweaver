"use client";

import Link from "next/link";
import {
  Network,
  Layers,
  MessageSquareText,
  FileStack,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Network,
    title: "知识图谱检索",
    description:
      "自动从文档中抽取实体与关系，构建可交互的知识网络，让检索沿着语义连接展开。",
    className: "md:col-span-2",
    accent: true,
  },
  {
    icon: Layers,
    title: "混合检索",
    description: "向量、关键词与图谱三路召回，经 RRF 融合重排。",
    className: "",
  },
  {
    icon: MessageSquareText,
    title: "流式对话",
    description: "基于检索上下文的多轮问答，逐字返回。",
    className: "",
  },
  {
    icon: FileStack,
    title: "文档处理流水线",
    description: "上传即解析、分块、向量化并写入图谱，全程可见进度。",
    className: "md:col-span-2",
  },
];

const stats = [
  { value: "3", label: "检索模式" },
  { value: "RRF", label: "融合重排" },
  { value: "实体 + 关系", label: "图谱抽取" },
];

export default function HomePage() {
  return (
    <div className="relative px-6 py-12 md:px-10 lg:py-16">
      {/* Ambient graph lines behind the hero — depth without a flat field. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[420px] w-[520px] max-w-full text-primary/[0.07]"
        viewBox="0 0 400 320"
        fill="none"
      >
        <path d="M40 40c120 0 80 200 200 200M120 20c120 0 80 220 200 220M0 120c160 0 120 160 280 160" stroke="currentColor" strokeWidth="1" />
        {[[40, 40], [240, 240], [120, 20], [320, 240], [0, 120], [280, 280]].map(
          ([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="4" className="fill-primary/20" />
          )
        )}
      </svg>

      <div className="mx-auto max-w-5xl">
        {/* Hero — left-aligned, asymmetric. */}
        <section className="max-w-2xl">
          <p className="animate-rise-in font-mono text-xs uppercase tracking-[0.22em] text-primary">
            AI Native · RAG 框架
          </p>
          <h1
            className="animate-rise-in mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl"
            style={{ animationDelay: "60ms" }}
          >
            把文档织成<span className="text-primary">可对话的知识网络</span>
          </h1>
          <p
            className="animate-rise-in mt-5 max-w-prose text-pretty text-base leading-relaxed text-muted-foreground"
            style={{ animationDelay: "120ms" }}
          >
            CodeWeaver 将你的资料解析、分块并抽取为实体关系图谱，再通过混合检索为每一次提问找到最相关的上下文。
          </p>

          <div
            className="animate-rise-in mt-8 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "180ms" }}
          >
            <Button
              asChild
              size="lg"
              className="group gap-2 transition-transform active:scale-[0.98]"
            >
              <Link href="/chat">
                开始对话
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Link
              href="/knowledge"
              className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              浏览知识库
            </Link>
          </div>

          {/* Mono stat strip with tabular numerals. */}
          <dl
            className="animate-rise-in mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-6 tabular-nums"
            style={{ animationDelay: "240ms" }}
          >
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tracking-tight">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Feature bento — asymmetric, not three equal columns. */}
        <section className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          {features.map((feature, index) => (
            <article
              key={feature.title}
              style={{ animationDelay: `${300 + index * 70}ms` }}
              className={`group animate-rise-in relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors duration-300 hover:border-primary/40 ${feature.className}`}
            >
              {feature.accent && (
                <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80" />
              )}
              <div className="relative flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:-translate-y-0.5">
                  <feature.icon className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
