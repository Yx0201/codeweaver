# Code Conventions —— 代码约定

> 所有约定必须标注:置信度（high/medium/low）、来源、最后验证时间。
> 修改此文件必须经人类确认（settings.json 已设为 deny,需人工操作）。

## 索引

- [CONV-001] Next.js App Router + Server Components 优先
- [CONV-002] Client Components 放 _components/ 子目录
- [CONV-003] Server Actions 集中在 src/actions/
- [CONV-004] 数据读取在 Server Component 中直接用 Prisma
- [CONV-005] 变更操作使用 useActionState + Server Actions
- [CONV-006] AI/流式交互走 Route Handler (src/app/api/)
- [CONV-007] Tailwind CSS 4 + shadcn/ui 纯 utility class 样式
- [CONV-008] 原生 fetch 调用,无 axios 封装
- [CONV-009] 无全局状态管理库,组件级 useState/useRef
- [CONV-010] 错误处理:优雅降级 + console.error + fallback
- [CONV-011] Prisma Raw SQL 用于 pgvector/tsvector 操作
- [CONV-012] 函数命名:named export function,驼峰命名
- [CONV-013] 路径别名统一使用 @/ 指向 src/
- [CONV-014] revalidatePath 用于 Server Action 后刷新数据
- [CONV-015] Prisma 外键必须用 connect 语法
- [CONV-016] 组件文件 PascalCase,lib 文件 kebab-case

## 约定详情

### [CONV-001] Next.js App Router + Server Components 优先

- **内容**: page.tsx 默认为 Server Component,仅在需要交互时添加 "use client"
- **证据**: 6 个 page.tsx 中,仅 src/app/page.tsx 标记 "use client"（首页计划重构为交互页,见 DEC-001);其余 5 个均为 Server Component,直接调用 Prisma 查数据
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-002] Client Components 放 _components/ 子目录

- **内容**: 路由级 Client Component 放在对应路由的 _components/ 子目录中
- **证据**: src/app/chat/_components/ (3个), src/app/knowledge/_components/ (2个), src/app/knowledge/[id]/_components/ (2个),全部 "use client"
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-003] Server Actions 集中在 src/actions/

- **内容**: 所有 "use server" 的 Server Actions 放在 src/actions/ 目录,按资源类型分文件
- **证据**: src/actions/conversation.ts (3个 actions), src/actions/knowledge.ts (6个 actions),均顶部声明 "use server"
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-004] 数据读取在 Server Component 中直接用 Prisma

- **内容**: 读操作在 page.tsx (Server Component) 中直接 import prisma 查询,不通过 API 或 Server Action
- **证据**: chat/page.tsx, chat/[conversationId]/page.tsx, knowledge/page.tsx, knowledge/[id]/page.tsx 均直接导入 prisma 查数据
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-005] 变更操作使用 useActionState + Server Actions

- **内容**: 表单提交和删除等变更操作使用 useActionState 绑定 Server Action,Server Action 末尾调用 revalidatePath
- **证据**: 4 个文件使用 useActionState: knowledge-base-card.tsx, create-knowledge-dialog.tsx, file-list.tsx, conversation-sidebar.tsx
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-006] AI/流式交互走 Route Handler (src/app/api/)

- **内容**: AI 对话、流式响应、外部服务集成使用 Route Handler,不使用 Server Actions
- **证据**: api/chat/route.ts (streamText + generateText), api/vector-search/route.ts, api/knowledge/[id]/upload/route.ts (NDJSON stream), api/system-prompt/route.ts
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-007] Tailwind CSS 4 + shadcn/ui 纯 utility class 样式

- **内容**: 全项目使用 Tailwind utility class,UI 组件使用 shadcn/ui (基于 radix-ui),无 CSS Modules / styled-components
- **证据**: 326 处 className= 用法,分布在 37 个 .tsx 文件中;仅 layout.tsx 导入 globals.css;components/ui/ 下 20+ 个 shadcn 组件;package.json 含 radix-ui, tailwind-merge, class-variance-authority
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-008] 原生 fetch 调用,无 axios 封装

- **内容**: 所有 HTTP 请求使用原生 fetch API,无 axios 或其他 HTTP 库
- **证据**: 9 处 fetch() 调用;package.json 无 axios 依赖;lib 层(embedding.ts, reranker.ts)和客户端组件均直接 fetch
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-009] 无全局状态管理库,组件级 useState/useRef

- **内容**: 无 Redux / Zustand / Jotai 等全局状态管理;状态通过 useState / useRef 在组件内管理,聊天使用 @ai-sdk/react 的 useChat hook
- **证据**: 99 处 useState/useEffect/useRef/useCallback,分布在 11 个 client component 文件;package.json 无状态管理库依赖;useChat 管理对话状态
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-010] 错误处理:优雅降级 + console.error + fallback

- **内容**: lib 层的可选功能(reranker/graph-search/query-rewriter)采用 try-catch + console.error + fallback 降级;不会因可选服务不可用而中断主流程
- **证据**: reranker.ts 返回 fallbackResults;hybrid-search.ts 捕获 graph search 错误后跳过;graph-extractor.ts 返回空数组;query-rewriter.ts 返回原始查询。共 6 处 try-catch 在 src/lib/
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-011] Prisma Raw SQL 用于 pgvector/tsvector 操作

- **内容**: pgvector 向量搜索和 pgjieba tsvector 操作使用 $queryRawUnsafe / $executeRawUnsafe,因为 Prisma 不原生支持这些类型
- **证据**: 11 处 Raw SQL 调用,分布在 hybrid-search.ts, keyword-search.ts, graph-search.ts, vector-search.ts, upload/route.ts
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-012] 函数命名:named export function,驼峰命名

- **内容**: 导出函数使用 `export (async) function camelCase()` 形式;组件使用 PascalCase;无箭头函数导出风格
- **证据**: 40 处 `export function` / `export async function` / `export default function`;无 `export const xxx = () =>` 风格
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-013] 路径别名统一使用 @/ 指向 src/

- **内容**: 所有内部导入使用 @/ 路径别名,无相对路径
- **证据**: 29+ 处 `import ... from "@/..."`;tsconfig.json 配置 paths: {"@/*": ["./src/*"]}
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-014] revalidatePath 用于 Server Action 后刷新数据

- **内容**: 每个变更型 Server Action 末尾调用 revalidatePath 触发页面重新渲染
- **证据**: 7 处 revalidatePath 调用,分布在 conversation.ts 和 knowledge.ts;无 revalidateTag 使用
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-015] Prisma 外键必须用 connect 语法

- **内容**: 创建关联记录时使用 `{ connect: { id: xxx } }` 而非直接设外键字段
- **证据**: conversation.ts:19 `knowledge_base: { connect: { id: knowledgeBaseId } }`;PROJECT_STATUS.md 明确记录此踩坑
- **置信度**: high
- **来源**: 考古推断 + 项目文档 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认

### [CONV-016] 组件文件 PascalCase,lib 文件 kebab-case

- **内容**: React 组件文件使用 kebab-case 文件名但 PascalCase 导出名;src/lib/ 下使用 kebab-case 文件名和 camelCase 函数名
- **证据**: app-sidebar.tsx → AppSidebar, chat-interface.tsx → ChatInterface;lib 目录: hybrid-search.ts, vector-search.ts, graph-search.ts 等
- **置信度**: high
- **来源**: 考古推断 + 人工确认
- **最后验证**: 2026-04-19
- **状态**: 已确认
