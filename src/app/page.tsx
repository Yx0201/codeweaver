"use client";

import { Sparkles, Zap, Shield, Code } from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI 驱动",
    description: "利用先进的 AI 技术提升开发效率",
  },
  {
    icon: Zap,
    title: "极速响应",
    description: "毫秒级的响应速度，流畅的交互体验",
  },
  {
    icon: Shield,
    title: "安全可靠",
    description: "企业级安全保障，数据隐私保护",
  },
  {
    icon: Code,
    title: "开箱即用",
    description: "丰富的组件库，快速构建应用",
  },
];

export default function HomePage() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-12">
          <h1 className="text-4xl font-bold mb-4">
            欢迎来到 CodeWeaver
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            一个现代化的 AI Native 应用框架，帮助开发者快速构建智能应用
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-6 border border-border rounded-lg hover:border-primary transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
