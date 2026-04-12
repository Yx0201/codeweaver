# CodeWeaver 项目状态文档

> 最后更新：2026-04-12
> 本文档旨在为新会话提供完整的项目上下文，避免因对话窗口限制丢失关键信息。

---

## 1. 项目概述

CodeWeaver 是一个本地优先的 RAG（检索增强生成）知识库系统，用户可上传文档、创建知识库、通过 AI 对话进行知识问答。

**技术栈：**
- 前端：Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui
- 数据库：PostgreSQL + pgvector (1024维向量) + pgjieba (中文分词)
- ORM：Prisma 7 + `@prisma/adapter-pg`
- AI/LLM：Vercel AI SDK + Ollama (本地模型) + 智谱AI (云端评分)
- Reranker：本地 Python FastAPI 服务 (bge-reranker-v2-m3)
- 评估：Python ragas 框架

---

## 2. 系统架构

### 2.1 检索管线

```
用户查询
  ↓
[可选] 查询改写 (qwen3:0.6b) — rewrite / hyde / expand 三种模式
  ↓
并行搜索 ──→ 向量搜索 (bge-m3, pgvector HNSW, cosine)
         ──→ 关键词搜索 (pgjieba tsvector + OR模式)
         ──→ [可选] 图谱搜索 (实体匹配→1-2跳遍历→关联chunk)
  ↓
RRF 融合 (k=60, 取 fusionTopK=30 条)
  ↓
[可选] Cross-encoder 重排序 (bge-reranker-v2-m3, 取 rerankerTopK=10 条)
  ↓
子chunk → 父chunk 解析 (去重，保留最高分)
  ↓
构建 System Prompt → LLM 生成回答
```

### 2.2 分块策略（父子分块）

| 参数 | 父chunk | 子chunk |
|------|---------|---------|
| chunkSize | 1000 | 500 |
| chunkOverlap | 200 | 100 |
| 用途 | LLM 上下文 | 检索单元 |
| 是否做嵌入 | 否 | 是 |
| 是否做关键词索引 | 否 | 是 |
| chunk_type 字段 | "parent" | "child" |

**注意：** 检索时搜的是子chunk，但最终返回给LLM的是对应的父chunk文本（`resolveParentChunks`）。这样既保证了检索精度，又提供了充分的上下文。

### 2.3 关键配置参数

```typescript
// src/lib/config.ts
OLLAMA_BASE_URL = process.env.LOCAL_MODEL_BASE_URL ?? "http://localhost:11434/api"
RERANKER_URL = process.env.RERANKER_URL ?? "http://localhost:8081"
EMBEDDING_MODEL = "bge-m3:latest"
RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"

DEFAULT_VECTOR_TOP_K = 50
DEFAULT_KEYWORD_TOP_K = 50
DEFAULT_FUSION_TOP_K = 30
DEFAULT_RERANKER_TOP_K = 10
DEFAULT_FINAL_TOP_K = 10
RRF_K = 60
```

---

## 3. 数据库 Schema

### 3.1 核心表

| 表名 | 用途 |
|------|------|
| `knowledge_base` | 知识库 |
| `uploaded_files` | 上传的文件 |
| `document_chunks` | 文档分块（含父子关系、向量、关键词） |
| `conversation` | 对话会话 |
| `conversation_message` | 对话消息 |
| `kg_entity` | 知识图谱实体 |
| `kg_relation` | 知识图谱关系 |
| `kg_entity_chunk` | 实体-分块关联 |

### 3.2 Prisma 与数据库同步注意事项

**⚠️ 关键规则：禁止 `prisma db push`，必须使用 `prisma migrate dev`**

原因：`prisma db push` 会绕过迁移系统，导致：
- 迁移历史不完整
- `ensure-indexes.sql` 中的 HNSW/GIN 索引可能丢失
- 数据库 schema 与 Prisma schema 漂移

**正确的 schema 变更流程：**

```bash
# 1. 修改 prisma/schema.prisma
# 2. 创建迁移
npx prisma migrate dev --name <描述性名称>
# 3. 重新创建索引（prisma migrate 会清空手动索引）
psql -h localhost -U bbimasheep -d knowledge_db -f scripts/ensure-indexes.sql
# 4. 重新上传文件（分块策略变更后必须重新上传）
# 5. 运行评测验证
pnpm eval:recall
```

**当前迁移状态：**
- 正式迁移文件只有 `0_init`（初始 schema）
- `parent_chunk_id`、`chunk_type`、`kg_entity`、`kg_relation`、`kg_entity_chunk` 等字段和表是后来通过 `prisma db push` 添加的，**没有对应的正式迁移文件**
- 如果需要全新部署，需要先 `prisma migrate dev` 创建包含所有变更的迁移，或手动执行 SQL

**Prisma 外键写入注意：**
```typescript
// ❌ 错误：不能直接设置外键字段
await prisma.conversation.create({
  data: { knowledge_base_id: knowledgeBaseId }
});

// ✅ 正确：使用 connect 语法
await prisma.conversation.create({
  data: { knowledge_base: { connect: { id: knowledgeBaseId } } }
});
```

### 3.3 ensure-indexes.sql

`scripts/ensure-indexes.sql` 管理 Prisma 无法处理的索引：

1. `CREATE EXTENSION IF NOT EXISTS vector;` — pgvector 扩展
2. HNSW 向量索引：`document_chunks.embedding` (vector_cosine_ops)
3. GIN 关键词索引：`document_chunks.keywords` (tsvector)
4. HNSW 向量索引：`kg_entity.name_embedding` (vector_cosine_ops)
5. GIN 关键词索引：`kg_entity.name_keywords` (tsvector)

**每次 `prisma migrate dev` 或 `prisma db push` 之后必须重新执行此脚本！**

---

## 4. 本地服务启动

### 4.1 PostgreSQL

确保 PostgreSQL 运行在 `localhost:5432`，数据库名 `knowledge_db`。

```bash
# macOS Homebrew
brew services start postgresql@17
```

### 4.2 Ollama

需要拉取以下模型：

```bash
ollama pull bge-m3:latest          # 嵌入模型 (1024维)
ollama pull qwen3:0.6b             # 查询改写 (轻量快速)
ollama pull qcwind/qwen3-8b-instruct-Q4-K-M:latest  # 主对话模型 + 实体抽取
```

### 4.3 Reranker 服务

```bash
cd scripts/reranker-service
source .venv/bin/activate
python server.py
# 服务启动在 http://localhost:8081
# DEVICE=mps 可使用 Apple Silicon GPU 加速
```

首次启动会下载 `BAAI/bge-reranker-v2-m3` 模型（约 568MB）。

### 4.4 Next.js 应用

```bash
pnpm dev
# 启动在 http://localhost:3000
```

### 4.5 启动顺序

PostgreSQL → Ollama → Reranker 服务 → Next.js

---

## 5. Python 评估环境

### 5.1 安装

```bash
# 一键安装（推荐）
pnpm run setup:python

# 手动安装
cd packages/rag-eval
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 5.2 运行评估

```bash
pnpm eval:recall
```

**前提条件：**
- Next.js 服务运行在 `localhost:3000`
- Reranker 服务运行在 `localhost:8081`（可选，当前评估脚本未启用）
- Ollama 运行并提供 bge-m3 嵌入
- `.env.local` 中配置了 `ZHIPU_API_KEY`、`ZHIPU_BASE_URL`、`ZHIPU_MODEL_NAME`（用于 ragas 评分）

### 5.3 评估脚本关键参数

```python
# packages/rag-eval/eval_recall.py
VECTOR_TOP_K = 50     # 向量搜索返回数
KEYWORD_TOP_K = 50    # 关键词搜索返回数
FINAL_TOP_K = 10      # 最终返回数
```

**⚠️ 已知问题：评估脚本调用 `/api/vector-search` 时未传 `useReranker: true`，也没有传 `useGraph: true`。** 这意味着评估结果不包含 reranker 和图谱搜索的效果。聊天页面默认 `useReranker: true`，所以实际用户体验可能优于评估结果。

### 5.4 评估数据集

路径：`packages/rag-eval/datasets/golden_v1.json`

当前包含 8 个中文小说问答对，每个包含 `user_input`、`reference`、`reference_contexts`。

支持 `--dataset` 参数指定其他数据集文件：
```bash
packages/rag-eval/venv/bin/python packages/rag-eval/eval_recall.py --dataset golden_v2
```

### 5.5 ragas 评估指标

| 指标 | 含义 | 依赖 |
|------|------|------|
| `context_recall` | 检索到的上下文是否包含回答所需的信息 | LLM + reference_contexts |
| `context_precision` | 检索结果中相关条目的排名精度 | LLM |
| `answer_relevancy` | 生成回答与问题的相关性 | LLM + Embeddings |
| `faithfulness` | 生成回答是否忠实于检索到的上下文 | LLM |

评分 LLM 使用智谱 GLM-4，嵌入使用本地 Ollama bge-m3。

---

## 6. 最新评估结果

### 6.1 优化历程

| 阶段 | context_recall | context_precision | answer_relevancy | faithfulness |
|------|---------------|-------------------|-----------------|-------------|
| 基线 (child=300, 无reranker) | 0.42 | 0.45 | - | - |
| +分块调优+Top-K | 0.5714 | 0.4736 | 0.6530 | 0.7822 |
| +child=500+关键词OR模式 | **0.7143** | 0.4422 | 0.5926 | **0.9582** |

### 6.2 逐题分析（最新结果）

| 题目 | recall | precision | relevancy | faithfulness | 备注 |
|------|--------|-----------|-----------|-------------|------|
| Q1: 易飒小时候躲藏 | **0.0** | **0.0** | 0.6735 | 1.0 | 目标chunk仍检索不到 |
| Q2: 宗杭父亲 | 1.0 | 0.2262 | 0.3845 | 1.0 | |
| Q3: 宗杭去柬埔寨 | NaN | NaN | 0.6278 | 0.9286 | GLM-4内容过滤 |
| Q4: 龙宋是谁 | 1.0 | 0.7862 | 0.5730 | 1.0 | |
| Q5: 老市场被打 | **0.0** | **0.0** | 0.6815 | 1.0 | 目标chunk仍检索不到 |
| Q6: 突突车酒吧 | 1.0 | 1.0 | 0.7450 | 1.0 | 完美 |
| Q7: 水鬼三姓 | 1.0 | 0.9167 | 0.6458 | 0.8571 | |
| Q8: 三姓主业 | 1.0 | 0.1667 | 0.4094 | 0.88 | |

### 6.3 关键问题分析

**Q1 和 Q5 的 context_recall=0.0：** 目标chunk在向量搜索中排名很低（Q1的目标chunk排名在200+之外），500字符的子chunk仍然不足以让关键查询词和答案片段出现在同一个chunk中。可能需要：
- 进一步增大子chunk尺寸（如800或1000）
- 或使用更长的嵌入上下文窗口
- 或针对这类"长距离依赖"问题使用 HyDE/查询改写

**context_precision 下降：** Top-K 从 20→50 虽然提高了 recall，但引入了更多不相关结果，拉低了 precision。启用 reranker 可以改善。

**GLM-4 内容过滤：** 智谱 AI 对部分文本内容触发安全过滤（错误码 1301），导致 NaN 分数。这是外部服务限制，无法在代码层面解决。

**answer_relevancy 下降：** 可能因为返回的上下文更长了（父chunk 1000字符），LLM 生成的回答更详尽但偏题。

---

## 7. 已实现功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 混合检索 (向量+关键词) | ✅ | RRF 融合 |
| 父子分块 | ✅ | parent=1000/200, child=500/100 |
| Cross-encoder Reranker | ✅ | bge-reranker-v2-m3, Python FastAPI |
| 查询改写 | ✅ | rewrite / hyde / expand 三种模式 |
| 知识图谱检索 | ✅ | 实体抽取 (qwen3:8b) + 图遍历 |
| 检索模式选择 UI | ✅ | hybrid / vector / keyword 可选 |
| 对话历史回显 | ✅ | 会话管理 + 消息持久化 |
| ragas 评估 | ✅ | 4项指标，8题评估集 |
| System Prompt 优化 | ✅ | 强制引用标注[1][2]，矛盾指出 |
| 图谱可视化 | ❌ | 计划使用 @antv/g6 |

---

## 8. 当前待解决问题

### 8.1 高优先级

1. **评估脚本未启用 reranker：** `eval_recall.py` 的 `hybrid_search()` 没有传 `useReranker: true`，评估结果不反映 reranker 效果。修复：在 `hybrid_search()` 函数的请求体中加 `"useReranker": True`。

2. **Q1/Q5 检索不到目标chunk：** 即使增大了子chunk到500字符，对于"易飒小时候在车里遇到危险时是怎么躲藏的"这种需要跨越多个段落的查询，目标chunk仍排名太低。可能方案：
   - 在评估和实际使用中启用 HyDE 查询改写
   - 增大子chunk到 800-1000 字符
   - 增大 `VECTOR_TOP_K` 到 100+

3. **context_precision 偏低：** 大 Top-K 导致噪声增加。启用 reranker 应该能显著改善。

### 8.2 中优先级

4. **评估数据集只有8题：** 样本量太小，评估结果不稳定。计划扩充到 30-50 题。

5. **Prisma 迁移不完整：** `kg_entity`、`kg_relation`、`kg_entity_chunk` 等表没有正式迁移文件，全新部署时需要手动处理。

6. **图搜索未在评估中测试：** `useGraph` 默认 false，评估脚本也未启用。

### 8.3 低优先级

7. **图谱可视化：** 计划使用 `@antv/g6`，尚未实现。

8. **GLM-4 内容过滤：** 外部服务限制，考虑换用其他评分 LLM。

9. **流式检索缓存：** 尚未实现。

---

## 9. 关键文件索引

| 文件 | 用途 |
|------|------|
| `src/lib/config.ts` | 集中配置（URL、模型名、Top-K） |
| `src/lib/hybrid-search.ts` | 混合检索主逻辑（RRF + reranker + 父子解析） |
| `src/lib/vector-search.ts` | 向量搜索（pgvector cosine） |
| `src/lib/keyword-search.ts` | 关键词搜索（pgjieba OR 模式） |
| `src/lib/graph-search.ts` | 知识图谱检索（实体匹配+图遍历） |
| `src/lib/reranker.ts` | Reranker 调用（FastAPI /rerank） |
| `src/lib/query-rewriter.ts` | 查询改写（rewrite/hyde/expand） |
| `src/lib/graph-extractor.ts` | 实体关系抽取（qwen3:8b + Zod） |
| `src/lib/rag-service.ts` | RAG System Prompt 构建 |
| `src/lib/embedding.ts` | 嵌入生成（Ollama bge-m3） |
| `src/app/api/chat/route.ts` | 对话 API（流式 + eval 模式） |
| `src/app/api/vector-search/route.ts` | 向量搜索 API |
| `src/app/api/knowledge/[id]/upload/route.ts` | 文件上传+分块+嵌入 |
| `src/app/chat/_components/chat-interface.tsx` | 聊天界面 |
| `packages/rag-eval/eval_recall.py` | ragas 评估脚本 |
| `packages/rag-eval/datasets/golden_v1.json` | 评估数据集 |
| `scripts/ensure-indexes.sql` | 数据库索引维护 |
| `scripts/reranker-service/server.py` | Reranker 微服务 |

---

## 10. 环境变量

在 `.env.local` 中配置（不要提交到 Git）：

```env
# 数据库
DATABASE_URL=postgresql://bbimasheep:@localhost:5432/knowledge_db?schema=public

# Ollama
LOCAL_MODEL_BASE_URL=http://localhost:11434/api
LOCAL_MODEL_SIGNAL=qcwind/qwen3-8b-instruct-Q4-K-M:latest
LOCAL_EMBEDDING_MODEL=bge-m3:latest
LOCAL_OLLAMA_BASE_URL=http://localhost:11434

# Reranker
RERANKER_URL=http://localhost:8081

# 智谱AI（用于 ragas 评分）
ZHIPU_API_KEY=<your-key>
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
ZHIPU_MODEL_NAME=glm-4

# 数据库直连（eval 脚本用）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=knowledge_db
DB_USER=bbimasheep
DB_PASSWORD=
```

---

## 11. 关键经验与踩坑记录

1. **关键词搜索必须用 OR 模式：** `plainto_tsquery('jiebacfg', query)` 默认生成 AND 模式（所有词都要匹配），对于 500 字的子chunk，多词查询几乎不可能全部命中。改为 OR 模式：`replace(plainto_tsquery('jiebacfg', $1)::text, ' & ', ' | ')::tsquery`。

2. **Prisma 不能直接设置外键字段：** 创建关联记录时必须用 `connect` 语法，否则报 `PrismaClientValidationError`。

3. **pgvector HNSW 索引会被 prisma migrate 清除：** 每次 migrate 后必须重新执行 `ensure-indexes.sql`。

4. **bge-m3 推荐输入 512-1024 tokens：** 对中文约 500-1000 字符。子chunk 300 字太少，500 字是目前的选择，但对于长距离依赖问题可能仍不够。

5. **Ollama 不支持 reranker：** 没有 `/api/rerank` 端点。必须使用独立服务（当前是 Python FastAPI + sentence_transformers.CrossEncoder）。

6. **qwen3 模型输出包含 `<think/>` 标签：** 解析 JSON 时需要先提取 `{...}` 部分，忽略思考过程。

7. **Reranker 降级策略：** 如果 reranker 服务不可用，`rerank()` 函数会 fallback 到原始顺序，不会阻断整个检索流程。
