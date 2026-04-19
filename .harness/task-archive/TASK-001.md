# TASK-001: 首页重写为 AI 对话体验页

## 基本信息

- **任务 ID**: TASK-001
- **日期**: 2026-04-19
- **级别**: Standard
- **涉及文件**: `src/app/page.tsx`
- **涉及模块**: homepage

## 需求摘要

将静态展示首页全量重写为可交互的 AI 对话首页，包含：
- 背景装饰层（Lucide 图标，pointer-events-none）
- 空状态引导（品牌标题 + 4 个快捷问题 Button）
- 消息列表（Fragment 遍历，用户/AI 消息区分布局）
- 加载中跳动三点动画
- 固定底部输入框（PromptInput + PromptInputSubmit with stop 支持）

## 关键实现决策

1. **useChat 不传 conversationId**：`sendMessage({ text: q })` 无需 body，API 会自动跳过数据库写入
2. **status 直接传入 PromptInputSubmit**：`useChat` 返回的 `status` 类型与 `PromptInputSubmit` 的 `status?: ChatStatus` 兼容，无需 normalize（chat-interface 中的 normalize 是历史遗留）
3. **快捷问题点击不走受控 input**：直接调用 `sendMessage({ text: q })`，绕过输入框
4. **disabled 条件**：`!input.trim() && status === "ready"` — 生成中不禁用（此时显示停止按钮）

## 踩坑记录

- `messages.map((message, messageIndex) => ...)` 中如果 `messageIndex` 未使用，TypeScript 可能报 `noUnusedLocals` 错误，直接省略第二参数

## 模式观察

- `page.tsx` 标记 `"use client"` 是项目唯一允许的首页 client 模式（见 CONV-001）
- 消息渲染用 `Fragment` + `message.parts` switch，与 chat-interface 保持一致
- 头像用 `w-8 h-8 rounded-2xl` div（非 img），颜色区分角色

## 刻意保留的设计

- 四个品牌特性图标（Sparkles/Zap/Shield/Code）以 `opacity-[0.04]` 绝对定位保留——既保留品牌调性，又不干扰阅读
- `Conversation` 组件用 `min-h-0` 而非 `h-full`，因为 `Conversation` 自身是 `flex-1`，外层给 flex-col 即可
- `disabled={!input.trim() && status === "ready"}` 而非 `!input.trim()`——确保流式输出中按钮始终可点击（触发 stop）

## 刻意没做的事

- **没有持久化**：首页对话不存数据库，刷新即清空。完整持久化对话走 `/chat` 路由
- **没有知识库选择**：首页定位为"快速体验"，不需要 RAG 功能，保持输入框简洁
- **没有消息操作栏（MessageActions）**：首页不需要复制/重试功能
- **没有新建文件**：所有逻辑集中在单个 page.tsx，~150 行内完成

## 用户纠正 AI 的地方

（本次任务未发生明显纠正，流程按 spec 顺利执行）

## gap-check 提炼的关键知识

- `Conversation` 组件内部硬编码 `overflow-y-hidden`，外层 `overflow-auto` 不破坏其滚动机制
- `PromptInputSubmit.onStop` prop 名称已核实（来自 ai-elements 源码）
- `useChat` 的 `status: ChatStatus` 类型与 `PromptInputSubmit` 的 `status?: ChatStatus` 直接兼容，无需 normalize

## E2E 验证结果

**第三次运行 — 全部通过（9/9 PASS）**，执行时间 2026-04-19，模型: qcwind/qwen3-8b-instruct-Q4-K-M:latest

| AC | 状态 | 关键证据 |
|----|------|---------|
| AC-1 空状态引导 | PASS | h1 + 4 个 rounded-full 按钮 DOM 确认 |
| AC-2 用户消息气泡 | PASS | flex-row-reverse + bg-sky-300 头像 |
| AC-3 三点加载动画 | PASS | 3 个 `.animate-bounce` 在 submitted 状态出现 |
| AC-4 流式打字机效果 | PASS | 12 秒内文本从 0 增长至 1175 字符 |
| AC-5 流式期间停止按钮 | PASS | `button[aria-label="Stop"]` SquareIcon 全程存在 |
| AC-6 快捷问题 Chip | PASS | 点击直接发送，textarea 保持为空 |
| AC-9 刷新清空历史 | PASS | 刷新后空状态重现，消息归零 |
| AC-10 背景装饰透明度 | PASS | computed opacity=0.04, pointer-events-none |
| AC-11 侧边栏不破坏 | PASS | nav 存在，3 个导航项正常 |

截图存档: /tmp/e2e-01-empty.png 至 /tmp/e2e-ac5-stop-btn.png（共 8 张）

## E2E 发现的环境问题（已修复）

1. **Prisma 客户端未生成**（第一次阻断）
   - 原因: `prisma/schema.prisma` 配置了自定义输出路径 `output = "../src/generated/prisma"`，但 `prisma generate` 从未执行
   - 修复: `pnpm dlx prisma generate`
   - 建议: 项目 README 或 package.json `postinstall` 中添加此步骤

2. **`.env.local` 缺失**（第二次阻断）
   - 原因: `LOCAL_MODEL_SIGNAL` 未配置，模型回退为空字符串，Ollama 报 400 错误
   - 修复: 创建 `.env.local` 并配置完整环境变量（LOCAL_MODEL_SIGNAL、DATABASE_URL 等）
   - 建议: 项目中添加 `.env.example` 文件，列出所有必填环境变量

## 遗留问题

- 现有文件（chat/page.tsx, knowledge/page.tsx 等）有 `implicit any` TypeScript 错误，属于技术债，与本次任务无关
- qwen3:8b 本地模型对项目专有名词（"CodeWeaver 功能"）无上下文，答案可能偏差——这是无 RAG 首页的预期行为，完整 RAG 体验需跳转 /chat 并选择知识库
- 建议添加 `.env.example` 让新开发者快速上手
