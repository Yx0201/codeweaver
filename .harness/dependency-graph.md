# Module Dependency Graph

> 模块间依赖关系。用于跨模块影响面分析。

## 索引

| 模块 | 依赖于 | 被依赖 | 修改风险 |
|-----|--------|--------|---------|
| config | - | hybrid-search, vector-search, api/chat, api/vector-search, graph-extractor, model | high |
| prisma | - | hybrid-search, graph-search, conversation actions, knowledge actions, api/chat, api/upload | high |
| embedding | config (OLLAMA_BASE_URL) | hybrid-search, graph-search, api/upload | high |
| hybrid-search | vector-search, keyword-search, graph-search, reranker, query-rewriter, embedding, prisma, config | api/chat, api/vector-search | high |
| vector-search | embedding, prisma | hybrid-search | medium |
| keyword-search | prisma | hybrid-search | medium |
| graph-search | prisma, embedding, graph-extractor | hybrid-search | medium |
| graph-extractor | config (OLLAMA_BASE_URL), zod | graph-search, api/upload (计划中) | medium |
| reranker | config (RERANKER_URL) | hybrid-search | low |
| query-rewriter | config | hybrid-search | low |
| rag-service | - | api/chat, api/system-prompt | low |
| model (register) | config (env vars) | api/chat | medium |
| conversation actions | prisma | chat pages, ChatInterface | medium |
| knowledge actions | prisma | knowledge pages | medium |
| homepage (/) | ai-elements, api/chat, @ai-sdk/react | - | low |

## 详细依赖

### config

- **文件位置**: src/lib/config.ts
- **依赖**: 无（纯常量 + 环境变量）
- **被依赖**: 几乎所有 lib 模块和 API route
- **修改风险**: high — 改参数影响全局检索效果

### hybrid-search

- **文件位置**: src/lib/hybrid-search.ts
- **依赖**:
  - vector-search (向量检索)
  - keyword-search (关键词检索)
  - graph-search (可选,图谱检索)
  - reranker (可选,cross-encoder 重排)
  - query-rewriter (可选,查询改写)
  - embedding (向量生成)
  - prisma (父子chunk解析)
  - config (Top-K 参数)
- **被依赖**:
  - api/chat (核心调用)
  - api/vector-search (独立搜索 API)
- **修改风险**: high — RAG 管线核心,改动影响所有检索结果

### embedding

- **文件位置**: src/lib/embedding.ts
- **依赖**:
  - config (OLLAMA_BASE_URL, EMBEDDING_MODEL)
- **被依赖**:
  - hybrid-search (查询向量化)
  - graph-search (实体名称向量匹配)
  - api/upload (文档向量化)
- **修改风险**: high — 影响向量检索质量和上传管线

### graph-search

- **文件位置**: src/lib/graph-search.ts
- **依赖**:
  - prisma (图数据查询)
  - embedding (实体名称向量匹配)
  - graph-extractor (查询实体抽取)
- **被依赖**:
  - hybrid-search (可选的图谱检索通道)
- **修改风险**: medium — 仅影响图谱检索模式

### graph-extractor

- **文件位置**: src/lib/graph-extractor.ts
- **依赖**:
  - config (OLLAMA_BASE_URL)
  - zod (结构化输出校验)
  - ollama-ai-provider-v2 (qwen3:8b 模型)
- **被依赖**:
  - graph-search (查询实体抽取)
- **修改风险**: medium — 影响实体抽取质量

### model (register)

- **文件位置**: src/register/model.ts
- **依赖**:
  - 环境变量 (LOCAL_MODEL_BASE_URL, LOCAL_MODEL_SIGNAL)
  - ollama-ai-provider-v2
- **被依赖**:
  - api/chat (主对话模型)
- **修改风险**: medium — 改模型影响全部对话质量
