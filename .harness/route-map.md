# Route Map —— 页面路由地图

> 每个页面一个 section,section ID 对应 route-map.index.md 的索引。
> 任务结束后由 project-preview skill 增量更新。

## 页面列表

### [ROUTE-001] /

**文件位置**: src/app/page.tsx (client component)

**功能描述**:
- 首页/AI 问答体验页，用户可直接与本地 Ollama LLM 对话
- 空状态：品牌引导 + 4 个快捷问题 Chip
- 消息列表：用户/AI 消息气泡，流式打字机效果（MessageResponse）
- 加载动画：三点弹跳（submitted 状态）
- 固定底部输入框：PromptInput + stop 支持
- 背景装饰：四个特性图标 opacity-[0.04] 散布四角
- 无数据库持久化，刷新清空

**关联模块**: ai-elements (Conversation/Message/PromptInput), api/chat, useChat (@ai-sdk/react)

**考古补全**:
- [git] a76711a 中创建（静态展示页）

**历史任务总结**:
- [TASK-001 2026-04-19] 全量重写为 AI 问答体验页：useChat 流式对话 + ai-elements 组件 + 空状态引导；不传 conversationId 跳过 DB 写入

---

### [ROUTE-002] /chat

**文件位置**: src/app/chat/page.tsx

**功能描述**:
- 新对话入口页,加载所有知识库列表
- 渲染 ChatShell 组件（含侧边栏 + ChatInterface）
- Server Component: 直接查询 Prisma 获取对话列表和知识库

**关联模块**: ChatShell, ChatInterface, ConversationSidebar, conversation actions, knowledge actions

**考古补全**:
- [git] a76711a 首次添加
- [git] 68f82e6 修复聊天历史、新对话重置、布局溢出

---

### [ROUTE-003] /chat/[conversationId]

**文件位置**: src/app/chat/[conversationId]/page.tsx

**功能描述**:
- 已有对话的详情页,加载该对话的历史消息
- Server Component: 通过 Prisma 查询对话和关联消息
- 传入 initialMessages 给 ChatShell

**关联模块**: ChatShell, ChatInterface, conversation actions, knowledge actions

**考古补全**:
- [git] a76711a 首次添加
- [git] a9177ee 修复 ref.current 修改时机

---

### [ROUTE-004] /knowledge

**文件位置**: src/app/knowledge/page.tsx

**功能描述**:
- 知识库列表页,展示所有知识库卡片
- 支持创建新知识库（CreateKnowledgeDialog）

**关联模块**: KnowledgeBaseCard, CreateKnowledgeDialog, knowledge actions

**考古补全**:
- [git] a76711a 首次添加

---

### [ROUTE-005] /knowledge/[id]

**文件位置**: src/app/knowledge/[id]/page.tsx

**功能描述**:
- 知识库详情页,展示已上传文件列表
- 支持上传新文件（UploadFileButton）
- 支持删除知识库和文件

**关联模块**: FileList, UploadFileButton, knowledge actions

**考古补全**:
- [git] a76711a 首次添加

---

### [ROUTE-006] /knowledge/[id]/files/[fileId]

**文件位置**: src/app/knowledge/[id]/files/[fileId]/page.tsx

**功能描述**:
- 文件详情/预览页

**关联模块**: knowledge actions

**考古补全**:
- [git] a76711a 首次添加

---

## API 路由列表

### [API-001] POST /api/chat

**文件位置**: src/app/api/chat/route.ts

**功能描述**:
- 核心对话 API,支持 stream（默认）和 eval 两种模式
- 接收消息后执行 RAG 管线: 查询改写 → 混合检索 → System Prompt → LLM 生成
- 流式模式自动保存 user/assistant 消息到 DB
- 支持 UIMessage 和 SimpleMessage 两种输入格式

**关联模块**: hybrid-search, rag-service, model, prisma, query-rewriter, config

---

### [API-002] POST /api/vector-search

**文件位置**: src/app/api/vector-search/route.ts

**功能描述**:
- 独立搜索 API,供前端和评估脚本调用
- 底层调用 hybridSearch,支持全部检索参数

**关联模块**: hybrid-search, config

---

### [API-003] POST /api/knowledge/[id]/upload

**文件位置**: src/app/api/knowledge/[id]/upload/route.ts

**功能描述**:
- 文件上传 + 父子分块 + 向量嵌入管线
- 流式 NDJSON 返回进度
- 父chunk: 1000/200,子chunk: 500/100
- 子chunk 生成 embedding + tsvector

**关联模块**: embedding, prisma, @langchain/textsplitters

---

### [API-004] PATCH /api/conversations/[id]/kb

**文件位置**: src/app/api/conversations/[id]/kb/route.ts

**功能描述**:
- 更新对话关联的知识库和搜索模式

---

### [API-005] PATCH /api/conversations/[id]/title

**文件位置**: src/app/api/conversations/[id]/title/route.ts

**功能描述**:
- 更新对话标题

---

### [API-006] GET /api/files/[fileId]

**文件位置**: src/app/api/files/[fileId]/route.ts

**功能描述**:
- 获取文件内容/下载

---

### [API-007] POST /api/system-prompt

**文件位置**: src/app/api/system-prompt/route.ts

**功能描述**:
- 根据检索到的上下文构建 RAG system prompt
