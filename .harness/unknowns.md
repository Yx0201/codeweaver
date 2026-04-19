# Unknowns —— 待澄清清单

> 所有 AI 无法确定需要人类回答的问题。

### [UNK-001] SearchMode 枚举的业务含义

- **位置**: src/actions/conversation.ts:6
- **问题**: `SearchMode = "hybrid" | "graph" | "fast"` — "fast" 模式具体是什么检索策略？
- **AI 的猜测**: fast 可能是无 reranker 的轻量混合检索
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: AI 猜测正确。fast = 无 reranker 的轻量混合检索,速度快精度低。

### [UNK-002] 文件 status 生命周期

- **位置**: src/app/api/knowledge/[id]/upload/route.ts:70
- **问题**: uploaded_files.status 是否单向流转？有无回退场景？
- **AI 的猜测**: 单向流转 uploaded → processing → completed/failed,无回退
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: AI 猜测正确。单向流转,重新处理就删除重传。

### [UNK-003] entity_type 枚举是否可扩展

- **位置**: src/lib/graph-extractor.ts:11
- **问题**: 5 种实体类型是否足够？是否计划支持自定义实体类型？
- **状态**: pending
- **创建时间**: 2026-04-19

### [UNK-004] chat-interface 中的 `as any` 类型强转

- **位置**: src/app/chat/_components/chat-interface.tsx:113
- **问题**: `messages: initialMessages as any` 为何需要 as any？
- **AI 的猜测**: SDK 类型不完全匹配的临时方案
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: AI 猜测正确。@ai-sdk/react useChat 类型与自定义 InitialMessage 不匹配,临时方案。

### [UNK-005] persistSettings 的 fire-and-forget 模式

- **位置**: src/app/chat/_components/chat-interface.tsx:93-97
- **问题**: `.catch(() => {})` 静默吞错误是刻意设计还是遗留？
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: 刻意设计。知识库绑定/搜索模式变更不是关键操作,失败不影响当前对话。

### [UNK-006] Reranker 30s 超时注释提到 "Rosetta emulation is slow"

- **位置**: src/lib/reranker.ts:33
- **问题**: 是否仍在使用 Rosetta 运行 reranker？30s 超时是否合理？
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: 可能已不再使用 Rosetta,30s 是保守值。

### [UNK-007] 首页 page.tsx 为何标记 "use client"

- **位置**: src/app/page.tsx:1
- **问题**: 首页是纯展示页,为何标记 "use client"？
- **AI 的猜测**: 可能是早期误加
- **状态**: resolved
- **创建时间**: 2026-04-19
- **回答**: **刻意保留**。首页计划重构为可交互的对话页面,目前尚未开始开发,提前标记 "use client" 是为后续重构准备。

### [UNK-008] 图谱可视化的优先级和方案

- **位置**: PROJECT_STATUS.md
- **问题**: @antv/g6 图谱可视化的优先级如何？
- **状态**: pending
- **创建时间**: 2026-04-19

### [UNK-009] 环境变量 LOCAL_MODEL_SIGNAL 的命名

- **位置**: src/register/model.ts:8
- **问题**: 为何叫 "SIGNAL" 而不是 "NAME" 或 "ID"？
- **状态**: pending
- **创建时间**: 2026-04-19
